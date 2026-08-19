import OpenAI from "openai";
import type { TranscriptSegment, TranscriptWord } from "./types";

const BATCH_SIZE = 25;

// Whisper's own translation mode only ever outputs English, so getting
// captions in an arbitrary chosen language needs a real translation pass
// after transcription, not a transcription-time flag. Segment timestamps
// stay put (translation can't change when things were said); word-level
// timestamps are approximated by spreading the translated words evenly
// across the original segment's time span, since a different language
// has no way to reuse the original per-word timing.
function redistributeWords(text: string, start: number, end: number): TranscriptWord[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const duration = Math.max(0.05, end - start);
  const step = duration / words.length;
  return words.map((w, i) => ({
    text: w,
    start: start + i * step,
    end: i === words.length - 1 ? end : start + (i + 1) * step,
  }));
}

async function translateBatch(
  client: OpenAI,
  model: string,
  texts: string[],
  targetInstruction: string
): Promise<string[]> {
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You translate video captions into ${targetInstruction}. You will receive a JSON object {"lines": [...]} listing caption lines in their original language and order. Reply with ONLY a JSON object {"lines": [...]} of the same length, each line translated in place. Keep translations short and natural, matching the tone of spoken captions. Never merge, split, add, or drop lines.`,
      },
      { role: "user", content: JSON.stringify({ lines: texts }) },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Translation model returned invalid JSON.");
  }

  const lines = (parsed as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length !== texts.length) {
    throw new Error("Translation model returned a mismatched number of lines.");
  }
  return lines.map((l) => (typeof l === "string" ? l : String(l)));
}

export async function translateSegments(
  segments: TranscriptSegment[],
  targetInstruction: string,
  onProgress?: (message: string) => void
): Promise<TranscriptSegment[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required to translate captions into a different language.");
  }
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.GROQ_API_BASE_URL || "https://api.groq.com/openai/v1",
  });
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const translatedTexts: string[] = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    onProgress?.(`Translating captions... ${Math.min(i + BATCH_SIZE, segments.length)}/${segments.length}`);
    translatedTexts.push(...(await translateBatch(client, model, batch.map((s) => s.text), targetInstruction)));
  }

  return segments.map((segment, i) => {
    const text = translatedTexts[i] ?? segment.text;
    const words = redistributeWords(text, segment.start, segment.end);
    return { start: segment.start, end: segment.end, text, words: words.length > 0 ? words : segment.words };
  });
}
