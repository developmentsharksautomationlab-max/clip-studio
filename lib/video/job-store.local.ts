import { promises as fs } from "node:fs";
import path from "node:path";
import { JOBS_DIR, jobFilePath } from "./paths";
import type { ClipFormat, ClipMode, Job } from "./types";
import type { CaptionChoice } from "./caption-styles";

export interface CreateJobOptions {
  sourceFilename: string;
  sourceExt: string;
  sourceUrl?: string;
  captionStyle: CaptionChoice;
  mode: ClipMode;
  clipCount?: number;
  targetDurationSeconds?: number;
  languageId: string;
  captionLanguageId?: string;
  formats: ClipFormat[];
  removeFillers: boolean;
}

async function ensureJobsDir(): Promise<void> {
  await fs.mkdir(JOBS_DIR, { recursive: true });
}

// All reads of a job's status happen at any time (a finished write is always
// valid JSON, so concurrent reads are safe), but writes are serialized per
// job here. Progress callbacks fire in quick succession during rendering,
// and two overlapping write-tmp-then-rename cycles for the same file can
// make Windows reject the second rename with EPERM, which previously
// surfaced as a hard pipeline failure despite processing having succeeded.
const queues = new Map<string, Promise<unknown>>();

function runExclusive<T>(jobId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(jobId) ?? Promise.resolve();
  const run = previous.then(task, task);
  queues.set(
    jobId,
    run.then(
      () => {},
      () => {}
    )
  );
  return run;
}

// Windows can reject a rename with EPERM/EBUSY while the destination is
// momentarily open elsewhere (e.g. a GET /api/jobs/[id] request reading the
// file for a polling client in another process). That handle is normally
// held for only a few milliseconds, so a short retry clears it reliably
// instead of failing the whole pipeline over a transient lock.
async function renameWithRetry(tmpPath: string, finalPath: string): Promise<void> {
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fs.rename(tmpPath, finalPath);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const isTransient = code === "EPERM" || code === "EBUSY";
      if (!isTransient || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
    }
  }
}

async function writeJobFile(job: Job): Promise<void> {
  await ensureJobsDir();
  const finalPath = jobFilePath(job.id);
  // Unique per write so concurrent writers (e.g. a manual recovery script
  // running alongside the app) never clobber each other's tmp file.
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(job, null, 2), "utf8");
  await renameWithRetry(tmpPath, finalPath);
}

export async function createJob(id: string, options: CreateJobOptions): Promise<Job> {
  const now = new Date().toISOString();
  const job: Job = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    sourceFilename: options.sourceFilename,
    sourceExt: options.sourceExt,
    sourceUrl: options.sourceUrl,
    captionStyle: options.captionStyle,
    mode: options.mode,
    clipCount: options.clipCount,
    targetDurationSeconds: options.targetDurationSeconds,
    languageId: options.languageId,
    captionLanguageId: options.captionLanguageId,
    formats: options.formats,
    removeFillers: options.removeFillers,
    clips: [],
  };
  await runExclusive(id, () => writeJobFile(job));
  return job;
}

export async function writeJob(job: Job): Promise<void> {
  await runExclusive(job.id, () => writeJobFile(job));
}

export async function readJob(id: string): Promise<Job | null> {
  try {
    const raw = await fs.readFile(jobFilePath(id), "utf8");
    return JSON.parse(raw) as Job;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function listJobs(): Promise<Job[]> {
  await ensureJobsDir();
  const entries = await fs.readdir(JOBS_DIR);
  const jobs: Job[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json") || entry.endsWith(".tmp")) continue;
    try {
      const raw = await fs.readFile(path.join(JOBS_DIR, entry), "utf8");
      jobs.push(JSON.parse(raw) as Job);
    } catch {
      // Skip a job file mid-write or otherwise corrupt rather than failing
      // the whole listing.
    }
  }

  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateJob(
  id: string,
  patch: Partial<Omit<Job, "id" | "createdAt">>
): Promise<Job> {
  return runExclusive(id, async () => {
    const existing = await readJob(id);
    if (!existing) throw new Error(`Job not found: ${id}`);
    const updated: Job = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await writeJobFile(updated);
    return updated;
  });
}

// No queue-claiming semantics in local mode: the upload route calls
// runPipeline() directly and in-process, so nothing ever polls for "queued"
// jobs here. Kept only so job-store.ts's dispatcher has a symmetric surface.
export async function claimNextQueuedJob(): Promise<Job | null> {
  throw new Error("claimNextQueuedJob is only available in Postgres mode (set POSTGRES_URL).");
}
