import type { ClipCandidate } from "./types";

function formatSrtTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// Builds a standard .srt from a clip candidate's segments, independent of
// whether burned-in captions are enabled — useful on its own for uploading
// to platforms that take a separate subtitle file.
export function buildSrt(candidate: ClipCandidate): string {
  const blocks: string[] = [];

  candidate.segments.forEach((segment, i) => {
    blocks.push(
      `${i + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${segment.text}\n`
    );
  });

  return blocks.join("\n");
}
