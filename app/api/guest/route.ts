import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { newGuestToken, guestAddress } from "@/lib/guest";
import { DEMO_ENABLED } from "@/lib/config";
import { normaliseReferralCode } from "@/lib/fees";
import { notify } from "@/lib/feed";

const A = ["degen", "wick", "chad", "ape", "moon", "fade", "pump", "ser", "gm", "based", "liquid", "turbo", "alpha", "gigachad", "sigma", "ngmi", "wagmi", "diamond", "paper", "rekt"];
const B = ["maxi", "hunter", "lord", "cat", "enjoyer", "andy", "farmer", "wizard", "goblin", "whale", "shrimp", "pilot", "knight", "oracle", "scalper", "sniper", "hands", "brain", "king", "pleb"];

/** POST /api/guest → a guest identity AND a ready-made demo profile, so the person lands in the feed with no sign-up. */
export async function POST(req: Request) {
  if (!DEMO_ENABLED) return Response.json({ error: "demo mode is off" }, { status: 403 });
  await ensureSchema();
  try {
    const { id, token } = newGuestToken();
    // Unique fun handle: adjective + noun + 2 digits; retry on the rare collision.
    let handle = "";
    for (let i = 0; i < 8 && !handle; i++) {
      const h = `${A[Math.floor(Math.random() * A.length)]}_${B[Math.floor(Math.random() * B.length)]}${Math.floor(10 + Math.random() * 90)}`;
      const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, h)).limit(1);
      if (!taken) handle = h;
    }
    if (!handle) handle = `guest_${Date.now().toString(36).slice(-6)}`;
    // Referral (from a challenge/invite link): credit the sender and give the newcomer the referred fee tier.
    let referredBy: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      const code = normaliseReferralCode(body?.ref);
      if (code) {
        const [ref] = await db.select({ id: schema.users.id, isBot: schema.users.isBot }).from(schema.users).where(eq(schema.users.handle, code)).limit(1);
        if (ref && !ref.isBot) referredBy = ref.id;
      }
    } catch {}
    const [profile] = await db
      .insert(schema.users)
      .values({ id, address: guestAddress(id), handle, bio: "Guest account. Practising with $10,000 of demo money.", isDemo: true, referredBy, referredAt: referredBy ? new Date() : null })
      .returning();
    await db.insert(schema.stats).values({ userId: profile.id }).onConflictDoNothing();
    if (referredBy) await notify(referredBy, "referral", `@${handle} joined from your link`, "They're on demo for now. When they trade real money you earn a share of every fee.", "/settings");
    return Response.json({ token, profile });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
