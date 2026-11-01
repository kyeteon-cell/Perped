import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "./db";
import { pushTo } from "./push";

/** The shape every feed consumer gets. Counts are computed in SQL so the feed is one query. */
export const feedSelect = {
  post: schema.posts,
  author: { id: schema.users.id, handle: schema.users.handle, address: schema.users.address, xp: schema.users.xp, avatarUrl: schema.users.avatarUrl, verified: schema.users.verified, showSizes: schema.users.showSizes, allowCopy: schema.users.allowCopy, allowFade: schema.users.allowFade, isDemo: schema.users.isDemo, isBot: schema.users.isBot, role: schema.users.role, founderSeat: schema.users.founderSeat, founderStatus: schema.users.founderStatus },
  likes: sql<number>`(select count(*) from votes v where v.post_id = ${schema.posts.id} and v.value = 1)`.mapWith(Number),
  dislikes: sql<number>`(select count(*) from votes v where v.post_id = ${schema.posts.id} and v.value = -1)`.mapWith(Number),
  commentCount: sql<number>`(select count(*) from comments c where c.post_id = ${schema.posts.id})`.mapWith(Number),
  copyCount: sql<number>`(select count(*) from posts p2 where p2.copied_from_id = ${schema.posts.id})`.mapWith(Number),
  fadeCount: sql<number>`(select count(*) from posts p3 where p3.faded_from_id = ${schema.posts.id})`.mapWith(Number),
  /** The trade this one copied or faded, with its author: names the source and powers the battle header. */
  src: sql<FeedSrc | null>`(select json_build_object('handle', su.handle, 'avatarUrl', su.avatar_url, 'xp', su.xp, 'side', sp.side, 'entryPx', sp.entry_px, 'leverage', sp.leverage, 'size', sp.size, 'status', sp.status, 'exitPx', sp.exit_px, 'slPx', sp.sl_px, 'createdAt', sp.created_at, 'nemesis', exists(select 1 from rivalries rv where rv.active and ((rv.user_a = su.id and rv.user_b = ${schema.posts.userId}) or (rv.user_b = su.id and rv.user_a = ${schema.posts.userId})) and (rv.called_by is not null or (rv.fights >= (select max(x.fights) from rivalries x where x.active and (x.user_a = su.id or x.user_b = su.id)) and rv.fights >= (select max(x.fights) from rivalries x where x.active and (x.user_a = ${schema.posts.userId} or x.user_b = ${schema.posts.userId})))))) from posts sp join users su on su.id = sp.user_id where sp.id = coalesce(${schema.posts.copiedFromId}, ${schema.posts.fadedFromId}))`,
  pollCounts: sql<number[]>`(select coalesce(array_agg(coalesce(c.cnt, 0)::int order by gs.i), '{}') from generate_series(0, greatest(coalesce(jsonb_array_length(${schema.posts.options}), 0) - 1, -1)) gs(i) left join (select pv.option as opt, count(*)::int as cnt from poll_votes pv where pv.post_id = ${schema.posts.id} group by pv.option) c on c.opt = gs.i)`.mapWith((v) => (Array.isArray(v) ? v.map(Number) : [])),
};

export type FeedSrc = { handle: string; avatarUrl: string | null; xp: number; side: "long" | "short" | null; entryPx: string | null; leverage: number | null; size: string | null; status: string; exitPx: string | null; slPx?: string | null; createdAt?: string | null; nemesis?: boolean };

export type FeedRow = {
  src?: FeedSrc | null;
  post: typeof schema.posts.$inferSelect;
  author: { id: string; handle: string; address?: string | null; xp?: number; avatarUrl: string | null; verified: boolean; showSizes: boolean; allowCopy?: boolean; allowFade?: boolean; isDemo: boolean; isBot: boolean; role?: string | null; founderSeat?: number | null; founderStatus?: string | null } | null;
  likes: number;
  dislikes: number;
  commentCount: number;
  copyCount: number;
  fadeCount: number;
  pollCounts: number[];
  myVote?: number | null;
  myPollVote?: number | null;
  /** Viewer already faded this trade, or this trade is a fade of the viewer's own trade. */
  noFade?: boolean;
  /** Set when the author is the viewer's rival: the series from the viewer's side. */
  rival?: { mine: number; theirs: number; me: string } | null;
};

/** Feed is strictly chronological (newest first). Pinned-first only where a profile asks for it. */
export async function queryFeed(opts: { where?: SQL | undefined; limit: number; viewerId?: string | null; pinnedFirst?: boolean }) {
  const rows = (await db
    .select(feedSelect)
    .from(schema.posts)
    .leftJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(opts.where)
    .orderBy(...(opts.pinnedFirst ? [desc(schema.posts.pinned)] : []), desc(schema.posts.createdAt), desc(schema.posts.id))
    .limit(opts.limit)) as unknown as FeedRow[];

  if (opts.viewerId && rows.length) {
    const ids = rows.map((r) => r.post.id);
    const srcIds = rows.map((r) => r.post.fadedFromId).filter((x): x is number => !!x);
    // All of the viewer's lookups at once: one round trip instead of six in a row.
    const [mine, polls, myFades, mySrc, rivals, meRows] = await Promise.all([
      db.select().from(schema.votes).where(and(eq(schema.votes.userId, opts.viewerId), inArray(schema.votes.postId, ids))),
      db.select().from(schema.pollVotes).where(and(eq(schema.pollVotes.userId, opts.viewerId), inArray(schema.pollVotes.postId, ids))),
      db.select({ src: schema.posts.fadedFromId }).from(schema.posts).where(and(eq(schema.posts.userId, opts.viewerId), inArray(schema.posts.fadedFromId, ids))),
      srcIds.length ? db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.userId, opts.viewerId), inArray(schema.posts.id, srcIds))) : Promise.resolve([] as { id: number }[]),
      db.select().from(schema.rivalries).where(and(eq(schema.rivalries.active, true), or(eq(schema.rivalries.userA, opts.viewerId), eq(schema.rivalries.userB, opts.viewerId)))),
      db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, opts.viewerId)).limit(1),
    ]);
    const meRow = meRows[0];
    for (const r of rows) {
      const rv = r.author ? rivals.find((x) => (x.userA === opts.viewerId && x.userB === r.author!.id) || (x.userB === opts.viewerId && x.userA === r.author!.id)) : undefined;
      r.rival = rv && meRow ? { mine: rv.userA === opts.viewerId ? rv.aWins : rv.bWins, theirs: rv.userA === opts.viewerId ? rv.bWins : rv.aWins, me: meRow.handle } : null;
      r.noFade = myFades.some((f) => f.src === r.post.id) || (!!r.post.fadedFromId && mySrc.some((m) => m.id === r.post.fadedFromId));
      r.myVote = mine.find((v) => v.postId === r.post.id)?.value ?? null;
      r.myPollVote = polls.find((v) => v.postId === r.post.id)?.option ?? null;
    }
  }
  return rows;
}

/** Insert a system post (liquidation, milestone, settled, rank, story). */
export async function systemPost(systemType: string, body: string, meta: Record<string, unknown> = {}, coin?: string) {
  const [p] = await db.insert(schema.posts).values({ kind: "system", systemType, body, meta, coin, status: "closed" }).returning();
  return p;
}

export async function notify(userId: string, type: string, title: string, body?: string, href?: string) {
  await db.insert(schema.notifications).values({ userId, type, title, body, href });
  await pushTo(userId, { title, body, href, tag: type });
}
