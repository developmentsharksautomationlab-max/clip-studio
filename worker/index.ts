import path from "node:path";
import { claimNextQueuedJob, updateJob } from "../lib/video/job-store";
import { runPipeline } from "../lib/video/pipeline";
import { uploadDirFor, WATERMARK_LOGO_PATH } from "../lib/video/paths";
import { storage } from "../lib/storage";
import type { Job } from "../lib/video/types";

const POLL_INTERVAL_MS = 3000;

if (!process.env.POSTGRES_URL) {
  throw new Error("worker requires POSTGRES_URL — it has nothing to poll without a shared database.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSource(job: Job): Promise<string> {
  const dir = uploadDirFor(job.id);
  const sourcePath = path.join(dir, `source.${job.sourceExt}`);
  if (!job.sourceUrl) {
    throw new Error(`Job ${job.id} has no sourceUrl to fetch (was it created in blob mode?).`);
  }
  await storage.fetchToLocal(job.sourceUrl, sourcePath);
  return sourcePath;
}

async function processJob(job: Job): Promise<void> {
  console.log(`[worker] picked up job ${job.id} (${job.sourceFilename})`);
  const sourcePath = await fetchSource(job);

  // Every clip is branded automatically with the bundled logo (see
  // Dockerfile.worker, which copies it into the image at this same path) —
  // there's no per-job watermark to fetch.
  await runPipeline(job.id, sourcePath, {
    captionStyle: job.captionStyle,
    mode: job.mode,
    clipCount: job.clipCount,
    targetDurationSeconds: job.targetDurationSeconds,
    languageId: job.languageId,
    captionLanguageId: job.captionLanguageId,
    formats: job.formats,
    removeFillers: job.removeFillers,
    watermarkPath: WATERMARK_LOGO_PATH,
  });
  console.log(`[worker] finished job ${job.id}`);
}

async function main() {
  console.log("[worker] started, polling for queued jobs...");
  for (;;) {
    let job: Job | null = null;
    try {
      job = await claimNextQueuedJob();
    } catch (err) {
      console.error("[worker] failed to poll for jobs:", err);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    try {
      await processJob(job);
    } catch (err) {
      // runPipeline already writes status:"error" on the job for failures
      // inside the pipeline itself; this catches failures in the fetch step
      // that happens before runPipeline takes over, which would otherwise
      // leave the job stuck showing "Transcribing..." forever.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] job ${job.id} failed:`, err);
      await updateJob(job.id, { status: "error", error: message }).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
