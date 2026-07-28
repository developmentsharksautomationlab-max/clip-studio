import type { ClipCandidate, TranscriptSegment } from "./types";

const DEFAULT_TARGET_CLIP_SECONDS = 40;
const MIN_CLIP_SECONDS = 15;

export function selectClipCandidates(
  segments: TranscriptSegment[],
  targetClipCount?: number
): ClipCandidate[] {
  const candidates: ClipCandidate[] = [];
  let current: TranscriptSegment[] = [];

  const targetClipSeconds = computeTargetClipSeconds(segments, targetClipCount);

  const flush = () => {
    if (current.length === 0) return;
    const start = current[0].start;
    const end = current[current.length - 1].end;
    if (end - start >= MIN_CLIP_SECONDS) {
      candidates.push({ index: candidates.length, start, end, segments: current });
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
    });
  }

  return candidates;
}

// With no explicit count, clips target a fixed length. With a requested
// count, natural sentence/pause boundaries can't be forced to land on an
// exact number, so this instead spreads the total spoken duration evenly
// across that many clips and cuts at whichever boundary is closest to each
// share — approximate, but respects the user's intent without cutting
// mid-sentence to hit an exact count.
function computeTargetClipSeconds(segments: TranscriptSegment[], targetClipCount?: number): number {
  if (!targetClipCount || targetClipCount < 1 || segments.length === 0) {
    return DEFAULT_TARGET_CLIP_SECONDS;
  }
  const totalSeconds = segments[segments.length - 1].end - segments[0].start;
  return Math.max(MIN_CLIP_SECONDS, totalSeconds / targetClipCount);
}
