import { and, eq, ne } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { checkLinkSignature, hasHistory, readHlRecord } from "@/lib/hl-import";

export const dynamic = "force-dynamic";

/** GET /api/me/hl-import → your linked Hyperliquid record, if any. */
export async function GET(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const [r] = await db.select().from(schema.hlImports).where(eq(schema.hlImports.userId, auth.privyId)).limit(1);
  return Response.json({ record: r ?? null });
}

/** POST /api/me/hl-import {address, issued, signature} → prove you own the wallet, then pull its record. */
export async function POST(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "no profile" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { address?: string; issued?: string; signature?: string };
  const address = (b.address ?? "").toLowerCase();
  const bad = await checkLinkSignature(address, me.handle, b.issued ?? "", b.signature ?? "");
  if (bad) return Response.json({ error: bad }, { status: 400 });
  const [other] = await db.select({ userId: schema.hlImports.userId }).from(schema.hlImports).where(and(eq(schema.hlImports.address, address), ne(schema.hlImports.userId, me.id))).limit(1);
  if (other) return Response.json({ error: "That wallet's record is already on another Perped account" }, { status: 409 });
  const rec = await readHlRecord(address).catch(() => null);
  if (!rec) return Response.json({ error: "Couldn't reach Hyperliquid. Try again in a minute." }, { status: 502 });
  if (!hasHistory(rec)) return Response.json({ error: "That wallet has no perps history on Hyperliquid yet" }, { status: 400 });
  const now = new Date();
  await db.insert(schema.hlImports).values({ userId: me.id, address, verifiedAt: now, refreshedAt: now, summary: rec })
    .onConflictDoUpdate({ target: schema.hlImports.userId, set: { address, verifiedAt: now, refreshedAt: now, summary: rec } });
  return Response.json({ ok: true, record: rec });
}

/** PATCH /api/me/hl-import → refresh the numbers now (at most every 10 minutes). */
export async function PATCH(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const [r] = await db.select().from(schema.hlImports).where(eq(schema.hlImports.userId, auth.privyId)).limit(1);
  if (!r) return Response.json({ error: "No wallet linked" }, { status: 404 });
  if (Date.now() - new Date(r.refreshedAt).getTime() < 10 * 60_000) return Response.json({ ok: true, record: r.summary });
  const rec = await readHlRecord(r.address).catch(() => null);
  if (!rec) return Response.json({ error: "Couldn't reach Hyperliquid. Try again in a minute." }, { status: 502 });
  await db.update(schema.hlImports).set({ summary: rec, refreshedAt: new Date() }).where(eq(schema.hlImports.userId, auth.privyId));
  return Response.json({ ok: true, record: rec });
}

/** DELETE /api/me/hl-import → remove the record from your profile. */
export async function DELETE(req: Request) {
  await ensureSchema();
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  await db.delete(schema.hlImports).where(eq(schema.hlImports.userId, auth.privyId));
  return Response.json({ ok: true });
}
