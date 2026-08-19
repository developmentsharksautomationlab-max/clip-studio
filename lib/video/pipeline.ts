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

    await updateJob(jobId, {
      status: "rendering",
      progressMessage: `Rendering clip 1/${candidates.length}...`,
    });

    const clips: RenderedClip[] = [];
    for (const candidate of candidates) {
      const clipNumber = candidate.index + 1;

      for (const format of options.formats) {
        const rendered = await renderAndPersistClip(jobId, sourcePath, candidate, workDir, outputDir, format, {
          captionStyle: options.captionStyle,
          removeFillers: options.removeFillers,
          watermarkPath: options.watermarkPath,
          onProgress: (message) => {
            reportProgress(`Rendering clip ${clipNumber}/${candidates.length} (${format}): ${message}`);
          },
        });
        clips.push(rendered);
      }

      const doneMessage = `Rendered ${clipNumber}/${candidates.length} clips`;
      await updateJob(jobId, { progressMessage: doneMessage, clips });
      lastMessage = doneMessage;
    }

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
