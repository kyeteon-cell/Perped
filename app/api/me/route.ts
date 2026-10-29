import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, getProfile, unauthorized, HANDLE_RE } from "@/lib/auth";

/** GET /api/me → the current user's profile (or null if they haven't picked a handle yet). */
export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const profile = await getProfile(auth.privyId);
  return Response.json({ profile, address: auth.address });
}

const Body = z.object({ handle: z.string().toLowerCase().regex(HANDLE_RE, "3–20 chars, a–z 0–9 _"), bio: z.string().max(160).optional() });

/** POST /api/me → create or update profile. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  if (!auth.address) return Response.json({ error: "wallet not ready" }, { status: 400 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const { handle, bio } = parsed.data;

  const taken = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  if (taken[0] && taken[0].id !== auth.privyId) return Response.json({ error: "handle taken" }, { status: 409 });

  const [row] = await db
    .insert(schema.users)
    .values({ id: auth.privyId, address: auth.address, handle, bio })
    .onConflictDoUpdate({ target: schema.users.id, set: { handle, bio, address: auth.address } })
    .returning();
  await db.insert(schema.stats).values({ userId: row.id }).onConflictDoNothing();
  return Response.json({ profile: row });
}
