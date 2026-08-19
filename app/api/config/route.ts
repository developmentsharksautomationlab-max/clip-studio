export const runtime = "nodejs";
// Must be evaluated per-request, not cached/prerendered — this is exactly
// the "is blob storage configured *right now*" check, which a build-time
// constant (NEXT_PUBLIC_*) got wrong in practice: it only reflects whatever
// was set at the moment a given build ran, so it silently goes stale the
// next time env vars change without a fresh deploy. Reading the real
// (non-public) token at request time instead means this can never drift
// out of sync with what the server can actually do.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    blobUploadsEnabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  });
}
