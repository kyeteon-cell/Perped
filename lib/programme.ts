// Server-side invite programme: who can go live, the waitlist, founders, staff, renames.
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { notify } from "./feed";
import { FOUNDER_GRACE_DAYS, FOUNDER_SEATS, isFounder, isStaff } from "./programme-rates";
import type { User } from "./schema";

/** Real money needs an invite code, a waitlist release, staff/founder status, or a grandfathered account. */
export function canGoLive(u: Pick<User, "canGoLive" | "referredBy" | "role" | "founderSeat" | "isBot">) {
  return !!u.canGoLive || !!u.referredBy || isStaff(u.role) || u.founderSeat != null || u.isBot;
}

export type WaitlistSettings = { batch: number; paused: boolean; lastRelease?: string };
export async function getWaitlistSettings(): Promise<WaitlistSettings> {
  const [r] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "waitlist")).limit(1);
  return { batch: 200, paused: false, ...((r?.value ?? {}) as Partial<WaitlistSettings>) };
}
export async function setWaitlistSettings(patch: Partial<WaitlistSettings>) {
  const cur = await getWaitlistSettings();
  const value = { ...cur, ...patch };
  await db.insert(schema.appSettings).values({ key: "waitlist", value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}

/** Next scheduled release: Monday 14:00 UTC (9pm Bangkok, Fight Night). */
export function nextRelease(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 14));
  const add = (1 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  if (d <= from) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

export async function waitlistCount() {
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.users)
    .where(and(isNotNull(schema.users.waitlistAt), sql`coalesce(${schema.users.canGoLive}, false) = false`, isNull(schema.users.referredBy)));
  return r?.n ?? 0;
}

/** Let the oldest `n` waiting people in. */
export async function releaseWaitlist(n: number) {
  const rows = await db.select({ id: schema.users.id }).from(schema.users)
    .where(and(isNotNull(schema.users.waitlistAt), sql`coalesce(${schema.users.canGoLive}, false) = false`, isNull(schema.users.referredBy)))
    .orderBy(asc(schema.users.waitlistAt)).limit(Math.max(0, Math.min(5000, n)));
  for (const r of rows) {
    await db.update(schema.users).set({ canGoLive: true }).where(eq(schema.users.id, r.id));
    await notify(r.id, "waitlist", "You're in. Real trading is unlocked", "Connect a wallet in Settings and go live. Your demo record comes with you.", "/settings").catch(() => null);
  }
  return rows.length;
}

export async function letIn(handle: string) {
  const u = await byHandle(handle);
  if (!u) return null;
  await db.update(schema.users).set({ canGoLive: true }).where(eq(schema.users.id, u.id));
  await notify(u.id, "waitlist", "You're in. Real trading is unlocked", "Connect a wallet in Settings and go live.", "/settings").catch(() => null);
  return u;
}

export async function byHandle(handle: string) {
  const h = handle.trim().toLowerCase().replace(/^@/, "");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.handle, h)).limit(1);
  if (u) return u;
  const [r] = await db.select({ userId: schema.handleRedirects.userId }).from(schema.handleRedirects).where(eq(schema.handleRedirects.oldHandle, h)).limit(1);
  if (!r) return null;
  const [v] = await db.select().from(schema.users).where(eq(schema.users.id, r.userId)).limit(1);
  return v ?? null;
}

/** Give someone a founder seat (lowest free seat, or the one asked for). */
export async function addFounder(handle: string, seat?: number) {
  const u = await byHandle(handle);
  if (!u) return { error: "no such user" } as const;
  if (u.isBot) return { error: "bots can't be founders" } as const;
  if (isFounder(u)) return { error: `already founder #${u.founderSeat}` } as const;
  const taken = new Set((await db.select({ s: schema.users.founderSeat }).from(schema.users).where(isNotNull(schema.users.founderSeat))).map((r) => r.s));
  let s = seat ?? 0;
  if (s) { if (s < 1 || s > FOUNDER_SEATS) return { error: `seats run 1-${FOUNDER_SEATS}` } as const; if (taken.has(s)) return { error: `seat #${s} is taken` } as const; }
  else { for (let i = 1; i <= FOUNDER_SEATS; i++) if (!taken.has(i)) { s = i; break; } }
  if (!s) return { error: "all seats are taken" } as const;
  await db.update(schema.users).set({ founderSeat: s, founderSince: new Date(), founderStatus: "active", canGoLive: true }).where(eq(schema.users.id, u.id));
  await notify(u.id, "founder", `You're Founder #${s}`, "Half of every fee your people pay, 20% when your trades get copied or faded. Your invite page has your link.", "/invite").catch(() => null);
  return { ok: true, handle: u.handle, seat: s } as const;
}

export async function removeFounder(handle: string) {
  const u = await byHandle(handle);
  if (!u || u.founderSeat == null) return { error: "not a founder" } as const;
  await db.update(schema.users).set({ founderSeat: null, founderSince: null, founderStatus: null }).where(eq(schema.users.id, u.id));
  return { ok: true, handle: u.handle } as const;
}

/** Founders who brought in no real-money trader within the grace period lose the seat (they keep regular rates). */
export async function expireIdleFounders() {
  const cutoff = new Date(Date.now() - FOUNDER_GRACE_DAYS * 86_400_000);
  const idle = await db.select({ id: schema.users.id, handle: schema.users.handle, seat: schema.users.founderSeat }).from(schema.users)
    .where(and(isNotNull(schema.users.founderSeat), eq(schema.users.founderStatus, "active"), sql`${schema.users.founderSince} < ${cutoff}`,
      sql`not exists (select 1 from referral_earnings e where e.referrer_id = "users"."id" and e.kind = 'invite' and e.fills > 0)`));
  for (const f of idle) {
    await db.update(schema.users).set({ founderStatus: "expired", founderSeat: null }).where(eq(schema.users.id, f.id));
    await notify(f.id, "founder", "Your founder seat has gone back to the pool", `Nobody you invited traded real money in ${FOUNDER_GRACE_DAYS} days. You keep regular invite rates.`, "/invite").catch(() => null);
  }
  return idle.length;
}

export async function setRole(handle: string, role: "admin" | "user") {
  const u = await byHandle(handle);
  if (!u) return { error: "no such user" } as const;
  if (u.role === "owner") return { error: "the owner can't be changed" } as const;
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, u.id));
  if (role === "admin") await notify(u.id, "admin", "You're a Perped admin", "You can pick founders and run the waitlist from /admin.", "/admin").catch(() => null);
  return { ok: true, handle: u.handle, role } as const;
}

/** Rename a user; if the new handle is taken, the holder is moved to `${to}_${n}` first. Old handles redirect. */
export async function renameUser(fromHandle: string, toHandle: string, opts: { bump?: boolean } = {}) {
  const to = toHandle.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,20}$/.test(to)) return { error: "handles are 3-20 letters, numbers or _" } as const;
  const u = await byHandle(fromHandle);
  if (!u) return { error: "no such user" } as const;
  const [holder] = await db.select().from(schema.users).where(eq(schema.users.handle, to)).limit(1);
  let moved: { from: string; to: string; bot: boolean; trades: number } | null = null;
  if (holder && holder.id !== u.id) {
    const [t] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.posts).where(eq(schema.posts.userId, holder.id));
    if (!opts.bump) return { error: "taken", holder: { handle: holder.handle, bot: holder.isBot, posts: t?.n ?? 0, demo: holder.isDemo, createdAt: holder.createdAt } } as const;
    let alt = "";
    for (let i = 1; i < 999; i++) { const c = `${to}_${i}`.slice(0, 20); const [x] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, c)).limit(1); if (!x) { alt = c; break; } }
    await db.update(schema.users).set({ handle: alt }).where(eq(schema.users.id, holder.id));
    moved = { from: to, to: alt, bot: holder.isBot, trades: t?.n ?? 0 };
    if (!holder.isBot) await notify(holder.id, "account", `Your handle is now @${alt}`, `@${to} was reserved. Everything else on your account is unchanged.`, `/u/${alt}`).catch(() => null);
  }
  const old = u.handle;
  await db.update(schema.users).set({ handle: to }).where(eq(schema.users.id, u.id));
  await db.delete(schema.handleRedirects).where(eq(schema.handleRedirects.oldHandle, to));
  await db.insert(schema.handleRedirects).values({ oldHandle: old, userId: u.id }).onConflictDoUpdate({ target: schema.handleRedirects.oldHandle, set: { userId: u.id } });
  return { ok: true, from: old, to, moved } as const;
}

/** Monday: tell everyone who earned in the last 7 days how much, split into invites and their own trades. */
export async function weeklyEarningsAlert() {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const rows = (await db.execute(sql`select referrer_id as id, coalesce(sum(share_usd) filter (where kind in ('invite','invite2')),0)::float as inv,
      coalesce(sum(share_usd) filter (where kind = 'creator'),0)::float as cr from referral_earnings where day >= ${since} group by referrer_id having sum(share_usd) >= 0.01`)) as unknown as { id: string; inv: number; cr: number }[];
  const $ = (n: number) => `$${n.toFixed(2)}`;
  for (const r of rows) {
    const parts = [r.inv >= 0.01 ? `${$(r.inv)} from invites` : "", r.cr >= 0.01 ? `${$(r.cr)} from your trades` : ""].filter(Boolean).join(" and ");
    await notify(r.id, "earnings", `You earned ${$(r.inv + r.cr)} this week`, `${parts}. Paid in USDC this week.`, "/invite").catch(() => null);
  }
  return rows.length;
}
