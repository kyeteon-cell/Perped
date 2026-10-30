import { botTick } from "@/lib/bots";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq } from "drizzle-orm";

/** GET /api/cron/bots → one tick of demo-trader activity. Every 15 min via Vercel cron. Set BOTS_PAUSED=1 to stop. */
export async function GET(req: Request) {
  await ensureSchema();
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && new URL(req.url).searchParams.get("key") !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.BOTS_PAUSED === "1") return Response.json({ ok: true, paused: true });
  const [any] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isBot, true)).limit(1);
  if (!any) return Response.json({ ok: true, note: "no bots seeded" });
  const log = await botTick();
  return Response.json({ ok: true, actions: log });
}
