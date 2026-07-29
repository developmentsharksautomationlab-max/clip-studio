import type { ClipCandidate, TranscriptSegment, TranscriptWord } from "./types";

export interface TimeRange {
  start: number;
  end: number;
}

export interface TrimPlan {
  keepRanges: TimeRange[];
}

const FILLER_WORDS = new Set([
  "um", "umm", "uh", "uhh", "uhm", "erm", "hmm", "mm", "mhm", "huh",
]);

const MIN_GAP_SECONDS = 0.9;
const GAP_EDGE_PAD = 0.15;
const MERGE_EPSILON = 0.05;
const MIN_OUTPUT_SECONDS = 3;
// Safety cap: an extremely fragmented trim (hundreds of tiny cuts) would
// produce a huge, fragile ffmpeg filter_complex graph, so past this many
// segments it's safer to skip trimming for this clip than risk the render.
const MAX_KEEP_RANGES = 400;

function isFillerWord(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z]/g, "");
  return normalized.length > 0 && FILLER_WORDS.has(normalized);
}

function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + MERGE_EPSILON) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

// Builds the list of time ranges to KEEP (in source-absolute seconds) by
// cutting filler words and long silent gaps out of a clip candidate. Returns
// null when there's nothing worth trimming, so callers can fall back to a
// plain, cheaper cut.
export function computeTrimPlan(
  candidate: ClipCandidate,
  removeFillers: boolean
): TrimPlan | null {
  if (!removeFillers) return null;

  const words = candidate.segments.flatMap((s) => s.words);
  if (words.length === 0) return null;

  const removals: TimeRange[] = [];

  for (const word of words) {
    if (isFillerWord(word.text)) {
      removals.push({ start: word.start, end: word.end });
    }
  }

  let previousEnd = candidate.start;
  for (const word of words) {
    const gap = word.start - previousEnd;
    if (gap > MIN_GAP_SECONDS) {
      const start = previousEnd + GAP_EDGE_PAD;
      const end = word.start - GAP_EDGE_PAD;
      if (end > start) removals.push({ start, end });
    }
    previousEnd = Math.max(previousEnd, word.end);
  }
  const tailGap = candidate.end - previousEnd;
  if (tailGap > MIN_GAP_SECONDS) {
    const start = previousEnd + GAP_EDGE_PAD;
    const end = candidate.end - GAP_EDGE_PAD;
    if (end > start) removals.push({ start, end });
  }

  if (removals.length === 0) return null;

  const merged = mergeRanges(removals);

  const keepRanges: TimeRange[] = [];
  let cursor = candidate.start;
  for (const removal of merged) {
    const clampedStart = Math.max(candidate.start, removal.start);
    const clampedEnd = Math.min(candidate.end, removal.end);
    if (clampedStart > cursor) {
      keepRanges.push({ start: cursor, end: clampedStart });
    }
    cursor = Math.max(cursor, clampedEnd);
  }
  if (cursor < candidate.end) {
    keepRanges.push({ start: cursor, end: candidate.end });
  }

  const filtered = keepRanges.filter((r) => r.end - r.start > 0.02);
  if (filtered.length === 0 || filtered.length > MAX_KEEP_RANGES) return null;

  const totalKept = filtered.reduce((sum, r) => sum + (r.end - r.start), 0);
  if (totalKept < MIN_OUTPUT_SECONDS) return null;

  const isNoOp =
    filtered.length === 1 &&
    filtered[0].start <= candidate.start + 0.02 &&
    filtered[0].end >= candidate.end - 0.02;
  if (isNoOp) return null;

  return { keepRanges: filtered };
}

export function outputDuration(keepRanges: TimeRange[]): number {
  return keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0);
}

function remapTime(keepRanges: TimeRange[], t: number): number {
  let cumulative = 0;
  for (const range of keepRanges) {
    if (t <= range.end) {
      return cumulative + Math.max(0, t - range.start);
    }
    cumulative += range.end - range.start;
  }
  return cumulative;
}

function findRangeIndex(keepRanges: TimeRange[], t: number): number {
  return keepRanges.findIndex((r) => t >= r.start - 0.01 && t <= r.end + 0.01);
}

// Rebuilds a candidate whose word/segment timestamps are remapped onto the
// trimmed output's own 0-based timeline, dropping any words that fall inside
// a removed range (filler words, trimmed silence) so captions never show
// text for audio/video that was cut.
export function remapCandidateForOutput(
  candidate: ClipCandidate,
  keepRanges: TimeRange[]
): ClipCandidate {
  const remappedSegments: TranscriptSegment[] = [];

  for (const segment of candidate.segments) {
    const words: TranscriptWord[] = [];
    for (const word of segment.words) {
      if (findRangeIndex(keepRanges, word.start) === -1) continue;
      words.push({
        start: remapTime(keepRanges, word.start),
        end: remapTime(keepRanges, word.end),
        text: word.text,
      });
    }
    if (words.length === 0) continue;
    remappedSegments.push({
      start: words[0].start,
      end: words[words.length - 1].end,
      text: segment.text,
      words,
    });
  }

  return {
    ...candidate,
    start: 0,
    end: outputDuration(keepRanges),
    segments: remappedSegments,
  };
}
