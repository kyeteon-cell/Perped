export const dynamic = "force-dynamic";

/** GET /api/version → the commit of the version that's live right now. */
export function GET() {
  return Response.json({ build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { headers: { "cache-control": "no-store" } });
}
