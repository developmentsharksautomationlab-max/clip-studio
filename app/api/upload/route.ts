import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createJob } from "@/lib/video/job-store";
import { uploadDirFor, WATERMARK_LOGO_PATH } from "@/lib/video/paths";
import { runPipeline } from "@/lib/video/pipeline";
import { isCaptionStyleId, type CaptionChoice } from "@/lib/video/caption-styles";
import { isLanguageId, DEFAULT_LANGUAGE_ID } from "@/lib/video/languages";
import { isCaptionLanguageId, DEFAULT_CAPTION_LANGUAGE_ID } from "@/lib/video/caption-languages";
import type { ClipFormat, ClipMode } from "@/lib/video/types";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "m4v"]);
const ALLOWED_FORMATS = new Set<ClipFormat>(["vertical", "original", "square"]);
const DEFAULT_FORMATS: ClipFormat[] = ["vertical", "original"];
const MAX_CLIP_COUNT = 20;
const ALLOWED_DURATIONS = new Set([15, 30, 60]);

function parseCaptionChoice(value: string | undefined): CaptionChoice {
  if (typeof value === "string" && (value === "none" || isCaptionStyleId(value))) {
    return value;
  }
  return "none";
}

function parseMode(value: string | undefined): ClipMode {
  return value === "caption-only" ? "caption-only" : "clips";
}

function parseLanguageId(value: string | undefined): string {
  if (typeof value === "string" && isLanguageId(value)) {
    return value;
  }
  return DEFAULT_LANGUAGE_ID;
}

function parseCaptionLanguageId(value: string | undefined): string {
  if (typeof value === "string" && isCaptionLanguageId(value)) {
    return value;
  }
  return DEFAULT_CAPTION_LANGUAGE_ID;
}

function parseClipCount(value: string | undefined): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.min(MAX_CLIP_COUNT, Math.round(parsed));
}

function parseTargetDurationSeconds(value: string | undefined): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return ALLOWED_DURATIONS.has(parsed) ? parsed : undefined;
}

function parseFormats(values: unknown[]): ClipFormat[] {
  const formats = [...new Set(values)].filter(
    (v): v is ClipFormat => typeof v === "string" && ALLOWED_FORMATS.has(v as ClipFormat)
  );
  return formats.length > 0 ? formats : DEFAULT_FORMATS;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "true";
}

interface ParsedOptions {
  captionStyle: CaptionChoice;
  mode: ClipMode;
  languageId: string;
  captionLanguageId: string;
  clipCount?: number;
  targetDurationSeconds?: number;
  formats: ClipFormat[];
  removeFillers: boolean;
}

function parseOptions(fields: Record<string, string | undefined>, formats: unknown[]): ParsedOptions {
  const mode = parseMode(fields.mode);
  return {
    captionStyle: parseCaptionChoice(fields.captionStyle),
    mode,
    languageId: parseLanguageId(fields.language),
    captionLanguageId: parseCaptionLanguageId(fields.captionLanguage),
    clipCount: mode === "clips" ? parseClipCount(fields.clipCount) : undefined,
    targetDurationSeconds: mode === "clips" ? parseTargetDurationSeconds(fields.targetDurationSeconds) : undefined,
    formats: parseFormats(formats),
    removeFillers: parseBoolean(fields.removeFillers),
  };
}

async function startJob(
  jobId: string,
  options: ParsedOptions,
  job: { sourceFilename: string; sourceExt: string },
  location: { sourceUrl?: string; localSourcePath?: string }
) {
  await createJob(jobId, {
    sourceFilename: job.sourceFilename,
    sourceExt: job.sourceExt,
    sourceUrl: location.sourceUrl,
    captionStyle: options.captionStyle,
    mode: options.mode,
    clipCount: options.clipCount,
    targetDurationSeconds: options.targetDurationSeconds,
    languageId: options.languageId,
    captionLanguageId: options.captionLanguageId,
    formats: options.formats,
    removeFillers: options.removeFillers,
  });

  if (process.env.POSTGRES_URL) {
    // A separate worker process polls for queued jobs and runs the pipeline
    // (see worker/index.ts) — nothing more to do here.
    return;
  }

  if (!location.localSourcePath) {
    throw new Error("No POSTGRES_URL configured, so this server can't hand the job off to a worker.");
  }
  // Every clip is branded automatically — see WATERMARK_LOGO_PATH — there's
  // no per-upload watermark to configure.
  runPipeline(jobId, location.localSourcePath, {
    captionStyle: options.captionStyle,
    mode: options.mode,
    clipCount: options.clipCount,
    targetDurationSeconds: options.targetDurationSeconds,
    languageId: options.languageId,
    captionLanguageId: options.captionLanguageId,
    formats: options.formats,
    removeFillers: options.removeFillers,
    watermarkPath: WATERMARK_LOGO_PATH,
  }).catch((err) => {
    console.error(`Pipeline failed for job ${jobId}:`, err);
  });
}

// Blob-storage mode: the browser has already uploaded the video directly to
// Vercel Blob — see app/page.tsx and app/api/upload/token/route.ts —
// because Vercel's serverless functions cap request bodies far below
// typical video sizes. This route just receives the resulting URL as JSON
// and creates the job.
async function handleBlobUpload(request: Request) {
  const body = (await request.json()) as {
    sourceUrl?: string;
    sourceFilename?: string;
    [key: string]: unknown;
  };

  if (!body.sourceUrl || typeof body.sourceFilename !== "string") {
    return Response.json({ error: "Missing uploaded video." }, { status: 400 });
  }

  const ext = (body.sourceFilename.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return Response.json(
      { error: `Unsupported file type ".${ext}". Try mp4, mov, webm, mkv, or m4v.` },
      { status: 400 }
    );
  }

  const fields: Record<string, string | undefined> = {
    mode: typeof body.mode === "string" ? body.mode : undefined,
    captionStyle: typeof body.captionStyle === "string" ? body.captionStyle : undefined,
    language: typeof body.language === "string" ? body.language : undefined,
    captionLanguage: typeof body.captionLanguage === "string" ? body.captionLanguage : undefined,
    clipCount: typeof body.clipCount === "string" ? body.clipCount : undefined,
    targetDurationSeconds: typeof body.targetDurationSeconds === "string" ? body.targetDurationSeconds : undefined,
    removeFillers: typeof body.removeFillers === "string" ? body.removeFillers : undefined,
  };
  const options = parseOptions(fields, Array.isArray(body.formats) ? body.formats : []);

  const jobId = randomUUID();
  try {
    await startJob(
      jobId,
      options,
      { sourceFilename: body.sourceFilename, sourceExt: ext },
      { sourceUrl: body.sourceUrl }
    );
  } catch (err) {
    console.error(`Failed to start job ${jobId}:`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create job." },
      { status: 500 }
    );
  }

  return Response.json({ jobId });
}

// Local-dev mode (and any single-process deployment without Vercel Blob):
// the video comes straight through as multipart form data and lands on
// local disk, exactly as this route always worked.
async function handleLocalUpload(request: Request) {
  const formData = await request.formData();
  const file = formData.get("video");

  if (!(file instanceof File)) {
    return Response.json({ error: "No video file provided." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return Response.json(
      { error: `Unsupported file type ".${ext}". Try mp4, mov, webm, mkv, or m4v.` },
      { status: 400 }
    );
  }

  const fields: Record<string, string | undefined> = {};
  for (const key of [
    "mode",
    "captionStyle",
    "language",
    "captionLanguage",
    "clipCount",
    "targetDurationSeconds",
    "removeFillers",
  ]) {
    const value = formData.get(key);
    if (typeof value === "string") fields[key] = value;
  }
  const options = parseOptions(fields, formData.getAll("formats"));

  const jobId = randomUUID();
  const dir = uploadDirFor(jobId);
  await fs.mkdir(dir, { recursive: true });
  const sourcePath = path.join(dir, `source.${ext}`);
  await fs.writeFile(sourcePath, Buffer.from(await file.arrayBuffer()));

  try {
    await startJob(jobId, options, { sourceFilename: file.name, sourceExt: ext }, { localSourcePath: sourcePath });
  } catch (err) {
    console.error(`Failed to start job ${jobId}:`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create job." },
      { status: 500 }
    );
  }

  return Response.json({ jobId });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/json") ? handleBlobUpload(request) : handleLocalUpload(request);
}
