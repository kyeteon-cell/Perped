import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";

export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, auth.privyId)).orderBy(desc(schema.notifications.id)).limit(100);
  return Response.json({ notifications: rows, unread: rows.filter((r) => !r.read).length });
}

/** POST /api/notifications → mark all read. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  await db.update(schema.notifications).set({ read: true }).where(eq(schema.notifications.userId, auth.privyId));
  return Response.json({ ok: true });
}
