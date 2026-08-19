import * as localStore from "./job-store.local";
import type { CreateJobOptions } from "./job-store.local";
import type { Job } from "./types";

export type { CreateJobOptions };

// Dispatches to a Postgres-backed store when POSTGRES_URL is set (production:
// Vercel web app + worker sharing one database), otherwise the local JSON-
// file store (npm run dev, zero config). The Postgres module is imported
// dynamically and lazily so that importing job-store.ts never itself tries
// to open a database connection in local mode.
function usingPostgres(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

let postgresStore: Promise<typeof import("./job-store.postgres")> | null = null;
function getPostgresStore() {
  if (!postgresStore) postgresStore = import("./job-store.postgres");
  return postgresStore;
}

export async function createJob(id: string, options: CreateJobOptions): Promise<Job> {
  if (usingPostgres()) return (await getPostgresStore()).createJob(id, options);
  return localStore.createJob(id, options);
}

export async function writeJob(job: Job): Promise<void> {
  if (usingPostgres()) return (await getPostgresStore()).writeJob(job);
  return localStore.writeJob(job);
}

export async function readJob(id: string): Promise<Job | null> {
  if (usingPostgres()) return (await getPostgresStore()).readJob(id);
  return localStore.readJob(id);
}

export async function listJobs(): Promise<Job[]> {
  if (usingPostgres()) return (await getPostgresStore()).listJobs();
  return localStore.listJobs();
}

export async function updateJob(
  id: string,
  patch: Partial<Omit<Job, "id" | "createdAt">>
): Promise<Job> {
  if (usingPostgres()) return (await getPostgresStore()).updateJob(id, patch);
  return localStore.updateJob(id, patch);
}

// Worker-only: claims the oldest queued job so it can run the pipeline for
// it. Always Postgres-backed — there's nothing to poll for in local mode,
// where the upload route runs the pipeline in-process instead.
export async function claimNextQueuedJob(): Promise<Job | null> {
  if (!usingPostgres()) {
    throw new Error("claimNextQueuedJob requires POSTGRES_URL to be set.");
  }
  return (await getPostgresStore()).claimNextQueuedJob();
}
