import { sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getUserFillsByTime } from "@/lib/hl-info";
import { countActiveReferees } from "@/lib/referrals";
import { referralSharePct } from "@/lib/fees";
import { BUILDER_CONFIGURED } from "@/lib/config";

/**
 * GET /api/cron/referrals[?day=YYYY-MM-DD] → once a day (after 00:00 UTC): for every referred live user,
 * read yesterday's Hyperliquid fills, sum the builder fee they paid us, and credit the referrer's share.
 * Idempotent per (referee, day): re-running a day overwrites that day's row.
 *
 * Fees come from the `builderFee` field on each fill, so only fills routed through Perped count.
 */
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

  const referees = await db
    .select({ id: schema.users.id, address: schema.users.address, referredBy: schema.users.referredBy, isDemo: schema.users.isDemo, isBot: schema.users.isBot })
    .from(schema.users)
    .where(sql`${schema.users.referredBy} is not null`);

  const shareCache = new Map<string, number>();
  let credited = 0, totalFeeUsd = 0, totalShareUsd = 0;
  for (const u of referees) {
    if (!u.referredBy || u.isDemo || u.isBot) continue;
    try {
      const fills = await getUserFillsByTime(u.address, start, end);
      let fee = 0, volume = 0, n = 0;
      for (const f of fills) {
        const b = Number(f.builderFee ?? 0);
        if (!b) continue; // not routed through Perped
        fee += b; volume += Number(f.px) * Number(f.sz); n++;
      }
      let sharePct = shareCache.get(u.referredBy);
      if (sharePct === undefined) { sharePct = referralSharePct(await countActiveReferees(u.referredBy)); shareCache.set(u.referredBy, sharePct); }
      const share = (fee * sharePct) / 100;
      const row = { referrerId: u.referredBy, refereeId: u.id, day, fills: n, volumeUsd: volume.toFixed(2), builderFeeUsd: fee.toFixed(6), sharePct: String(sharePct), shareUsd: share.toFixed(6) };
      await db.insert(schema.referralEarnings).values(row).onConflictDoUpdate({ target: [schema.referralEarnings.refereeId, schema.referralEarnings.day], set: row });
      if (n) { credited++; totalFeeUsd += fee; totalShareUsd += share; }
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      /* skip this referee this run */
    }
  }
  return Response.json({ ok: true, day, referees: referees.length, credited, builderFeeUsd: Number(totalFeeUsd.toFixed(4)), referrerShareUsd: Number(totalShareUsd.toFixed(4)) });
}
