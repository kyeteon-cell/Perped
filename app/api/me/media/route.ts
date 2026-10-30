import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({ kind: z.enum(["avatar", "banner"]), dataUrl: z.string().max(1_600_000).nullable() });
const MAX_BYTES = { avatar: 400_000, banner: 1_100_000 };

/** POST /api/me/media {kind, dataUrl|null} → store (or clear) your avatar / banner. The client resizes before upload. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { kind, dataUrl } = parsed.data;
  const col = kind === "avatar" ? "avatarUrl" : "bannerUrl";
  if (!dataUrl) {
    await db.delete(schema.userMedia).where(and(eq(schema.userMedia.userId, auth.privyId), eq(schema.userMedia.kind, kind)));
    const [row] = await db.update(schema.users).set({ [col]: null }).where(eq(schema.users.id, auth.privyId)).returning();
    return Response.json({ profile: row });
  }
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return Response.json({ error: "send a JPEG, PNG or WebP" }, { status: 400 });
  const [, mime, data] = m;
  if ((data.length * 3) / 4 > MAX_BYTES[kind]) return Response.json({ error: "image too large" }, { status: 413 });
  await db.insert(schema.userMedia).values({ userId: auth.privyId, kind, mime, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.userMedia.userId, schema.userMedia.kind], set: { mime, data, updatedAt: new Date() } });
  const url = `/api/media/${encodeURIComponent(auth.privyId)}/${kind}?v=${Date.now()}`;
  const [row] = await db.update(schema.users).set({ [col]: url }).where(eq(schema.users.id, auth.privyId)).returning();
  return Response.json({ profile: row, url });
}
