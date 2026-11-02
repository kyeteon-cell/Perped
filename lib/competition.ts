// The alpha competition countdown: a site-wide bar that fills as linked accounts open their first fade.
// At the goal the owner drops the competition details. Settings live in app_settings.competition.
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

export type CompSettings = {
  goal: number;
  /** Fades opened before this don't count. Set the first time the competition is read. */
  startAt: string;
  /** Shown once the goal is hit (or earlier, if the owner posts them). */
  details?: string | null;
  detailsUrl?: string | null;
  /** Hide the bar everywhere. */
  hidden?: boolean;
};

const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

export async function getCompSettings(): Promise<CompSettings> {
  const [r] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "competition")).limit(1);
  if (r) return { goal: 100, ...(r.value as Partial<CompSettings>) } as CompSettings;
  const value: CompSettings = { goal: 100, startAt: new Date().toISOString() };
  await db.insert(schema.appSettings).values({ key: "competition", value }).onConflictDoNothing();
  return value;
}

export async function setCompSettings(patch: Partial<CompSettings>) {
  const value = { ...(await getCompSettings()), ...patch };
  await db.insert(schema.appSettings).values({ key: "competition", value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
  cache = null;
  return value;
}

/**
 * Who counts: a real person (not a demo bot) on a linked account — signed in with X, Google, email or a wallet,
 * or an instant guest that has since linked one of those — who opened at least one fade since the start.
 * Each person counts once.
 */
const counted = (startAt: string) => sql`
  select distinct p.user_id from posts p join users u on u.id = p.user_id
  where p.kind = 'trade' and p.faded_from_id is not null and p.created_at >= ${startAt}::timestamptz
    and u.is_bot = false and u.id not like 'bot:%' -- demo bots never count, flagged or not
    and (u.id not like 'guest:%' or exists (select 1 from account_links l where l.user_id = u.id))`;

export type CompBoard = { goal: number; count: number; startAt: string; unlocked: boolean; details: string | null; detailsUrl: string | null; hidden: boolean; recruiters: { handle: string; avatarUrl: string | null; n: number }[] };

/** The public numbers: read on every page, so kept for 30s per server instance. */
let cache: { at: number; v: Promise<CompBoard> } | null = null;
export function getCompBoard(): Promise<CompBoard> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const v = readBoard().catch((e) => { cache = null; throw e; });
  cache = { at: Date.now(), v };
  return v;
}

async function readBoard(): Promise<CompBoard> {
  const s = await getCompSettings();
  const [c, rec] = await Promise.all([
    db.execute(sql`select count(*)::int as n from (${counted(s.startAt)}) q`).then(rows),
    db.execute(sql`select r.handle, r.avatar_url as "avatarUrl", count(*)::int as n
      from (${counted(s.startAt)}) q join users u on u.id = q.user_id join users r on r.id = u.referred_by
      where r.is_bot = false and r.id not like 'bot:%' group by r.id order by n desc, r.handle asc limit 5`).then(rows),
  ]);
  const count = Number(c[0]?.n ?? 0);
  const unlocked = count >= s.goal;
  return {
    goal: s.goal, count, startAt: s.startAt, unlocked, hidden: !!s.hidden,
    // Details stay private until the bar fills, unless the owner chooses to post them.
    details: unlocked ? s.details ?? null : null,
    detailsUrl: unlocked ? s.detailsUrl ?? null : null,
    recruiters: rec.map((r) => ({ handle: String(r.handle), avatarUrl: (r.avatarUrl as string | null) ?? null, n: Number(r.n) })),
  };
}

export type CompMe = { linked: boolean; counted: boolean; recruited: number; handle: string };

/** The viewer's own status: are they counted, and how many people they've brought in who count. */
export async function getCompMe(userId: string, startAt: string): Promise<CompMe | null> {
  const [u] = rows(await db.execute(sql`select u.handle, (u.id not like 'guest:%' or exists (select 1 from account_links l where l.user_id = u.id)) as linked
    from users u where u.id = ${userId}`));
  if (!u) return null;
  const [mine, rec] = await Promise.all([
    db.execute(sql`select 1 from (${counted(startAt)}) q where q.user_id = ${userId} limit 1`).then(rows),
    db.execute(sql`select count(*)::int as n from (${counted(startAt)}) q join users x on x.id = q.user_id where x.referred_by = ${userId}`).then(rows),
  ]);
  return { handle: String(u.handle), linked: !!u.linked, counted: mine.length > 0, recruited: Number(rec[0]?.n ?? 0) };
}
