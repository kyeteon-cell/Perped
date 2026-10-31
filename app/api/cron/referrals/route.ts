import { sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getUserFillsByTime } from "@/lib/hl-info";
import { countActiveReferees } from "@/lib/referrals";
import { CREATOR_FOUNDER_PCT, CREATOR_MIN_HOLD_S, CREATOR_PCT, CREATOR_RANKED_LEVEL, CREATOR_RANKED_PCT, FOUNDER_L2_PCT, PAYOUT_CAP_PCT, founderL1Pct, isFounder } from "@/lib/programme-rates";
import { rankFor } from "@/lib/rank";
import { referralSharePct } from "@/lib/fees";
import { BUILDER_CONFIGURED } from "@/lib/config";

/**
 * GET /api/cron/referrals[?day=YYYY-MM-DD] → once a day (after 00:00 UTC): for every live trader, read
 * yesterday's Hyperliquid fills, sum the builder fee they paid us, and credit:
 *  - invite:  whoever invited them (founder 50% → 40% after a year; others 25%, 40% at 10 active invites)
 *  - invite2: a founder whose invitee invited them (10%)
 *  - creator: the author of the trade or call they copied/faded (10%, 15% from Liquidator, founders 20%),
 *             only for positions held 2+ minutes, never for your own posts
 * The total paid on one trader's fees is capped at 70%. Idempotent per (trader, day, earner, kind).
 *
 * Fees come from the `builderFee` field on each fill, so only fills routed through Perped count.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  await ensureSchema();
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("key") === secret;
  if (secret && !auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!BUILDER_CONFIGURED) return Response.json({ ok: false, error: "no builder address configured" });

  const dayParam = url.searchParams.get("day");
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const start = Date.parse(`${day}T00:00:00Z`);
  const end = start + 86_400_000;

  const users = await db
    .select({ id: schema.users.id, address: schema.users.address, referredBy: schema.users.referredBy })
    .from(schema.users)
    .where(sql`${schema.users.isDemo} = false and ${schema.users.isBot} = false`);
  type Earner = { id: string; address: string; referredBy: string | null; founderSeat: number | null; founderStatus: string | null; founderSince: Date | null; xp: number };
  const earnerCache = new Map<string, Earner | null>();
  const earner = async (id: string) => {
    if (earnerCache.has(id)) return earnerCache.get(id)!;
    const [e] = await db.select({ id: schema.users.id, address: schema.users.address, referredBy: schema.users.referredBy, founderSeat: schema.users.founderSeat, founderStatus: schema.users.founderStatus, founderSince: schema.users.founderSince, xp: schema.users.xp })
      .from(schema.users).where(sql`${schema.users.id} = ${id}`).limit(1);
    earnerCache.set(id, e ?? null); return e ?? null;
  };
  const shareCache = new Map<string, number>();
  const inviteRate = async (e: Earner) => {
    if (isFounder(e)) return founderL1Pct(e.founderSince);
    let pct = shareCache.get(e.id);
    if (pct === undefined) { pct = referralSharePct(await countActiveReferees(e.id)); shareCache.set(e.id, pct); }
    return pct;
  };
  const creatorRate = (e: Earner) => (isFounder(e) ? CREATOR_FOUNDER_PCT : rankFor(e.xp ?? 0).level >= CREATOR_RANKED_LEVEL ? CREATOR_RANKED_PCT : CREATOR_PCT);

  let traders = 0, totalFeeUsd = 0, totalShareUsd = 0;
  for (const u of users) {
    try {
      const fills = (await getUserFillsByTime(u.address, start, end)).filter((f) => Number(f.builderFee ?? 0) > 0);
      // Their copied/faded positions that were open during the day, with the source post's author.
      const linked = await db.execute(sql`select p.id, p.coin, p.created_at as "createdAt", p.closed_at as "closedAt", s.user_id as "author", s.kind as "srcKind"
        from posts p join posts s on s.id = coalesce(p.copied_from_id, p.faded_from_id)
        where p.user_id = ${u.id} and p.kind = 'trade' and p.paper = false and s.user_id <> ${u.id}
          and p.created_at <= ${new Date(end).toISOString()} and (p.closed_at is null or p.closed_at >= ${new Date(start - 86_400_000).toISOString()})`);
      const posts = (linked as unknown as { rows?: unknown[] }).rows ?? (linked as unknown as unknown[]);
      const lp = (posts as { coin: string; createdAt: string; closedAt: string | null; author: string }[]).map((p) => ({ ...p, open: new Date(p.createdAt).getTime(), close: p.closedAt ? new Date(p.closedAt).getTime() : Infinity }));

      let fee = 0, volume = 0, n = 0;
      const byCreator = new Map<string, { fee: number; volume: number; n: number }>();
      for (const f of fills) {
        const b = Number(f.builderFee ?? 0), v = Number(f.px) * Number(f.sz);
        fee += b; volume += v; n++;
        const src = lp.find((p) => p.coin === f.coin && f.time >= p.open - 60_000 && f.time <= p.close + 60_000 && p.close - p.open >= CREATOR_MIN_HOLD_S * 1000);
        if (src) { const c = byCreator.get(src.author) ?? { fee: 0, volume: 0, n: 0 }; c.fee += b; c.volume += v; c.n++; byCreator.set(src.author, c); }
      }
      const rows: { referrerId: string; kind: string; pct: number; share: number; fee: number; volume: number; n: number }[] = [];
      const me = await earner(u.id);
      if (u.referredBy) {
        const inv = await earner(u.referredBy);
        if (inv) {
          const pct = await inviteRate(inv);
          rows.push({ referrerId: inv.id, kind: "invite", pct, share: (fee * pct) / 100, fee, volume, n });
          if (inv.referredBy) {
            const top = await earner(inv.referredBy);
            if (top && isFounder(top) && top.id !== u.id) rows.push({ referrerId: top.id, kind: "invite2", pct: FOUNDER_L2_PCT, share: (fee * FOUNDER_L2_PCT) / 100, fee, volume, n });
          }
        }
      }
      for (const [author, c] of byCreator) {
        const cr = await earner(author);
        if (!cr || (me && cr.address && me.address && cr.address.toLowerCase() === me.address.toLowerCase())) continue;
        const pct = creatorRate(cr);
        rows.push({ referrerId: cr.id, kind: "creator", pct, share: (c.fee * pct) / 100, fee: c.fee, volume: c.volume, n: c.n });
      }
      // Cap: never pay out more than 70% of this trader's fees for the day.
      const paid = rows.reduce((a, r) => a + r.share, 0), cap = (fee * PAYOUT_CAP_PCT) / 100;
      const k = paid > cap && paid > 0 ? cap / paid : 1;
      for (const r of rows) {
        const row = { referrerId: r.referrerId, refereeId: u.id, day, kind: r.kind, fills: r.n, volumeUsd: r.volume.toFixed(2), builderFeeUsd: r.fee.toFixed(6), sharePct: (r.pct * k).toFixed(3), shareUsd: (r.share * k).toFixed(6) };
        await db.insert(schema.referralEarnings).values(row).onConflictDoUpdate({ target: [schema.referralEarnings.refereeId, schema.referralEarnings.day, schema.referralEarnings.referrerId, schema.referralEarnings.kind], set: row });
        totalShareUsd += r.share * k;
      }
      if (n) { traders++; totalFeeUsd += fee; }
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      /* skip this trader this run */
    }
  }
  return Response.json({ ok: true, day, traders: users.length, credited: traders, builderFeeUsd: Number(totalFeeUsd.toFixed(4)), paidOutUsd: Number(totalShareUsd.toFixed(4)) });
}
