import path from "node:path";
import { renderClip, type RenderClipOptions } from "./render";
import { storage } from "../storage";
import type { ClipCandidate, ClipFormat, RenderedClip } from "./types";

// Shared by the main pipeline (lib/video/pipeline.ts) and the AI assistant's
// create_clip tool (app/api/chat/route.ts): renders one clip with ffmpeg,
// then persists the result through the storage adapter (local disk or blob)
// to get back a durable, browser-fetchable URL.
export async function renderAndPersistClip(
  jobId: string,
  sourcePath: string,
  candidate: ClipCandidate,
  workDir: string,
  outputDir: string,
  format: ClipFormat,
  options: RenderClipOptions
): Promise<RenderedClip> {
  const { srtFilename, ...rendered } = await renderClip(
    sourcePath,
    candidate,
    workDir,
    outputDir,
    format,
    options
  );

  const [{ url }, { url: srtUrl }] = await Promise.all([
    storage.putFile(`${jobId}/${rendered.filename}`, path.join(outputDir, rendered.filename), "video/mp4"),
    storage.putFile(`${jobId}/${srtFilename}`, path.join(outputDir, srtFilename), "application/x-subrip"),
  ]);

  return { ...rendered, url, srtUrl };
}
