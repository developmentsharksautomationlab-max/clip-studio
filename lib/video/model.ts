import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { MODELS_DIR } from "./paths";

// "base" for better transcription accuracy. On a low-memory machine this can
// fail to allocate under heavy memory pressure (close some other apps if
// so); set WHISPER_MODEL=tiny for a smaller, more reliable but less
// accurate model instead.
const MODEL_NAME = process.env.WHISPER_MODEL || "base";
const MODEL_FILENAME = `ggml-${MODEL_NAME}.bin`;
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILENAME}`;

export function modelPath(): string {
  return path.join(MODELS_DIR, MODEL_FILENAME);
}

async function fileExistsNonEmpty(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size > 0;
  } catch {
    return false;
  }
}

export async function ensureWhisperModel(
  onProgress?: (message: string) => void
): Promise<string> {
  await fs.mkdir(MODELS_DIR, { recursive: true });
  const finalPath = modelPath();

  if (await fileExistsNonEmpty(finalPath)) {
    return finalPath;
  }

  onProgress?.(`Downloading speech model (${MODEL_FILENAME})...`);

  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download whisper model from ${MODEL_URL}: ${response.status} ${response.statusText}`
    );
  }

  const tmpPath = `${finalPath}.tmp`;
  await pipeline(
    Readable.fromWeb(response.body as import("stream/web").ReadableStream),
    createWriteStream(tmpPath)
  );
  await fs.rename(tmpPath, finalPath);

  onProgress?.("Speech model ready.");
  return finalPath;
}
