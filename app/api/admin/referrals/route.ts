import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

import { staffFrom } from "@/lib/staff";
async function authed(req: Request) {
  const s = await staffFrom(req);
  return s?.role === "owner";
}

/**
 * GET /api/admin/referrals?key=CRON_SECRET → every referrer with what they've earned, been paid and are owed,
 * plus the wallet to send USDC to. Your weekly payout list.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await authed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      userId: schema.users.id,
      handle: schema.users.handle,
      address: schema.users.address,
      referees: sql<number>`(select count(*) from users r where r.referred_by = "users"."id")`.mapWith(Number),
      earnedUsd: sql<number>`coalesce((select sum(share_usd) from referral_earnings e where e.referrer_id = "users"."id"), 0)`.mapWith(Number),
      paidUsd: sql<number>`coalesce((select sum(amount_usd) from referral_payouts p where p.referrer_id = "users"."id"), 0)`.mapWith(Number),
      builderFeeUsd: sql<number>`coalesce((select sum(builder_fee_usd) from referral_earnings e where e.referrer_id = "users"."id" and e.kind = 'invite'), 0)`.mapWith(Number),
    })
    .from(schema.users)
    .where(sql`exists (select 1 from users r where r.referred_by = "users"."id") or exists (select 1 from referral_earnings e where e.referrer_id = "users"."id")`)
    .orderBy(desc(sql`coalesce((select sum(share_usd) from referral_earnings e where e.referrer_id = "users"."id"), 0)`));
  const out = rows.map((r) => ({ ...r, owedUsd: Number(Math.max(0, r.earnedUsd - r.paidUsd).toFixed(4)) }));
  const [tot] = await db.select({ fee: sql<number>`coalesce(sum(builder_fee_usd),0)`.mapWith(Number), share: sql<number>`coalesce(sum(share_usd),0)`.mapWith(Number) }).from(schema.referralEarnings);
  return Response.json({ referrers: out, totals: { referredBuilderFeeUsd: tot?.fee ?? 0, referrerShareUsd: tot?.share ?? 0, totalOwedUsd: Number(out.reduce((a, r) => a + r.owedUsd, 0).toFixed(4)) } });
}

const Body = z.object({ handle: z.string().min(3).max(20), amountUsd: z.number().positive(), txHash: z.string().max(100).optional(), note: z.string().max(200).optional() });

/** POST /api/admin/referrals?key=… {handle, amountUsd, txHash?} → record a payout you've sent. */
export async function POST(req: Request) {
  if (!(await authed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, parsed.data.handle.toLowerCase())).limit(1);
  if (!u) return Response.json({ error: "no such user" }, { status: 404 });
  const [row] = await db.insert(schema.referralPayouts).values({ referrerId: u.id, amountUsd: String(parsed.data.amountUsd), txHash: parsed.data.txHash, note: parsed.data.note }).returning();
  await db.insert(schema.notifications).values({ userId: u.id, type: "payout", title: `Referral payout: $${parsed.data.amountUsd.toFixed(2)} USDC`, body: "Sent to your Perped wallet.", href: "/settings" });
  return Response.json({ ok: true, payout: row });
}
