import { z } from "zod";
import { inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { staffFrom } from "@/lib/staff";
import { addFounder, expireIdleFounders, getWaitlistSettings, letIn, nextRelease, releaseWaitlist, removeFounder, renameUser, setRole, setWaitlistSettings, waitlistCount } from "@/lib/programme";
import { FOUNDER_GRACE_DAYS, FOUNDER_SEATS, FOUNDER_WAVE } from "@/lib/programme-rates";
import { APP_URL, BUILDER_CONFIGURED } from "@/lib/config";
import { getLiveSettings, setLiveOpen } from "@/lib/live";
import { isGuestId, tokenForGuestId } from "@/lib/guest";

export const dynamic = "force-dynamic";

/** GET /api/admin/programme → founders (with what they've brought in), seats, waitlist, staff, this month's money. */
export async function GET(req: Request) {
  await ensureSchema();
  const staff = await staffFrom(req);
  if (!staff) return Response.json({ error: "unauthorized" }, { status: 401 });
  const month = new Date(); month.setUTCDate(1);
  const monthDay = month.toISOString().slice(0, 10);
  // Each section loads on its own: one failing query shows as an error on its card, never a blank page.
  const errors: Record<string, string> = {};
  const safe = async <T,>(name: string, f: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await f(); } catch (e) { errors[name] = e instanceof Error ? e.message.slice(0, 300) : String(e); console.error(`[admin] ${name}:`, e); return fallback; }
  };
  const live = await getLiveSettings();
  const [founders, admins, wl, waiting, money, totals] = await Promise.all([
    safe("founders", () => db.select({
      handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, seat: schema.users.founderSeat, since: schema.users.founderSince, status: schema.users.founderStatus,
      invited: sql<number>`(select count(*) from users r where r.referred_by = "users"."id")`.mapWith(Number),
      invited2: sql<number>`(select count(*) from users r2 where r2.referred_by in (select m2.id from users m2 where m2.referred_by = "users"."id"))`.mapWith(Number),
      realTraders: sql<number>`(select count(distinct e.referee_id) from referral_earnings e where e.referrer_id = "users"."id" and e.kind = 'invite' and e.fills > 0)`.mapWith(Number),
      feesIn: sql<number>`(select coalesce(sum(e.builder_fee_usd), 0) from referral_earnings e where e.referrer_id = "users"."id" and e.kind = 'invite')`.mapWith(Number),
      earned: sql<number>`(select coalesce(sum(e.share_usd), 0) from referral_earnings e where e.referrer_id = "users"."id")`.mapWith(Number),
    }).from(schema.users).where(isNotNull(schema.users.founderSeat)), []),
    safe("staff", () => db.select({ handle: schema.users.handle, role: schema.users.role }).from(schema.users).where(inArray(schema.users.role, ["admin", "owner"])), []),
    safe("waitlist", () => getWaitlistSettings(), { batch: 200, paused: false } as Awaited<ReturnType<typeof getWaitlistSettings>>),
    safe("waitlistCount", () => waitlistCount(), 0),
    safe("month", async () => ((await db.execute(sql`select
        coalesce(sum(share_usd) filter (where kind = 'invite'), 0)::float as invite,
        coalesce(sum(share_usd) filter (where kind = 'invite2'), 0)::float as invite2,
        coalesce(sum(share_usd) filter (where kind = 'creator'), 0)::float as creator
      from referral_earnings where day >= ${monthDay}`)) as unknown as Record<string, number>[])[0] ?? {}, {} as Record<string, number>),
    safe("totals", async () => ((await db.execute(sql`select
        (select count(*) from users where not is_bot)::int as people,
        (select count(*) from users where not is_bot and not is_demo)::int as live,
        (select count(*) from users where referred_by is not null)::int as invited,
        (select coalesce(sum(share_usd),0) from referral_earnings)::float - (select coalesce(sum(amount_usd),0) from referral_payouts)::float as owed`)) as unknown as Record<string, number>[])[0] ?? {}, {} as Record<string, number>),
  ]);
  const m = money;
  founders.sort((a, b) => (b.feesIn - a.feesIn) || ((a.seat ?? 999) - (b.seat ?? 999)));
  return Response.json({
    me: { role: staff.role, handle: staff.handle },
    health: {
      builder: BUILDER_CONFIGURED, appUrl: APP_URL, cronSecret: !!process.env.CRON_SECRET, push: true,
      nextRelease: nextRelease().toISOString(),
    },
    totals,
    live,
    seats: { total: FOUNDER_SEATS, wave: FOUNDER_WAVE, filled: founders.filter((f) => f.status !== "expired").length, graceDays: FOUNDER_GRACE_DAYS },
    founders: founders.map((f) => ({ ...f, daysIn: f.since ? Math.floor((Date.now() - new Date(f.since).getTime()) / 86_400_000) : 0 })),
    staff: admins,
    waitlist: { waiting, ...wl, next: nextRelease().toISOString() },
    month: { paidOut: (m.invite ?? 0) + (m.invite2 ?? 0) + (m.creator ?? 0), invite: m.invite ?? 0, invite2: m.invite2 ?? 0, creator: m.creator ?? 0 },
    errors,
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
  z.object({ action: z.literal("releaseNow") }),
  z.object({ action: z.literal("live"), open: z.boolean() }),
  z.object({ action: z.literal("guestKey"), handle: z.string() }),
]);
const OWNER_ONLY = new Set(["addAdmin", "removeAdmin", "rename", "live", "guestKey"]);

/** POST /api/admin/programme {action, …} → founders, admins, waitlist, renames. Admin/owner session or the CRON_SECRET key. */
export async function POST(req: Request) {
  await ensureSchema();
  const staff = await staffFrom(req);
  if (!staff) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  const b = parsed.data;
  if (OWNER_ONLY.has(b.action) && staff.role !== "owner") return Response.json({ error: "only the owner can do that" }, { status: 403 });
  try { return await runAction(b); } catch (e) { console.error("[admin] action", b.action, e); return Response.json({ error: e instanceof Error ? e.message.slice(0, 300) : "failed" }, { status: 500 }); }
}

async function runAction(b: z.infer<typeof Body>): Promise<Response> {
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
        posts: sql<number>`(select count(*) from posts p where p.user_id = "users"."id")`.mapWith(Number),
        realTrades: sql<number>`(select count(*) from posts p where p.user_id = "users"."id" and p.kind = 'trade' and not p.paper)`.mapWith(Number),
        followers: sql<number>`(select count(*) from follows f where f.followee_id = "users"."id")`.mapWith(Number) })
        .from(schema.users).where(sql`${schema.users.handle} = ${b.handle.toLowerCase().replace(/^@/, "")}`).limit(1);
      return Response.json(u ? { ok: true, user: { ...u, id: undefined, guest: u.id.startsWith("guest:") } } : { ok: true, user: null });
    }
    case "expireFounders": return Response.json({ ok: true, expired: await expireIdleFounders() });
    case "guestKey": {
      const [u] = await db.select({ id: schema.users.id, handle: schema.users.handle }).from(schema.users).where(sql`${schema.users.handle} = ${b.handle.toLowerCase().replace(/^@/, "")}`).limit(1);
      if (!u) return Response.json({ error: "no account with that handle" });
      if (!isGuestId(u.id)) return Response.json({ error: `@${u.handle} isn't a guest account (it signs in with X, Google, email or a wallet)` });
      return Response.json({ ok: true, handle: u.handle, key: tokenForGuestId(u.id) });
    }
    case "live": return Response.json({ ok: true, live: await setLiveOpen(b.open) });
    case "releaseNow": { const wl = await getWaitlistSettings(); return Response.json({ ok: true, released: await releaseWaitlist(wl.batch) }); }
  }
}
