import JobViewer from "./job-viewer";

export default async function StudioJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JobViewer jobId={id} />;
}
