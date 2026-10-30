import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/avatar?handle=x → { url } for places that only know a handle (system cards, suggestions). Cached a minute. */
export async function GET(req: Request) {
  await ensureSchema();
  const handle = (new URL(req.url).searchParams.get("handle") ?? "").toLowerCase();
  if (!handle) return Response.json({ url: null });
  const [u] = await db.select({ url: schema.users.avatarUrl, xp: schema.users.xp }).from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  return Response.json({ url: u?.url ?? null, xp: u?.xp ?? 0 }, { headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
}
