import type { ClipCandidate, TranscriptSegment } from "./types";

const DEFAULT_TARGET_CLIP_SECONDS = 40;
const MIN_CLIP_SECONDS = 15;

// Heuristic-only "does this sound like a hook" wordlist — no ML involved,
// just keywords that tend to correlate with punchy, shareable moments. Good
// enough to rank/badge candidates for the user, not meant to be precise.
const HOOK_KEYWORDS = [
  "secret", "never", "always", "best", "worst", "biggest", "mistake", "truth",
  "why", "how", "stop", "nobody", "everyone", "hack", "trick", "warning",
  "shocking", "crazy", "insane", "free", "proven", "guarantee", "wrong",
];

function scoreSegments(segments: TranscriptSegment[]): number {
  const text = segments.map((s) => s.text).join(" ");
  const lower = text.toLowerCase();
  const words = segments.flatMap((s) => s.words);
  const duration = words.length > 0 ? words[words.length - 1].end - words[0].start : 0;

  let score = 40;
  score += Math.min(20, (text.match(/[!?]/g) ?? []).length * 6);
  score += Math.min(15, (text.match(/\d+/g) ?? []).length * 5);
  score += Math.min(
    20,
    HOOK_KEYWORDS.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0) * 5
  );

  if (duration > 0) {
    const wordsPerSecond = words.length / duration;
    score += Math.max(-10, Math.min(10, Math.round((wordsPerSecond - 2.2) * 8)));
  }

  return Math.max(1, Math.min(99, Math.round(score)));
}

// Plain-language breakdown of scoreSegments()'s heuristic, for the AI
// assistant's explain_clip_score tool — recomputes the same signals rather
// than storing them, so it can never drift out of sync with the actual score.
export function explainScore(segments: TranscriptSegment[]): string {
  const text = segments.map((s) => s.text).join(" ");
  const lower = text.toLowerCase();
  const words = segments.flatMap((s) => s.words);
  const duration = words.length > 0 ? words[words.length - 1].end - words[0].start : 0;
  const exclamations = (text.match(/[!?]/g) ?? []).length;
  const numbers = (text.match(/\d+/g) ?? []).length;
  const hooks = HOOK_KEYWORDS.filter((kw) => lower.includes(kw));
  const wordsPerSecond = duration > 0 ? words.length / duration : 0;

  const notes: string[] = [
    `Base score of 40, adjusted by a few heuristic signals (no ML — just keyword/pace matching):`,
    `- ${exclamations} "!"/"?" mark${exclamations === 1 ? "" : "s"} (+${Math.min(20, exclamations * 6)})`,
    `- ${numbers} number${numbers === 1 ? "" : "s"} mentioned (+${Math.min(15, numbers * 5)})`,
    hooks.length > 0
      ? `- ${hooks.length} hook keyword${hooks.length === 1 ? "" : "s"} detected: ${hooks.join(", ")} (+${Math.min(20, hooks.length * 5)})`
      : `- no hook keywords detected (+0)`,
    `- speaking pace ~${wordsPerSecond.toFixed(1)} words/sec`,
  ];
  return notes.join("\n");
}

function deriveTitle(segments: TranscriptSegment[]): string {
  const text = segments
    .map((s) => s.text)
    .join(" ")
    .trim();
  if (!text) return "";

  const sentenceMatch = text.match(/^.*?[.!?](?=\s|$)/);
  let title = (sentenceMatch ? sentenceMatch[0] : text).trim();
  if (title.length > 70) title = `${title.slice(0, 67).trimEnd()}...`;
  return title;
}

export interface SelectClipCandidatesOptions {
  targetClipCount?: number;
  targetDurationSeconds?: number;
}

export function selectClipCandidates(
  segments: TranscriptSegment[],
  options: SelectClipCandidatesOptions = {}
): ClipCandidate[] {
  const candidates: ClipCandidate[] = [];
  let current: TranscriptSegment[] = [];

  const targetClipSeconds = computeTargetClipSeconds(segments, options);

  const flush = () => {
    if (current.length === 0) return;
    const start = current[0].start;
    const end = current[current.length - 1].end;
    if (end - start >= MIN_CLIP_SECONDS) {
      candidates.push({
        index: candidates.length,
        start,
        end,
        segments: current,
        title: deriveTitle(current),
        score: scoreSegments(current),
      });
    }
    current = [];
  };

  for (const segment of segments) {
    current.push(segment);
    const duration = current[current.length - 1].end - current[0].start;
    if (duration >= targetClipSeconds) {
      flush();
    }
  }
  flush();

  if (candidates.length === 0 && segments.length > 0) {
    candidates.push({
      index: 0,
      start: segments[0].start,
      end: segments[segments.length - 1].end,
      segments,
      title: deriveTitle(segments),
      score: scoreSegments(segments),
    });
  }

  return candidates;
}

function clipSegmentToRange(
  segment: TranscriptSegment,
  start: number,
  end: number
): TranscriptSegment | null {
  const words = segment.words.filter((w) => w.end > start && w.start < end);
  if (words.length === 0) return null;
  return {
    start: words[0].start,
    end: words[words.length - 1].end,
    text: words.map((w) => w.text).join(" "),
    words,
  };
}

// Builds a clip candidate for an arbitrary, caller-chosen time range rather
// than one of the auto-selected candidates above — used by the AI
// assistant's create_clip tool when someone asks for a clip of a specific
// moment (e.g. "cut the part where I talk about pricing").
export function buildCandidateFromRange(
  segments: TranscriptSegment[],
  index: number,
  start: number,
  end: number
): ClipCandidate {
  const included = segments
    .map((s) => clipSegmentToRange(s, start, end))
    .filter((s): s is TranscriptSegment => s !== null);

  return {
    index,
    start,
    end,
    segments: included,
    title: included.length > 0 ? deriveTitle(included) : undefined,
    score: included.length > 0 ? scoreSegments(included) : undefined,
  };
}

// A duration preset (15s/30s/60s) is used directly as the target length.
// With no duration but an explicit count, natural sentence/pause boundaries
// can't be forced to land on an exact number, so this instead spreads the
// total spoken duration evenly across that many clips and cuts at whichever
// boundary is closest to each share — approximate, but respects the user's
// intent without cutting mid-sentence to hit an exact count.
function computeTargetClipSeconds(
  segments: TranscriptSegment[],
  { targetClipCount, targetDurationSeconds }: SelectClipCandidatesOptions
): number {
  if (targetDurationSeconds && targetDurationSeconds > 0) {
    return Math.max(MIN_CLIP_SECONDS, targetDurationSeconds);
  }
  if (!targetClipCount || targetClipCount < 1 || segments.length === 0) {
    return DEFAULT_TARGET_CLIP_SECONDS;
  }
  const totalSeconds = segments[segments.length - 1].end - segments[0].start;
  return Math.max(MIN_CLIP_SECONDS, totalSeconds / targetClipCount);
}
