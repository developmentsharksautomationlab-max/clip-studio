import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";

const VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/x-m4v",
];

// Authorizes direct browser -> Vercel Blob uploads (see app/page.tsx). Only
// reachable in blob-storage mode; local dev never calls this since it
// uploads the file straight through /api/upload instead. Needed because
// Vercel's serverless functions cap request bodies well below typical video
// sizes, so the video can't be streamed through our own API route there.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: VIDEO_CONTENT_TYPES,
        addRandomSuffix: true,
        maximumSizeInBytes: 5 * 1024 * 1024 * 1024,
      }),
    });

    return Response.json(jsonResponse);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload authorization failed." },
      { status: 400 }
    );
  }
}
