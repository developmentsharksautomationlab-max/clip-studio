import os from "node:os";
import path from "node:path";

export const ROOT_DIR = process.cwd();
export const STORAGE_DIR = path.join(ROOT_DIR, "storage");
export const MODELS_DIR = path.join(ROOT_DIR, "models");
export const PUBLIC_GENERATED_DIR = path.join(ROOT_DIR, "public", "generated");
// Every rendered clip gets this watermark automatically — it's a bundled
// asset (not user-uploaded), so both local dev and the worker's Docker image
// (see Dockerfile.worker) always have it at this same path.
export const WATERMARK_LOGO_PATH = path.join(ROOT_DIR, "public", "watermark.png");

// Vercel's deployed filesystem is read-only outside of /tmp, so the web app
// stages working files there instead of under the (read-only) project root.
// The worker runs as a normal Docker container with an ordinary writable
// disk, so it never needs this even though it's also in "blob mode".
const IS_VERCEL = Boolean(process.env.VERCEL);
const WORK_ROOT = IS_VERCEL ? path.join(os.tmpdir(), "clip-studio") : STORAGE_DIR;

export const UPLOADS_DIR = path.join(WORK_ROOT, "uploads");
export const JOBS_DIR = path.join(STORAGE_DIR, "jobs");
// Local staging directory ffmpeg renders into before the storage adapter
// (lib/storage) persists the result — to public/generated locally, or to
// blob storage in production. Never served directly.
export const RENDERS_DIR = path.join(WORK_ROOT, "renders");

export function uploadDirFor(jobId: string): string {
  return path.join(UPLOADS_DIR, jobId);
}

export function jobFilePath(jobId: string): string {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

export function generatedDirFor(jobId: string): string {
  return path.join(RENDERS_DIR, jobId);
}

// ffmpeg's filtergraph option parser splits on ':', which collides with
// Windows drive-letter paths (e.g. "D:/foo"). Passing paths relative to
// ROOT_DIR (as forward slashes, with ffmpeg's cwd set to ROOT_DIR) sidesteps
// the collision entirely instead of relying on filter-string escaping.
export function toFfmpegFilterPath(absolutePath: string): string {
  return path.relative(ROOT_DIR, absolutePath).split(path.sep).join("/");
}
