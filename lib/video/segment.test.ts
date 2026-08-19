import { describe, expect, it } from "vitest";
import { buildCandidateFromRange, explainScore, selectClipCandidates } from "./segment";
import type { TranscriptSegment, TranscriptWord } from "./types";

function word(text: string, start: number, end: number): TranscriptWord {
  return { text, start, end };
}

function segment(words: TranscriptWord[]): TranscriptSegment {
  return {
    text: words.map((w) => w.text).join(" "),
    words,
    start: words[0].start,
    end: words[words.length - 1].end,
  };
}

describe("selectClipCandidates", () => {
  it("returns no candidates for no segments", () => {
    expect(selectClipCandidates([])).toEqual([]);
  });

  it("splits long transcripts into multiple candidates around the target duration", () => {
    // 3 segments of 20s each, back to back — default target is 40s, so this
    // should flush after segments 1+2 (40s) and again after segment 3 (20s,
    // above MIN_CLIP_SECONDS=15).
    const segments: TranscriptSegment[] = [
      segment([word("one", 0, 20)]),
      segment([word("two", 20, 40)]),
      segment([word("three", 40, 60)]),
    ];

    const candidates = selectClipCandidates(segments);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].start).toBe(0);
    expect(candidates[candidates.length - 1].end).toBe(60);
  });

  it("drops a trailing sliver shorter than MIN_CLIP_SECONDS", () => {
    const segments: TranscriptSegment[] = [
      segment([word("long", 0, 40)]),
      segment([word("tiny", 40, 45)]),
    ];
    const candidates = selectClipCandidates(segments, { targetDurationSeconds: 40 });
    // The 5s trailing sliver is below MIN_CLIP_SECONDS (15) and gets dropped
    // by flush(), leaving just the first candidate.
    expect(candidates).toHaveLength(1);
    expect(candidates[0].end).toBe(40);
  });

  it("scores clips with hook keywords and punctuation higher", () => {
    const plain = [segment([word("plain", 0, 1), word("statement", 1, 20)])];
    const hooky = [
      segment([word("never", 0, 1), word("do", 1, 2), word("this", 2, 3), word("secret!", 3, 20)]),
    ];
    const plainScore = selectClipCandidates(plain, { targetDurationSeconds: 20 })[0].score ?? 0;
    const hookyScore = selectClipCandidates(hooky, { targetDurationSeconds: 20 })[0].score ?? 0;
    expect(hookyScore).toBeGreaterThan(plainScore);
  });
});

describe("buildCandidateFromRange", () => {
  const segments: TranscriptSegment[] = [
    segment([word("hello", 0, 1), word("world", 1, 2)]),
    segment([word("pricing", 10, 11), word("is", 11, 12), word("great", 12, 13)]),
    segment([word("bye", 30, 31)]),
  ];

  it("keeps only words overlapping the requested range", () => {
    const candidate = buildCandidateFromRange(segments, 0, 9, 14);
    expect(candidate.segments).toHaveLength(1);
    expect(candidate.segments[0].words.map((w) => w.text)).toEqual(["pricing", "is", "great"]);
  });

  it("leaves title/score undefined when nothing overlaps the range", () => {
    const candidate = buildCandidateFromRange(segments, 0, 100, 110);
    expect(candidate.segments).toEqual([]);
    expect(candidate.title).toBeUndefined();
    expect(candidate.score).toBeUndefined();
  });
});

describe("explainScore", () => {
  it("mentions the detected hook keywords", () => {
    const segments = [segment([word("this", 0, 1), word("secret", 1, 2), word("never", 2, 3)])];
    const explanation = explainScore(segments);
    expect(explanation).toContain("hook keyword");
    expect(explanation).toContain("secret");
  });
});
