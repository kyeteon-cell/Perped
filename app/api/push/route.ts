import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";
import { pushTo, vapidKeys } from "@/lib/push";

export const dynamic = "force-dynamic";

/** GET /api/push → the public key the browser needs to subscribe. */
export async function GET() {
  await ensureSchema();
  const k = await vapidKeys();
  return Response.json({ publicKey: k.publicKey }, { headers: { "cache-control": "public, s-maxage=3600" } });
}

const Sub = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(4) }), test: z.boolean().optional() });

/** POST /api/push {subscription} → turn alerts on for this device (and send a test). */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const parsed = Sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid subscription" }, { status: 400 });
  const s = parsed.data;
  await db.insert(schema.pushSubs).values({ userId: auth.privyId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth })
    .onConflictDoUpdate({ target: schema.pushSubs.endpoint, set: { userId: auth.privyId, p256dh: s.keys.p256dh, auth: s.keys.auth } });
  if (s.test !== false) await pushTo(auth.privyId, { title: "Alerts are on", body: "You'll hear about fades, battles, your rivals' trades and last stands here.", href: "/arena", tag: "welcome" });
  return Response.json({ ok: true });
}

/** DELETE /api/push {endpoint} → turn alerts off for this device. */
export async function DELETE(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const body = await req.json().catch(() => ({})) as { endpoint?: string };
  if (body.endpoint) await db.delete(schema.pushSubs).where(and(eq(schema.pushSubs.endpoint, body.endpoint), eq(schema.pushSubs.userId, auth.privyId)));
  return Response.json({ ok: true });
}
