import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createJob } from "@/lib/video/job-store";
import { uploadDirFor } from "@/lib/video/paths";
import { runPipeline } from "@/lib/video/pipeline";
import { isCaptionStyleId, type CaptionChoice } from "@/lib/video/caption-styles";
import { isLanguageId, DEFAULT_LANGUAGE_ID } from "@/lib/video/languages";
import type { ClipFormat, ClipMode } from "@/lib/video/types";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "m4v"]);
const ALLOWED_WATERMARK_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const ALLOWED_FORMATS = new Set<ClipFormat>(["vertical", "original", "square"]);
const DEFAULT_FORMATS: ClipFormat[] = ["vertical", "original"];
const MAX_CLIP_COUNT = 20;
const ALLOWED_DURATIONS = new Set([15, 30, 60]);

function parseCaptionChoice(value: FormDataEntryValue | null): CaptionChoice {
  if (typeof value === "string" && (value === "none" || isCaptionStyleId(value))) {
    return value;
  }
  return "none";
}

function parseMode(value: FormDataEntryValue | null): ClipMode {
  return value === "caption-only" ? "caption-only" : "clips";
}

function parseLanguageId(value: FormDataEntryValue | null): string {
  if (typeof value === "string" && isLanguageId(value)) {
    return value;
  }
  return DEFAULT_LANGUAGE_ID;
}

function parseClipCount(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.min(MAX_CLIP_COUNT, Math.round(parsed));
}

function parseTargetDurationSeconds(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return ALLOWED_DURATIONS.has(parsed) ? parsed : undefined;
}

function parseFormats(values: FormDataEntryValue[]): ClipFormat[] {
  const formats = [...new Set(values)].filter(
    (v): v is ClipFormat => typeof v === "string" && ALLOWED_FORMATS.has(v as ClipFormat)
  );
  return formats.length > 0 ? formats : DEFAULT_FORMATS;
}

function parseBoolean(value: FormDataEntryValue | null): boolean {
  return value === "true";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("video");
  const captionStyle = parseCaptionChoice(formData.get("captionStyle"));
  const mode = parseMode(formData.get("mode"));
  const languageId = parseLanguageId(formData.get("language"));
  const clipCount = mode === "clips" ? parseClipCount(formData.get("clipCount")) : undefined;
  const targetDurationSeconds =
    mode === "clips" ? parseTargetDurationSeconds(formData.get("targetDurationSeconds")) : undefined;
  const formats = parseFormats(formData.getAll("formats"));
  const removeFillers = parseBoolean(formData.get("removeFillers"));
  const watermarkFile = formData.get("watermark");

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

  let watermarkFilename: string | undefined;
  if (watermarkFile instanceof File && watermarkFile.size > 0) {
    const wmExt = (watermarkFile.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_WATERMARK_EXTENSIONS.has(wmExt)) {
      return Response.json(
        { error: `Unsupported watermark image type ".${wmExt}". Try png, jpg, or webp.` },
        { status: 400 }
      );
    }
    watermarkFilename = `watermark.${wmExt}`;
  }

  const jobId = randomUUID();
  const job = await createJob(jobId, {
    sourceFilename: file.name,
    sourceExt: ext,
    captionStyle,
    mode,
    clipCount,
    targetDurationSeconds,
    languageId,
    formats,
    removeFillers,
    watermarkFilename,
  });

  const dir = uploadDirFor(jobId);
  await fs.mkdir(dir, { recursive: true });
  const sourcePath = path.join(dir, `source.${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(sourcePath, buffer);

  let watermarkPath: string | undefined;
  if (watermarkFilename && watermarkFile instanceof File) {
    watermarkPath = path.join(dir, watermarkFilename);
    const wmBuffer = Buffer.from(await watermarkFile.arrayBuffer());
    await fs.writeFile(watermarkPath, wmBuffer);
  }

  runPipeline(jobId, sourcePath, {
    captionStyle,
    mode,
    clipCount,
    targetDurationSeconds,
    languageId,
    formats,
    removeFillers,
    watermarkPath,
  }).catch((err) => {
    console.error(`Pipeline failed for job ${jobId}:`, err);
  });

  return Response.json({ jobId: job.id });
}
