// Server-side: the one switch for real-money trading. Closed = everyone (except staff and bots) is demo only.
// Flip it from Admin → Overview, or by setting app_settings.live = { open: true }.
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { isStaff } from "./programme-rates";
import type { User } from "./schema";

export type LiveSettings = { open: boolean; openedAt?: string };

/** Default when nothing is stored: closed (demo only). NEXT_PUBLIC_LIVE_OPEN=1 opens it without the database. */
const ENV_OPEN = process.env.NEXT_PUBLIC_LIVE_OPEN === "1";

/** Read on almost every request, changed rarely: keep it in memory for 20s per server instance. */
let liveCache: { at: number; v: Promise<LiveSettings> } | null = null;
export function getLiveSettings(): Promise<LiveSettings> {
  if (liveCache && Date.now() - liveCache.at < 20_000) return liveCache.v;
  const v = readLiveSettings();
  liveCache = { at: Date.now(), v };
  return v;
}
async function readLiveSettings(): Promise<LiveSettings> {
  try {
    const [r] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "live")).limit(1);
    return { open: ENV_OPEN, ...((r?.value ?? {}) as Partial<LiveSettings>) };
  } catch {
    return { open: ENV_OPEN };
  }
}

export async function setLiveOpen(open: boolean) {
  const value: LiveSettings = { open, ...(open ? { openedAt: new Date().toISOString() } : {}) };
  await db.insert(schema.appSettings).values({ key: "live", value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  liveCache = null;
  return value;
}

/** Can this person trade real money right now? Staff (to test) and bots always can. */
export function liveAllowed(open: boolean, u: Pick<User, "role" | "isBot"> | null | undefined) {
  return open || !!u?.isBot || isStaff(u?.role);
}

/** While closed, anyone left in live mode who isn't staff goes back to demo. Returns the profile as it now stands. */
export async function enforceDemo<T extends Pick<User, "id" | "isDemo" | "role" | "isBot">>(u: T, open: boolean): Promise<T> {
  if (u.isDemo || liveAllowed(open, u)) return u;
  await db.update(schema.users).set({ isDemo: true }).where(eq(schema.users.id, u.id));
  return { ...u, isDemo: true };
}

/** Put someone on the early-access list (no-op if already on it) and return their place in line. */
export async function joinEarlyAccess(userId: string) {
  await db.update(schema.users).set({ waitlistAt: new Date() }).where(and(eq(schema.users.id, userId), isNull(schema.users.waitlistAt)));
  return earlyAccessStatus(userId);
}

export async function earlyAccessStatus(userId: string) {
  const [me] = await db.select({ waitlistAt: schema.users.waitlistAt, canGoLive: schema.users.canGoLive, referredBy: schema.users.referredBy, role: schema.users.role, founderSeat: schema.users.founderSeat })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!me) return { joined: false, early: false, place: null as number | null };
  const early = !!me.canGoLive || !!me.referredBy || me.founderSeat != null || isStaff(me.role);
  if (!me.waitlistAt) return { joined: false, early, place: null };
  if (early) return { joined: true, early, place: null };
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.users)
    .where(and(isNotNull(schema.users.waitlistAt), lte(schema.users.waitlistAt, me.waitlistAt), sql`coalesce(${schema.users.canGoLive}, false) = false`, isNull(schema.users.referredBy)));
  return { joined: true, early, place: r?.n ?? null };
}

