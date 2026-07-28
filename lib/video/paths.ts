import path from "node:path";

export const ROOT_DIR = process.cwd();
export const STORAGE_DIR = path.join(ROOT_DIR, "storage");
export const UPLOADS_DIR = path.join(STORAGE_DIR, "uploads");
export const JOBS_DIR = path.join(STORAGE_DIR, "jobs");
export const MODELS_DIR = path.join(ROOT_DIR, "models");
export const PUBLIC_GENERATED_DIR = path.join(ROOT_DIR, "public", "generated");

export function uploadDirFor(jobId: string): string {
  return path.join(UPLOADS_DIR, jobId);
}

export function jobFilePath(jobId: string): string {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

export function generatedDirFor(jobId: string): string {
  return path.join(PUBLIC_GENERATED_DIR, jobId);
}

export function publicUrlFor(jobId: string, filename: string): string {
  return `/generated/${jobId}/${filename}`;
}

// ffmpeg's filtergraph option parser splits on ':', which collides with
// Windows drive-letter paths (e.g. "D:/foo"). Passing paths relative to
// ROOT_DIR (as forward slashes, with ffmpeg's cwd set to ROOT_DIR) sidesteps
// the collision entirely instead of relying on filter-string escaping.
export function toFfmpegFilterPath(absolutePath: string): string {
  return path.relative(ROOT_DIR, absolutePath).split(path.sep).join("/");
}
