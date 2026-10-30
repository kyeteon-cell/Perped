import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { isGuestId, tokenForGuestId } from "@/lib/guest";

export const dynamic = "force-dynamic";

/** GET /api/admin/guest-key?key=CRON_SECRET&handle=x → the guest key for a guest account (operator-only recovery). */
export async function GET(req: Request) {
  await ensureSchema();
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const handle = (url.searchParams.get("handle") ?? "").toLowerCase();
  const [u] = await db.select({ id: schema.users.id, handle: schema.users.handle }).from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  if (!u) return Response.json({ error: "no such handle" }, { status: 404 });
  if (!isGuestId(u.id)) return Response.json({ error: "not a guest account" }, { status: 400 });
  return Response.json({ handle: u.handle, key: tokenForGuestId(u.id), restore: "Paste it under Restore a guest account on the sign-in sheet, or in Settings." });
}
