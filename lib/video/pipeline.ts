import { transcribeVideo } from "./transcribe";
import { selectClipCandidates } from "./segment";
import { renderAndPersistClip } from "./render-and-persist";
import { updateJob } from "./job-store";
import { probeVideo } from "./ffmpeg";
import { uploadDirFor, generatedDirFor } from "./paths";
import { resolveWhisperLanguage } from "./languages";
import { resolveCaptionLanguageInstruction } from "./caption-languages";
import { translateSegments } from "./translate";
import type { CaptionChoice } from "./caption-styles";
import type { ClipCandidate, ClipFormat, ClipMode, RenderedClip } from "./types";

// How many clip renders (ffmpeg processes) run at once. Sized together with
// the per-process -threads value in render.ts — see the comment there for
// why this isn't higher (constrained-host OOM risk) or 1 (rendering was
// fully sequential before, which is most of what made multi-clip/
// multi-format jobs feel slow: 10+ renders in a row each taking real time).
const RENDER_CONCURRENCY = 2;

export interface RunPipelineOptions {
  captionStyle: CaptionChoice;
  mode: ClipMode;
  clipCount?: number;
  targetDurationSeconds?: number;
  languageId: string;
  captionLanguageId?: string;
  formats: ClipFormat[];
  removeFillers: boolean;
  watermarkPath?: string;
}

export async function runPipeline(
  jobId: string,
  sourcePath: string,
  options: RunPipelineOptions
): Promise<void> {
  const workDir = uploadDirFor(jobId);
  const outputDir = generatedDirFor(jobId);

  let lastMessage = "";
  const reportProgress = (message: string) => {
    if (message === lastMessage) return;
    lastMessage = message;
    updateJob(jobId, { progressMessage: message }).catch(() => {});
  };

  try {
    await updateJob(jobId, {
      status: "transcribing",
      progressMessage: "Transcribing audio...",
      error: undefined,
    });
    const whisperLanguage = resolveWhisperLanguage(options.languageId);
    const transcript = await transcribeVideo(sourcePath, workDir, whisperLanguage, reportProgress);

    const translationInstruction = resolveCaptionLanguageInstruction(options.captionLanguageId);
    if (translationInstruction) {
      transcript.segments = await translateSegments(transcript.segments, translationInstruction, reportProgress);
    }

    await updateJob(jobId, {
      status: "segmenting",
      progressMessage: "Finding clip-worthy moments...",
      transcript,
    });

    const candidates: ClipCandidate[] =
      options.mode === "caption-only"
        ? [await buildFullVideoCandidate(sourcePath, transcript.segments)]
        : selectClipCandidates(transcript.segments, {
            targetClipCount: options.clipCount,
            targetDurationSeconds: options.targetDurationSeconds,
          });

    if (candidates.length === 0) {
      throw new Error("Could not find any speech in this video to build clips from.");
    }

    const renderTasks = candidates.flatMap((candidate) =>
      options.formats.map((format) => ({ candidate, format }))
    );
    const totalRenders = renderTasks.length;

    await updateJob(jobId, {
      status: "rendering",
      progressMessage: `Rendering 0/${totalRenders} clips...`,
    });

    const clips: RenderedClip[] = [];
    let completedRenders = 0;
    // Persisted separately from the render work itself (which runs with
    // real concurrency below) and serialized through this chain, so two
    // renders finishing close together can never race each other's
    // read-modify-write of the shared `clips` array in the job record.
    let persistQueue: Promise<unknown> = Promise.resolve();
    const persistProgress = (message: string) => {
      persistQueue = persistQueue.then(() => updateJob(jobId, { progressMessage: message, clips: [...clips] }));
      return persistQueue;
    };

    async function renderOne({ candidate, format }: (typeof renderTasks)[number]) {
      const clipNumber = candidate.index + 1;
      const rendered = await renderAndPersistClip(jobId, sourcePath, candidate, workDir, outputDir, format, {
        captionStyle: options.captionStyle,
        removeFillers: options.removeFillers,
        watermarkPath: options.watermarkPath,
        onProgress: (message) => {
          reportProgress(`Rendering clip ${clipNumber} (${format}), ${completedRenders}/${totalRenders} done: ${message}`);
        },
      });
      clips.push(rendered);
      completedRenders += 1;
      await persistProgress(`Rendered ${completedRenders}/${totalRenders} clips`);
    }

    // Bounded-concurrency worker pool: each of RENDER_CONCURRENCY "lanes"
    // pulls the next task off the shared queue as soon as it finishes one,
    // so lanes never sit idle waiting for the slowest task in a batch.
    let nextTaskIndex = 0;
    async function lane() {
      while (nextTaskIndex < renderTasks.length) {
        const task = renderTasks[nextTaskIndex++];
        await renderOne(task);
      }
    }
    await Promise.all(Array.from({ length: Math.min(RENDER_CONCURRENCY, renderTasks.length) }, lane));
    await persistQueue;

    await updateJob(jobId, { status: "done", progressMessage: "Done.", clips });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: "error", error: message }).catch(() => {});
  }
}

async function buildFullVideoCandidate(
  sourcePath: string,
  segments: ClipCandidate["segments"]
): Promise<ClipCandidate> {
  const { durationSeconds } = await probeVideo(sourcePath);
  return { index: 0, start: 0, end: durationSeconds, segments };
}
