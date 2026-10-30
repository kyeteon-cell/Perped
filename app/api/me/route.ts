import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, getProfile, unauthorized, HANDLE_RE } from "@/lib/auth";

/** GET /api/me → profile (null until a handle is chosen), wallet address, unread notification count. */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const profile = await getProfile(auth.privyId);
  let unread = 0;
  if (profile) {
    const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.notifications).where(and(eq(schema.notifications.userId, profile.id), eq(schema.notifications.read, false)));
    unread = r?.n ?? 0;
  }
  return Response.json({ profile, address: auth.address, unread });
}

const Body = z.object({ handle: z.string().toLowerCase().regex(HANDLE_RE, "3–20 chars, a–z 0–9 _"), bio: z.string().max(160).optional(), avatarUrl: z.string().url().max(500).optional() });

/** POST /api/me → create or update the profile (onboarding step 2 / edit profile). */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  if (!auth.address) return Response.json({ error: "wallet not ready" }, { status: 400 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const { handle, bio, avatarUrl } = parsed.data;
  const taken = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  if (taken[0] && taken[0].id !== auth.privyId) return Response.json({ error: "handle taken" }, { status: 409 });
  const [row] = await db
    .insert(schema.users)
    .values({ id: auth.privyId, address: auth.address, handle, bio, avatarUrl })
    .onConflictDoUpdate({ target: schema.users.id, set: { handle, bio, avatarUrl, address: auth.address } })
    .returning();
  await db.insert(schema.stats).values({ userId: row.id }).onConflictDoNothing();
  return Response.json({ profile: row });
}
