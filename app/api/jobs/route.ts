import { listJobs } from "@/lib/video/job-store";

export const runtime = "nodejs";

export async function GET() {
  const jobs = await listJobs();

  const summaries = jobs.map((job) => ({
    id: job.id,
    status: job.status,
    mode: job.mode,
    sourceFilename: job.sourceFilename,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    clipCount: new Set(job.clips.map((c) => c.index)).size,
  }));

  return Response.json({ jobs: summaries });
}
