import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { jobs } from "../db/schema";
import type { CreateJobOptions } from "./job-store.local";
import type { Job } from "./types";

type JobRow = typeof jobs.$inferSelect;

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sourceFilename: row.sourceFilename,
    sourceExt: row.sourceExt,
    sourceUrl: row.sourceUrl ?? undefined,
    captionStyle: row.captionStyle,
    mode: row.mode,
    clipCount: row.clipCount ?? undefined,
    targetDurationSeconds: row.targetDurationSeconds ?? undefined,
    languageId: row.languageId,
    formats: row.formats,
    removeFillers: row.removeFillers,
    progressMessage: row.progressMessage ?? undefined,
    error: row.error ?? undefined,
    transcript: row.transcript ?? undefined,
    clips: row.clips,
  };
}

export async function createJob(id: string, options: CreateJobOptions): Promise<Job> {
  const now = new Date();
  const [row] = await db
    .insert(jobs)
    .values({
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
      formats: options.formats,
      removeFillers: options.removeFillers,
      clips: [],
    })
    .returning();
  return rowToJob(row);
}

export async function writeJob(job: Job): Promise<void> {
  await db
    .insert(jobs)
    .values({
      id: job.id,
      status: job.status,
      createdAt: new Date(job.createdAt),
      updatedAt: new Date(),
      sourceFilename: job.sourceFilename,
      sourceExt: job.sourceExt,
      sourceUrl: job.sourceUrl,
      captionStyle: job.captionStyle,
      mode: job.mode,
      clipCount: job.clipCount,
      targetDurationSeconds: job.targetDurationSeconds,
      languageId: job.languageId,
      formats: job.formats,
      removeFillers: job.removeFillers,
      progressMessage: job.progressMessage,
      error: job.error,
      transcript: job.transcript,
      clips: job.clips,
    })
    .onConflictDoUpdate({
      target: jobs.id,
      set: {
        status: job.status,
        updatedAt: new Date(),
        progressMessage: job.progressMessage,
        error: job.error,
        transcript: job.transcript,
        clips: job.clips,
        sourceUrl: job.sourceUrl,
      },
    });
}

export async function readJob(id: string): Promise<Job | null> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return row ? rowToJob(row) : null;
}

export async function listJobs(): Promise<Job[]> {
  const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt));
  return rows.map(rowToJob);
}

export async function updateJob(
  id: string,
  patch: Partial<Omit<Job, "id" | "createdAt">>
): Promise<Job> {
  const [row] = await db
    .update(jobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(jobs.id, id))
    .returning();
  if (!row) throw new Error(`Job not found: ${id}`);
  return rowToJob(row);
}

// Atomically claims the oldest queued job for the worker: SKIP LOCKED lets
// multiple worker instances poll the same table concurrently without ever
// double-claiming a job.
export async function claimNextQueuedJob(): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .orderBy(jobs.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });

    if (!row) return null;

    const [claimed] = await tx
      .update(jobs)
      .set({ status: "transcribing", progressMessage: "Picked up by worker...", updatedAt: new Date() })
      .where(eq(jobs.id, row.id))
      .returning();

    return rowToJob(claimed);
  });
}
