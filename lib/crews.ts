// Crews: a trader's group on Perped. The owner's invite link brings members in (and the owner earns on them
// through the normal referral rules), members' trades carry the crew tag, and crews meet in a weekly war:
// fades won against traders outside the crew, minus fades lost to them, since Monday 00:00 UTC.
import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { notify } from "./feed";
import { APP_URL } from "./config";
import { fmtPrice, fmtUsd, tradeRoiPct } from "./format";
import { escapeHtml, tgSend, TELEGRAM_ON } from "./telegram";

export const CREW_TAG_RE = /^[A-Z0-9]{2,5}$/;
export const CREW_NAME_MAX = 28;
export const CREW_BIO_MAX = 160;

const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];
const n = (v: unknown) => Number(v ?? 0);

export function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}

export type CrewCard = {
  slug: string; name: string; tag: string; bio: string | null;
  owner: { handle: string; avatarUrl: string | null; role: string | null; founderSeat: number | null; founderStatus: string | null };
  members: number; pnl7d: number; wins: number; losses: number; score: number; rank?: number;
};

/** Fades this week (Monday 00:00 UTC) against traders outside the crew: a member won it / a member lost it. */
const WEEK = sql`date_trunc('week', now() at time zone 'utc') at time zone 'utc'`;
const winsSql = (crewId: unknown) => sql`(select count(*) from battles b join crew_members x on x.user_id = b.winner_id
  where x.crew_id = ${crewId} and b.status = 'settled' and b.settled_at >= ${WEEK}
  and not exists (select 1 from crew_members y where y.crew_id = x.crew_id and y.user_id = (case when b.winner_id = b.fader_id then b.target_id else b.fader_id end)))`;
const lossesSql = (crewId: unknown) => sql`(select count(*) from battles b join crew_members x on (x.user_id = b.fader_id or x.user_id = b.target_id)
  where x.crew_id = ${crewId} and b.status = 'settled' and b.settled_at >= ${WEEK} and b.winner_id is not null and b.winner_id <> x.user_id
  and not exists (select 1 from crew_members y where y.crew_id = x.crew_id and y.user_id = (case when x.user_id = b.fader_id then b.target_id else b.fader_id end)))`;

function card(r: Record<string, unknown>): CrewCard {
  const wins = n(r.wins), losses = n(r.losses);
  return {
    slug: String(r.slug), name: String(r.name), tag: String(r.tag), bio: (r.bio as string) ?? null,
    owner: { handle: String(r.owner_handle), avatarUrl: (r.owner_avatar as string) ?? null, role: (r.owner_role as string) ?? null, founderSeat: (r.founder_seat as number) ?? null, founderStatus: (r.founder_status as string) ?? null },
    members: n(r.members), pnl7d: n(r.pnl7d), wins, losses, score: wins - losses,
  };
}

const cardSelect = (where = sql`true`) => sql`select c.id, c.slug, c.name, c.tag, c.bio, u.handle as owner_handle, u.avatar_url as owner_avatar,
    u.founder_seat, u.founder_status, u.role as owner_role,
    (select count(*) from crew_members x where x.crew_id = c.id) as members,
    (select coalesce(sum(s.realized_pnl_7d::numeric), 0) from crew_members x join stats s on s.user_id = x.user_id where x.crew_id = c.id) as pnl7d,
    ${winsSql(sql`c.id`)} as wins, ${lossesSql(sql`c.id`)} as losses
  from crews c join users u on u.id = c.owner_id where ${where}`;

/** The weekly crew war: every crew, best first. */
export async function crewBoard(limit = 50): Promise<CrewCard[]> {
  const r = rows(await db.execute(sql`select * from (${cardSelect()}) t order by (t.wins - t.losses) desc, t.wins desc, t.pnl7d desc, t.members desc limit ${limit}`));
  return r.map((x, i) => ({ ...card(x), rank: i + 1 }));
}

export async function crewBySlug(slug: string) {
  const [c] = await db.select().from(schema.crews).where(eq(schema.crews.slug, slug.toLowerCase())).limit(1);
  return c ?? null;
}

/** The crew a user is in (null if none), and whether they run it. */
export async function crewOf(userId: string) {
  const [r] = await db.select({ crew: schema.crews }).from(schema.crewMembers).innerJoin(schema.crews, eq(schema.crews.id, schema.crewMembers.crewId)).where(eq(schema.crewMembers.userId, userId)).limit(1);
  return r ? { ...r.crew, isOwner: r.crew.ownerId === userId } : null;
}

export type CrewMember = { handle: string; avatarUrl: string | null; xp: number; isDemo: boolean; role: string | null; founderSeat: number | null; founderStatus: string | null; joinedAt: string; pnl7d: number; pnl30d: number; winRate: number; closedTrades: number; weekWins: number; weekLosses: number; isOwner: boolean };

export async function crewDetail(slug: string) {
  const c = await crewBySlug(slug);
  if (!c) return null;
  const [cardRow] = rows(await db.execute(sql`${cardSelect(sql`c.id = ${c.id}`)}`));
  const board = await crewBoard(500);
  const members = rows(await db.execute(sql`select u.handle, u.avatar_url as "avatarUrl", u.xp, u.is_demo as "isDemo", u.role, u.founder_seat as "founderSeat", u.founder_status as "founderStatus",
      m.joined_at as "joinedAt", coalesce(s.realized_pnl_7d::float, 0) as "pnl7d", coalesce(s.realized_pnl_30d::float, 0) as "pnl30d", coalesce(s.win_rate::float, 0) as "winRate",
      coalesce(s.closed_trades, 0) as "closedTrades", (u.id = ${c.ownerId}) as "isOwner",
      (select count(*) from battles b where b.winner_id = u.id and b.status = 'settled' and b.settled_at >= ${WEEK})::int as "weekWins",
      (select count(*) from battles b where (b.fader_id = u.id or b.target_id = u.id) and b.status = 'settled' and b.settled_at >= ${WEEK} and b.winner_id is not null and b.winner_id <> u.id)::int as "weekLosses"
    from crew_members m join users u on u.id = m.user_id left join stats s on s.user_id = u.id
    where m.crew_id = ${c.id} order by coalesce(s.realized_pnl_30d::float, 0) desc, m.joined_at asc limit 200`)) as unknown as CrewMember[];
  return {
    crew: { ...card(cardRow), rank: board.find((b) => b.slug === c.slug)?.rank ?? null, createdAt: c.createdAt, telegram: c.tgChatId ? { title: c.tgChatTitle } : null, tgMembers: c.tgMembers },
    ownerId: c.ownerId, crewId: c.id, members,
  };
}

/** Join (or switch to) a crew. A member with no referral yet is credited to the crew owner, same rules as an invite code. */
export async function joinCrew(user: typeof schema.users.$inferSelect, crew: typeof schema.crews.$inferSelect): Promise<{ ok: true; credited: boolean } | { error: string; status: number }> {
  if (user.isBot) return { error: "Bots can't join crews", status: 400 };
  const mine = await crewOf(user.id);
  if (mine?.id === crew.id) return { ok: true, credited: false };
  if (mine?.isOwner) return { error: "You run a crew. Hand it over or close it before joining another.", status: 409 };
  await db.insert(schema.crewMembers).values({ userId: user.id, crewId: crew.id }).onConflictDoUpdate({ target: schema.crewMembers.userId, set: { crewId: crew.id, joinedAt: new Date() } });
  let credited = false;
  if (!user.referredBy && crew.ownerId !== user.id) {
    const [real] = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.userId, user.id), eq(schema.posts.kind, "trade"), eq(schema.posts.paper, false))).limit(1);
    const [owner] = await db.select({ referredBy: schema.users.referredBy }).from(schema.users).where(eq(schema.users.id, crew.ownerId)).limit(1);
    if (!real && owner && owner.referredBy !== user.id) {
      await db.update(schema.users).set({ referredBy: crew.ownerId, referredAt: new Date(), canGoLive: true }).where(eq(schema.users.id, user.id));
      credited = true;
    }
  }
  await notify(crew.ownerId, "crew", `@${user.handle} joined ${crew.name}`, credited ? "They joined with your link: you earn on their trades." : undefined, `/crew/${crew.slug}`).catch(() => null);
  return { ok: true, credited };
}

/** Run after the response when we're inside a request (Telegram can be slow); otherwise just run it. */
function later(fn: () => Promise<unknown>) {
  try { after(fn); } catch { void fn().catch(() => null); }
}

/**
 * Post a crew owner's trade, close or call into the crew's Telegram group (members' too when the owner turned
 * that on). Buttons carry the owner's referral and the crew, so anyone tapping in from the group joins the crew.
 */
export function crewBroadcast(postId: number, event: "open" | "close" | "call") {
  if (!TELEGRAM_ON) return;
  later(async () => {
    const r = rows(await db.execute(sql`select p.id, p.kind, p.coin, p.side, p.leverage, p.entry_px as "entryPx", p.exit_px as "exitPx", p.size, p.notional_usd as "notionalUsd",
        p.realized_pnl as "realizedPnl", p.meta, p.status, p.paper, p.target_px as "targetPx", p.deadline, p.copied_from_id as "copiedFromId", p.faded_from_id as "fadedFromId",
        u.handle, u.is_demo as "isDemo", c.slug, c.name, c.tag, c.tg_chat_id as "chat", c.tg_members as "tgMembers", (c.owner_id = u.id) as "isOwner", o.handle as "ownerHandle"
      from posts p join users u on u.id = p.user_id join crew_members m on m.user_id = u.id join crews c on c.id = m.crew_id join users o on o.id = c.owner_id
      where p.id = ${postId} limit 1`))[0];
    if (!r || !r.chat || !(r.isOwner || r.tgMembers)) return;
    const q = `ref=${encodeURIComponent(String(r.ownerHandle))}&crew=${encodeURIComponent(String(r.slug))}`;
    const who = `<b>${escapeHtml(String(r.handle))}</b> · ${escapeHtml(String(r.tag))}`;
    const demo = r.paper || r.isDemo ? " <i>(demo)</i>" : "";
    const side = String(r.side ?? "").toUpperCase(), lev = r.leverage ? ` ${r.leverage}×` : "";
    const how = r.fadedFromId ? "Faded: " : r.copiedFromId ? "Copied: " : "";
    let html = "", buttons: { text: string; url: string }[] = [];
    if (event === "open") {
      html = `${who}\n${how}opened <b>${side} ${escapeHtml(String(r.coin))}${lev}</b> at ${fmtPrice(String(r.entryPx))}${demo}`;
      buttons = [{ text: "Copy", url: `${APP_URL}/post/${r.id}?${q}` }, { text: "Fade", url: `${APP_URL}/c/${r.id}?${q}` }];
    } else if (event === "close") {
      const roi = tradeRoiPct({ side: r.side as string, entryPx: r.entryPx as string, exitPx: (r.exitPx as string) ?? null, size: (r.size as string) ?? null, leverage: Number(r.leverage ?? 1), status: "closed", realizedPnl: (r.realizedPnl as string) ?? null, meta: r.meta });
      const pnl = Number(r.realizedPnl ?? 0);
      html = `${who}\nclosed <b>${side} ${escapeHtml(String(r.coin))}${lev}</b> at ${fmtPrice(String(r.exitPx ?? r.entryPx))}: <b>${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%</b>${pnl ? ` (${fmtUsd(pnl, { sign: true })})` : ""}${demo}`;
      buttons = [{ text: "See the trade", url: `${APP_URL}/post/${r.id}?${q}` }];
    } else {
      const dir = r.side === "short" ? "down to" : "up to";
      const by = r.deadline ? ` by ${new Date(String(r.deadline)).toUTCString().slice(5, 22)} UTC` : "";
      html = `${who}\ncalled <b>${escapeHtml(String(r.coin))}</b> ${dir} ${fmtPrice(String(r.targetPx))}${by}`;
      buttons = [{ text: "Trade the call", url: `${APP_URL}/post/${r.id}?${q}` }, { text: "Fade it", url: `${APP_URL}/c/${r.id}?${q}` }];
    }
    html += `\n<a href="${APP_URL}/crew/${r.slug}?${q}">${escapeHtml(String(r.name))} on Perped</a>`;
    await tgSend(String(r.chat), html, buttons);
  });
}
