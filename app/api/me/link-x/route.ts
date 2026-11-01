import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { forgetLink, getAuth, getProfile, unauthorized } from "@/lib/auth";
import { verifyGuestToken } from "@/lib/guest";

export const dynamic = "force-dynamic";

/**
 * POST /api/me/link-x → attach the X login you just signed in with to your guest account.
 * Auth: the fresh Privy (X) token as Bearer, plus the guest key in `x-guest-token`.
 * Afterwards, signing in with that X account opens the guest account on any device.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth || auth.guest) return unauthorized();
  if (!auth.xHandle) return Response.json({ error: "sign in with X first" }, { status: 400 });
  const loginId = auth.loginId ?? auth.privyId;
  const guestId = verifyGuestToken(req.headers.get("x-guest-token") ?? "");
  if (!guestId) return Response.json({ error: "your guest key wasn't recognised" }, { status: 400 });
  const guest = await getProfile(guestId);
  if (!guest) return Response.json({ error: "no account for that guest key" }, { status: 404 });

  const [existing] = await db.select().from(schema.accountLinks).where(eq(schema.accountLinks.privyId, loginId)).limit(1);
  if (existing && existing.userId !== guestId) {
    const [other] = await db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, existing.userId)).limit(1);
    return Response.json({ error: `@${auth.xHandle} is already linked to @${other?.handle ?? "another account"}` }, { status: 409 });
  }
  // If this X login had made its own Perped profile, it stops being reachable once linked. Say which.
  const own = await getProfile(loginId);
  if (!existing) await db.insert(schema.accountLinks).values({ privyId: loginId, userId: guestId }).onConflictDoNothing();
  await db.update(schema.users).set({ xHandle: auth.xHandle }).where(eq(schema.users.id, guestId));
  forgetLink(loginId);
  return Response.json({ ok: true, handle: guest.handle, x: auth.xHandle, replaced: own && own.id !== guestId ? own.handle : null });
}
