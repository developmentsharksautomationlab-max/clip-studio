import { promises as fs } from "node:fs";
import path from "node:path";
import { runFfmpeg, probeVideo, formatDuration } from "./ffmpeg";
import { ensureWhisperModel } from "./model";
import { toFfmpegFilterPath } from "./paths";
import type { Transcript, TranscriptSegment, TranscriptWord } from "./types";

// Empirically verified against ffmpeg 8.1's whisper filter (format=json,
// max_len=1): output is newline-delimited JSON, one word per line, with
// start/end in milliseconds. This is undocumented, so keep this parser
// tolerant rather than assuming it never changes across ffmpeg builds.
//
// The filter also has a real bug: it does not escape literal '"' characters
// inside "text", so whenever whisper transcribes a word/token that itself
// contains a quote mark, the line becomes invalid JSON (e.g.
// `{"start":1,"end":2,"text":"""}`). JSON.parse throws on those lines and
// takes the whole transcription down with it, so this is parsed with a
// structural regex instead of JSON.parse: start/end are always plain
// digits, and a greedy match for "text" finds the *last* quote before the
// final `}` as the true closing delimiter, which correctly recovers the
// text even when it contains stray unescaped quotes.
const LINE_PATTERN = /^\{"start":(-?\d+),"end":(-?\d+),"text":"(.*)"\}$/;

const PAUSE_GAP_SECONDS = 0.6;
const MAX_SEGMENT_SECONDS = 12;
const NO_SPACE_BEFORE = /^[,.!?;:')\]]/;

function parseWords(raw: string): TranscriptWord[] {
  const words: TranscriptWord[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(LINE_PATTERN);
    if (!match) continue;

    const text = match[3].trim();
    if (!text) continue;

    const rawStart = Number(match[1]);
    const rawEnd = Number(match[2]);
    const start = rawStart / 1000;
    const end = Math.max(rawEnd, rawStart) / 1000;

    // The whisper filter reprocesses short overlapping windows, which
    // occasionally emits the same word twice right at a chunk boundary
    // (either overlapping timestamps, or back-to-back with almost no gap).
    const prev = words[words.length - 1];
    if (prev && prev.text === text && start - prev.end < 0.2) continue;

    words.push({ start, end, text });
  }

  return words;
}

function joinWords(words: TranscriptWord[]): string {
  let out = "";
  for (const word of words) {
    if (out && !NO_SPACE_BEFORE.test(word.text)) out += " ";
    out += word.text;
  }
  return out;
}

function groupWordsIntoSegments(words: TranscriptWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let current: TranscriptWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    segments.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: joinWords(current),
      words: current,
    });
    current = [];
  };

  for (const word of words) {
    const prev = current[current.length - 1];
    const gap = prev ? Math.max(0, word.start - prev.end) : 0;
    const duration = prev ? word.end - current[0].start : 0;
    const endsSentence = prev ? /[.!?]$/.test(prev.text) : false;

    if (prev && (gap > PAUSE_GAP_SECONDS || duration > MAX_SEGMENT_SECONDS || endsSentence)) {
      flush();
    }
    current.push(word);
  }
  flush();

  return segments;
}

export async function transcribeVideo(
  sourcePath: string,
  workDir: string,
  whisperLanguage: string,
  onProgress?: (message: string) => void
): Promise<Transcript> {
  const modelFile = await ensureWhisperModel(onProgress);
  await fs.mkdir(workDir, { recursive: true });
  const outputJsonPath = path.join(workDir, "transcript.json");

  const { durationSeconds } = await probeVideo(sourcePath);

  onProgress?.(`Transcribing audio... 0% (0:00 / ${formatDuration(durationSeconds)})`);

  const progressPattern = /run transcription at (\d+) ms/;

  const buildFilterArg = (useGpu: boolean) =>
    [
      `whisper=model=${toFfmpegFilterPath(modelFile)}`,
      `language=${whisperLanguage}`,
      "format=json",
      `destination=${toFfmpegFilterPath(outputJsonPath)}`,
      "max_len=1",
      `use_gpu=${useGpu}`,
    ].join(":");

  const runTranscription = (useGpu: boolean) =>
    runFfmpeg(["-i", sourcePath, "-vn", "-af", buildFilterArg(useGpu), "-f", "null", "-"], {
      onStderrLine: (line) => {
        const match = line.match(progressPattern);
        if (!match) return;
        const doneSeconds = Number(match[1]) / 1000;
        const pct = Math.min(99, Math.round((doneSeconds / durationSeconds) * 100));
        onProgress?.(
          `Transcribing audio... ${pct}% (${formatDuration(doneSeconds)} / ${formatDuration(durationSeconds)})`
        );
      },
    });

  try {
    await runTranscription(true);
  } catch {
    // The whisper filter's GPU path (Vulkan) can fail with an out-of-memory
    // abort under GPU memory pressure from unrelated processes. Model
    // loading hasn't produced any output yet at that point, so a clean
    // CPU-only retry is safe and recovers instead of failing the whole job.
    onProgress?.("GPU transcription failed, retrying on CPU...");
    await runTranscription(false);
  }

  const transcript = await parseTranscriptFile(outputJsonPath);
  return { ...transcript, language: whisperLanguage };
}

export async function parseTranscriptFile(jsonPath: string): Promise<Transcript> {
  const raw = await fs.readFile(jsonPath, "utf8");
  const words = parseWords(raw);

  if (words.length === 0) {
    throw new Error("Transcription produced no words. The video may be silent or unsupported.");
  }

  return {
    language: "auto",
    segments: groupWordsIntoSegments(words),
  };
}
