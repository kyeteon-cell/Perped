import { desc, ilike } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/users?q=ka → up to 12 traders whose handle starts with / contains q, highest XP first. */
export async function GET(req: Request) {
  await ensureSchema();
  const q = (new URL(req.url).searchParams.get("q") ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  const rows = await db.select({ handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, xp: schema.users.xp }).from(schema.users)
    .where(q ? ilike(schema.users.handle, `%${q}%`) : undefined).orderBy(desc(schema.users.xp)).limit(12);
  return Response.json({ users: rows });
}
