import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { byHandle } from "@/lib/programme";
import { db, schema } from "@/lib/db";
import { getAuth, getProfile, unauthorized, HANDLE_RE } from "@/lib/auth";
import { normaliseReferralCode, resolveFeeTier, type FeeInfo } from "@/lib/fees";
import { getFeeInfo } from "@/lib/referrals";

/** GET /api/me → profile (null until a handle is chosen), wallet address, unread count, fee tier. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const profile = await getProfile(auth.privyId);
  let unread = 0;
  let fee: FeeInfo = resolveFeeTier({});
  if (profile) {
    const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.notifications).where(and(eq(schema.notifications.userId, profile.id), eq(schema.notifications.read, false)));
    unread = r?.n ?? 0;
    fee = await getFeeInfo(profile.id, profile.referredBy);
  }
  return Response.json({ profile, address: auth.address, unread, fee, guest: !!auth.guest });
}

const Body = z.object({
  handle: z.string().toLowerCase().regex(HANDLE_RE, "3–20 chars, a–z 0–9 _"),
  bio: z.string().max(160).optional(),
  avatarUrl: z.string().url().max(500).optional(),
  /** Referral code (another user's handle). Only honoured when the profile is first created. */
  referralCode: z.string().max(40).optional().nullable(),
});

/** POST /api/me → create or update the profile (onboarding step 2 / edit profile). */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  if (!auth.address) return Response.json({ error: "wallet not ready" }, { status: 400 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const { handle, bio, avatarUrl, referralCode } = parsed.data;
  const taken = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  if (taken[0] && taken[0].id !== auth.privyId) return Response.json({ error: "handle taken" }, { status: 409 });
  // Old handles keep redirecting to whoever renamed away from them, so they can't be reused by someone else.
  const [reserved] = await db.select({ userId: schema.handleRedirects.userId }).from(schema.handleRedirects).where(eq(schema.handleRedirects.oldHandle, handle)).limit(1);
  if (reserved && reserved.userId !== auth.privyId) return Response.json({ error: "handle taken" }, { status: 409 });

  // Resolve the referrer once, at first signup. Self-referral and unknown codes are ignored silently.
  let referredBy: string | null = null;
  const existing = await getProfile(auth.privyId);
  const code = normaliseReferralCode(referralCode);
  if (!existing && code && code !== handle) {
    const ref = await byHandle(code);
    if (ref && ref.id !== auth.privyId && !ref.isBot) referredBy = ref.id;
  }

  // Signed up with X only (no wallet connected) → demo until they connect one. Wallet signups start live,
  // but only with an invite code: without one they practise on demo until the waitlist lets them in.
  const isDemo = !auth.hasExternalWallet || !!auth.guest || !referredBy;
  const [row] = await db
    .insert(schema.users)
    .values({ id: auth.privyId, address: auth.address, handle, bio, avatarUrl, referredBy, referredAt: referredBy ? new Date() : null, isDemo })
    .onConflictDoUpdate({ target: schema.users.id, set: { handle, bio, avatarUrl, address: auth.address } })
    .returning();
  await db.insert(schema.stats).values({ userId: row.id }).onConflictDoNothing();
  if (existing && existing.handle !== handle) {
    await db.insert(schema.handleRedirects).values({ oldHandle: existing.handle, userId: row.id }).onConflictDoUpdate({ target: schema.handleRedirects.oldHandle, set: { userId: row.id } });
    await db.delete(schema.handleRedirects).where(eq(schema.handleRedirects.oldHandle, handle));
  }
  if (referredBy) {
    await db.insert(schema.notifications).values({ userId: referredBy, type: "referral", title: `@${handle} joined with your code`, body: "You earn a share of the Perped fee on every trade they make.", href: "/settings" });
  }
  const fee = await getFeeInfo(row.id, row.referredBy);
  return Response.json({ profile: row, fee });
}
