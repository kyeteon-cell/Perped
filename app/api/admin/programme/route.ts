import { z } from "zod";
import { desc, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { staffFrom } from "@/lib/staff";
import { addFounder, expireIdleFounders, getWaitlistSettings, letIn, nextRelease, releaseWaitlist, removeFounder, renameUser, setRole, setWaitlistSettings, waitlistCount } from "@/lib/programme";
import { FOUNDER_GRACE_DAYS, FOUNDER_SEATS, FOUNDER_WAVE } from "@/lib/programme-rates";

export const dynamic = "force-dynamic";

/** GET /api/admin/programme → founders (with what they've brought in), seats, waitlist, staff, this month's money. */
export async function GET(req: Request) {
  await ensureSchema();
  const staff = await staffFrom(req);
  if (!staff) return Response.json({ error: "unauthorized" }, { status: 401 });
  const month = new Date(); month.setUTCDate(1);
  const monthDay = month.toISOString().slice(0, 10);
  const [founders, admins, wl, waiting, money] = await Promise.all([
    db.select({
      handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, seat: schema.users.founderSeat, since: schema.users.founderSince, status: schema.users.founderStatus,
      invited: sql<number>`(select count(*) from users r where r.referred_by = ${schema.users.id})`.mapWith(Number),
      invited2: sql<number>`(select count(*) from users r join users m on m.id = r.referred_by where m.referred_by = ${schema.users.id})`.mapWith(Number),
      realTraders: sql<number>`(select count(distinct referee_id) from referral_earnings e where e.referrer_id = ${schema.users.id} and e.kind = 'invite' and e.fills > 0)`.mapWith(Number),
      feesIn: sql<number>`coalesce((select sum(builder_fee_usd) from referral_earnings e where e.referrer_id = ${schema.users.id} and e.kind = 'invite'), 0)`.mapWith(Number),
      earned: sql<number>`coalesce((select sum(share_usd) from referral_earnings e where e.referrer_id = ${schema.users.id}), 0)`.mapWith(Number),
    }).from(schema.users).where(isNotNull(schema.users.founderSeat)).orderBy(desc(sql`coalesce((select sum(builder_fee_usd) from referral_earnings e where e.referrer_id = ${schema.users.id} and e.kind = 'invite'), 0)`)),
    db.select({ handle: schema.users.handle, role: schema.users.role }).from(schema.users).where(inArray(schema.users.role, ["admin", "owner"])),
    getWaitlistSettings(),
    waitlistCount(),
    db.execute(sql`select
        coalesce((select sum(builder_fee_usd) from (select distinct on (referee_id, day) referee_id, day, builder_fee_usd from referral_earnings where day >= ${monthDay} and kind = 'invite') x), 0)::float as "feesReferred",
        coalesce(sum(share_usd) filter (where kind = 'invite'), 0)::float as invite,
        coalesce(sum(share_usd) filter (where kind = 'invite2'), 0)::float as invite2,
        coalesce(sum(share_usd) filter (where kind = 'creator'), 0)::float as creator
      from referral_earnings where day >= ${monthDay}`),
  ]);
  const m = ((money as unknown as Record<string, number>[])[0]) ?? {};
  return Response.json({
    me: { role: staff.role, handle: staff.handle },
    seats: { total: FOUNDER_SEATS, wave: FOUNDER_WAVE, filled: founders.filter((f) => f.status !== "expired").length, graceDays: FOUNDER_GRACE_DAYS },
    founders: founders.map((f) => ({ ...f, daysIn: f.since ? Math.floor((Date.now() - new Date(f.since).getTime()) / 86_400_000) : 0 })),
    staff: admins,
    waitlist: { waiting, ...wl, next: nextRelease().toISOString() },
    month: { paidOut: (m.invite ?? 0) + (m.invite2 ?? 0) + (m.creator ?? 0), invite: m.invite ?? 0, invite2: m.invite2 ?? 0, creator: m.creator ?? 0 },
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addFounder"), handle: z.string(), seat: z.number().int().optional() }),
  z.object({ action: z.literal("removeFounder"), handle: z.string() }),
  z.object({ action: z.literal("addAdmin"), handle: z.string() }),
  z.object({ action: z.literal("removeAdmin"), handle: z.string() }),
  z.object({ action: z.literal("letIn"), handle: z.string().optional(), count: z.number().int().min(1).max(5000).optional() }),
  z.object({ action: z.literal("waitlist"), batch: z.number().int().min(0).max(5000).optional(), paused: z.boolean().optional() }),
  z.object({ action: z.literal("rename"), from: z.string(), to: z.string(), bump: z.boolean().optional() }),
  z.object({ action: z.literal("whois"), handle: z.string() }),
  z.object({ action: z.literal("expireFounders") }),
]);
const OWNER_ONLY = new Set(["addAdmin", "removeAdmin", "rename"]);

/** POST /api/admin/programme {action, …} → founders, admins, waitlist, renames. Admin/owner session or the CRON_SECRET key. */
export async function POST(req: Request) {
  await ensureSchema();
  const staff = await staffFrom(req);
  if (!staff) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  const b = parsed.data;
  if (OWNER_ONLY.has(b.action) && staff.role !== "owner") return Response.json({ error: "only the owner can do that" }, { status: 403 });
  switch (b.action) {
    case "addFounder": return Response.json(await addFounder(b.handle, b.seat));
    case "removeFounder": return Response.json(await removeFounder(b.handle));
    case "addAdmin": return Response.json(await setRole(b.handle, "admin"));
    case "removeAdmin": return Response.json(await setRole(b.handle, "user"));
    case "letIn": {
      if (b.handle) { const u = await letIn(b.handle); return Response.json(u ? { ok: true, handle: u.handle } : { error: "no such user" }); }
      return Response.json({ ok: true, released: await releaseWaitlist(b.count ?? 0) });
    }
    case "waitlist": return Response.json({ ok: true, waitlist: await setWaitlistSettings({ ...(b.batch != null ? { batch: b.batch } : {}), ...(b.paused != null ? { paused: b.paused } : {}) }) });
    case "rename": return Response.json(await renameUser(b.from, b.to, { bump: b.bump }));
    case "whois": {
      const [u] = await db.select({ id: schema.users.id, handle: schema.users.handle, isBot: schema.users.isBot, isDemo: schema.users.isDemo, createdAt: schema.users.createdAt, xp: schema.users.xp, role: schema.users.role,
        posts: sql<number>`(select count(*) from posts p where p.user_id = ${schema.users.id})`.mapWith(Number),
        realTrades: sql<number>`(select count(*) from posts p where p.user_id = ${schema.users.id} and p.kind = 'trade' and not p.paper)`.mapWith(Number),
        followers: sql<number>`(select count(*) from follows f where f.followee_id = ${schema.users.id})`.mapWith(Number) })
        .from(schema.users).where(sql`${schema.users.handle} = ${b.handle.toLowerCase().replace(/^@/, "")}`).limit(1);
      return Response.json(u ? { ok: true, user: { ...u, id: undefined, guest: u.id.startsWith("guest:") } } : { ok: true, user: null });
    }
    case "expireFounders": return Response.json({ ok: true, expired: await expireIdleFounders() });
  }
}
