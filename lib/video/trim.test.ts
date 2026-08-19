import { describe, expect, it } from "vitest";
import { computeTrimPlan, outputDuration, remapCandidateForOutput } from "./trim";
import type { ClipCandidate, TranscriptWord } from "./types";

function word(text: string, start: number, end: number): TranscriptWord {
  return { text, start, end };
}

function candidateFromWords(start: number, end: number, words: TranscriptWord[]): ClipCandidate {
  return {
    index: 0,
    start,
    end,
    segments: [{ start: words[0].start, end: words[words.length - 1].end, text: words.map((w) => w.text).join(" "), words }],
  };
}

describe("computeTrimPlan", () => {
  it("returns null when removeFillers is false", () => {
    const candidate = candidateFromWords(0, 3, [word("um", 0, 1), word("hi", 1, 3)]);
    expect(computeTrimPlan(candidate, false)).toBeNull();
  });

  it("returns null when there's nothing to trim", () => {
    const candidate = candidateFromWords(0, 3, [word("a", 0, 1), word("b", 1, 2), word("c", 2, 3)]);
    expect(computeTrimPlan(candidate, true)).toBeNull();
  });

  it("cuts filler words out of the keep ranges", () => {
    const candidate = candidateFromWords(0, 8, [word("hello", 0, 1), word("um", 1, 1.5), word("world", 1.5, 8)]);
    const plan = computeTrimPlan(candidate, true);
    expect(plan).not.toBeNull();
    expect(plan?.keepRanges).toEqual([
      { start: 0, end: 1 },
      { start: 1.5, end: 8 },
    ]);
  });

  it("cuts long silent gaps out of the keep ranges", () => {
    const candidate = candidateFromWords(0, 8, [word("hello", 0, 2), word("world", 5, 8)]);
    const plan = computeTrimPlan(candidate, true);
    expect(plan).not.toBeNull();
    expect(plan?.keepRanges).toEqual([
      { start: 0, end: 2.15 },
      { start: 4.85, end: 8 },
    ]);
    expect(outputDuration(plan!.keepRanges)).toBeCloseTo(5.3, 5);
  });
});

describe("remapCandidateForOutput", () => {
  it("remaps word timestamps onto the trimmed 0-based output timeline", () => {
    const candidate = candidateFromWords(0, 10, [word("a", 0, 3), word("b", 7, 10)]);
    const plan = computeTrimPlan(candidate, true)!;

    const remapped = remapCandidateForOutput(candidate, plan.keepRanges);
    expect(remapped.start).toBe(0);
    expect(remapped.end).toBeCloseTo(6.3, 5);

    const words = remapped.segments.flatMap((s) => s.words);
    expect(words).toHaveLength(2);
    expect(words[0].start).toBeCloseTo(0, 5);
    expect(words[0].end).toBeCloseTo(3, 5);
    expect(words[1].start).toBeCloseTo(3.3, 5);
    expect(words[1].end).toBeCloseTo(6.3, 5);
  });
});
