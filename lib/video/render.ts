import path from "node:path";
import { promises as fs } from "node:fs";
import { runFfmpeg, probeVideo, formatDuration } from "./ffmpeg";
import { writeAssFile } from "./caption";
import { toFfmpegFilterPath } from "./paths";
import { computeTrimPlan, remapCandidateForOutput, outputDuration, type TimeRange } from "./trim";
import type { CaptionChoice } from "./caption-styles";
import type { ClipCandidate, ClipFormat, RenderedClip } from "./types";

const SQUARE_CANVAS = { width: 1080, height: 1080 };
const VERTICAL_CANVAS = { width: 1080, height: 1920 };

function evenDimension(n: number): number {
  const rounded = Math.round(n);
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

// Fits the whole source frame inside the target canvas instead of cropping it
// to fill (which zooms in and cuts off the sides). The common case is a
// landscape source, so this scales to fill the canvas width/height and
// letterboxes the leftover space with black, centered.
function computeContain(width: number, height: number, targetWidth: number, targetHeight: number) {
  const sourceRatio = width / height;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio >= targetRatio) {
    const scaledWidth = targetWidth;
    const scaledHeight = evenDimension(targetWidth / sourceRatio);
    return { scaledWidth, scaledHeight };
  }

  const scaledHeight = targetHeight;
  const scaledWidth = evenDimension(targetHeight * sourceRatio);
  return { scaledWidth, scaledHeight };
}

export interface RenderClipOptions {
  captionStyle: CaptionChoice;
  removeFillers: boolean;
  watermarkPath?: string;
  onProgress?: (message: string) => void;
}

export async function renderClip(
  sourcePath: string,
  candidate: ClipCandidate,
  workDir: string,
  outputDir: string,
  format: ClipFormat,
  options: RenderClipOptions
): Promise<Omit<RenderedClip, "url">> {
  const { captionStyle, removeFillers, watermarkPath, onProgress } = options;
  const { width, height } = await probeVideo(sourcePath);

  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  let canvasWidth: number;
  let canvasHeight: number;
  let captionPosY: number | undefined;
  // Height of the empty letterbox band above the video (vertical/square
  // formats only), used to center the watermark there instead of over the
  // video. Undefined when there's no such band (e.g. "original" format).
  let topBandHeight: number | undefined;
  const filterChain: string[] = [];

  if (format === "vertical" || format === "square") {
    const canvas = format === "vertical" ? VERTICAL_CANVAS : SQUARE_CANVAS;
    const { scaledWidth, scaledHeight } = computeContain(width, height, canvas.width, canvas.height);
    canvasWidth = canvas.width;
    canvasHeight = canvas.height;

    const padX = Math.round((canvas.width - scaledWidth) / 2);
    const padY = Math.round((canvas.height - scaledHeight) / 2);
    filterChain.push(
      `scale=${scaledWidth}:${scaledHeight}`,
      `pad=${canvas.width}:${canvas.height}:${padX}:${padY}:black`
    );
    topBandHeight = padY;

    // Center the caption in the empty band below the (now centered) video.
    // If the source is already near the target ratio there's little/no band
    // left, so fall back to sitting near the bottom of the frame instead of
    // overlapping the video.
    const videoBottom = padY + scaledHeight;
    const bottomBandHeight = canvas.height - videoBottom;
    captionPosY =
      bottomBandHeight > 120
        ? Math.round(videoBottom + bottomBandHeight / 2)
        : Math.round(canvas.height * 0.92);
  } else {
    canvasWidth = evenDimension(width);
    canvasHeight = evenDimension(height);
    if (canvasWidth !== width || canvasHeight !== height) {
      filterChain.push(`scale=${canvasWidth}:${canvasHeight}`);
    }
  }

  const trimPlan = computeTrimPlan(candidate, removeFillers);
  const keepRanges: TimeRange[] = trimPlan?.keepRanges ?? [{ start: candidate.start, end: candidate.end }];
  const needsFilterComplex = Boolean(trimPlan) || Boolean(watermarkPath);
  const outputSeconds = outputDuration(keepRanges);

  if (captionStyle !== "none") {
    const captionCandidate = trimPlan ? remapCandidateForOutput(candidate, trimPlan.keepRanges) : candidate;
    const assPath = path.join(workDir, `clip-${candidate.index}-${format}-${captionStyle}.ass`);
    await writeAssFile(
      captionCandidate,
      assPath,
      { width: canvasWidth, height: canvasHeight },
      captionStyle,
      captionPosY
    );
    filterChain.push(`subtitles=${toFfmpegFilterPath(assPath)}`);
  }

  const filename = `clip-${candidate.index + 1}-${format}.mp4`;
  const outputPath = path.join(outputDir, filename);
  const timePattern = /time=(\d+):(\d+):(\d+\.\d+)/;

  const args: string[] = [];

  if (!needsFilterComplex) {
    args.push("-ss", String(candidate.start), "-i", sourcePath, "-t", String(outputSeconds));
    if (filterChain.length > 0) args.push("-vf", filterChain.join(","));
  } else {
    args.push("-i", sourcePath);
    if (watermarkPath) args.push("-i", watermarkPath);

    const filterParts: string[] = [];
    keepRanges.forEach((range, i) => {
      filterParts.push(`[0:v]trim=start=${range.start}:end=${range.end},setpts=PTS-STARTPTS[v${i}]`);
      filterParts.push(`[0:a]atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS[a${i}]`);
    });

    let videoLabel: string;
    let audioLabel: string;
    if (keepRanges.length > 1) {
      // concat expects inputs grouped per segment (v,a pairs in segment
      // order), not all video pads followed by all audio pads.
      const pairLabels = keepRanges.map((_, i) => `[v${i}][a${i}]`).join("");
      filterParts.push(`${pairLabels}concat=n=${keepRanges.length}:v=1:a=1[vcat][acat]`);
      videoLabel = "vcat";
      audioLabel = "acat";
    } else {
      videoLabel = "v0";
      audioLabel = "a0";
    }

    let currentLabel = videoLabel;
    filterChain.forEach((step, i) => {
      const outLabel = `vf${i}`;
      filterParts.push(`[${currentLabel}]${step}[${outLabel}]`);
      currentLabel = outLabel;
    });

    if (watermarkPath) {
      // Prefer the empty letterbox band above the video (vertical/square)
      // so the logo doesn't sit on top of the footage or the captions,
      // which live in the bottom band. Fall back to a bottom-right corner
      // overlay when there's no meaningful band (original format, or a
      // near-full-frame source with little letterboxing).
      const fitsTopBand = topBandHeight !== undefined && topBandHeight > 60;

      // Bound both dimensions and let ffmpeg fit the logo within that box
      // (preserving aspect, never upscaling past it) — sizing purely off the
      // band height let very wide letterbox bands (common on 16:9 sources)
      // blow the logo up far past a normal watermark size.
      const maxWidth = Math.round(canvasWidth * 0.16);
      const maxHeight = fitsTopBand
        ? Math.round((topBandHeight as number) * 0.45)
        : Math.round(canvasHeight * 0.08);
      filterParts.push(`[1:v]scale=w=${maxWidth}:h=${maxHeight}:force_original_aspect_ratio=decrease[wm]`);

      if (fitsTopBand) {
        filterParts.push(
          `[${currentLabel}][wm]overlay=x=(main_w-overlay_w)/2:y=(${topBandHeight}-overlay_h)/2[vout]`
        );
      } else {
        const margin = Math.round(canvasWidth * 0.03);
        filterParts.push(`[${currentLabel}][wm]overlay=W-w-${margin}:H-h-${margin}[vout]`);
      }
      currentLabel = "vout";
    }

    args.push("-filter_complex", filterParts.join(";"));
    args.push("-map", `[${currentLabel}]`, "-map", `[${audioLabel}]`);
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath
  );

  await runFfmpeg(args, {
    onStderrLine: (line) => {
      const match = line.match(timePattern);
      if (!match) return;
      const doneSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      const pct = Math.min(99, Math.round((doneSeconds / outputSeconds) * 100));
      onProgress?.(`${pct}% (${formatDuration(doneSeconds)} / ${formatDuration(outputSeconds)})`);
    },
  });

  return {
    index: candidate.index,
    start: candidate.start,
    end: candidate.end,
    format,
    filename,
    title: candidate.title,
    score: candidate.score,
  };
}
