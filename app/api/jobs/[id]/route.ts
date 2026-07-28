import { readJob } from "@/lib/video/job-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = await readJob(id);

  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  return Response.json({ job });
}
