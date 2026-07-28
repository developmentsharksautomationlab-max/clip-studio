import path from "node:path";
import { promises as fs } from "node:fs";
import { runFfmpeg, probeVideo, formatDuration } from "./ffmpeg";
import { writeAssFile } from "./caption";
import { toFfmpegFilterPath } from "./paths";
import type { CaptionChoice } from "./caption-styles";
import type { ClipCandidate, ClipFormat, RenderedClip } from "./types";

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const TARGET_RATIO = OUTPUT_WIDTH / OUTPUT_HEIGHT;

function evenDimension(n: number): number {
  const rounded = Math.round(n);
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

// Fits the whole source frame inside the 9:16 canvas instead of cropping it
// to fill (which zoomed in and cut off the sides). The common case is a
// landscape source, so this scales to the full 1080 width and letterboxes
// the leftover height with black, vertically centered.
function computeContain(width: number, height: number) {
  const sourceRatio = width / height;

  if (sourceRatio >= TARGET_RATIO) {
    const scaledWidth = OUTPUT_WIDTH;
    const scaledHeight = evenDimension(OUTPUT_WIDTH / sourceRatio);
    return { scaledWidth, scaledHeight };
  }

  const scaledHeight = OUTPUT_HEIGHT;
  const scaledWidth = evenDimension(OUTPUT_HEIGHT * sourceRatio);
  return { scaledWidth, scaledHeight };
}

export async function renderClip(
  sourcePath: string,
  candidate: ClipCandidate,
  workDir: string,
  outputDir: string,
  format: ClipFormat,
  captionStyle: CaptionChoice,
  onProgress?: (message: string) => void
): Promise<Omit<RenderedClip, "url">> {
  const { width, height } = await probeVideo(sourcePath);

  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  let canvasWidth: number;
  let canvasHeight: number;
  let captionPosY: number | undefined;
  const filterChain: string[] = [];

  if (format === "vertical") {
    const { scaledWidth, scaledHeight } = computeContain(width, height);
    canvasWidth = OUTPUT_WIDTH;
    canvasHeight = OUTPUT_HEIGHT;

    const padX = Math.round((OUTPUT_WIDTH - scaledWidth) / 2);
    const padY = Math.round((OUTPUT_HEIGHT - scaledHeight) / 2);
    filterChain.push(
      `scale=${scaledWidth}:${scaledHeight}`,
      `pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:${padX}:${padY}:black`
    );

    // Center the caption in the empty band below the (now centered) video.
    // If the source is already near 9:16 there's little/no band left, so
    // fall back to sitting near the bottom of the frame instead of
    // overlapping the video.
    const videoBottom = padY + scaledHeight;
    const bottomBandHeight = OUTPUT_HEIGHT - videoBottom;
    captionPosY =
      bottomBandHeight > 120
        ? Math.round(videoBottom + bottomBandHeight / 2)
        : Math.round(OUTPUT_HEIGHT * 0.92);
  } else {
    canvasWidth = evenDimension(width);
    canvasHeight = evenDimension(height);
    if (canvasWidth !== width || canvasHeight !== height) {
      filterChain.push(`scale=${canvasWidth}:${canvasHeight}`);
    }
  }

  const filename = `clip-${candidate.index + 1}-${format}.mp4`;
  const outputPath = path.join(outputDir, filename);

  if (captionStyle !== "none") {
    const assPath = path.join(workDir, `clip-${candidate.index}-${format}-${captionStyle}.ass`);
    await writeAssFile(
      candidate,
      assPath,
      { width: canvasWidth, height: canvasHeight },
      captionStyle,
      captionPosY
    );
    filterChain.push(`subtitles=${toFfmpegFilterPath(assPath)}`);
  }

  const clipDuration = candidate.end - candidate.start;
  const timePattern = /time=(\d+):(\d+):(\d+\.\d+)/;

  const args = ["-ss", String(candidate.start), "-i", sourcePath, "-t", String(clipDuration)];

  if (filterChain.length > 0) {
    args.push("-vf", filterChain.join(","));
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
      const pct = Math.min(99, Math.round((doneSeconds / clipDuration) * 100));
      onProgress?.(`${pct}% (${formatDuration(doneSeconds)} / ${formatDuration(clipDuration)})`);
    },
  });

  return {
    index: candidate.index,
    start: candidate.start,
    end: candidate.end,
    format,
    filename,
  };
}
