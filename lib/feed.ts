import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "./db";

/** The shape every feed consumer gets. Counts are computed in SQL so the feed is one query. */
export const feedSelect = {
  post: schema.posts,
  author: { id: schema.users.id, handle: schema.users.handle, address: schema.users.address, avatarUrl: schema.users.avatarUrl, verified: schema.users.verified, showSizes: schema.users.showSizes, allowCopy: schema.users.allowCopy, allowFade: schema.users.allowFade, isDemo: schema.users.isDemo, isBot: schema.users.isBot },
  likes: sql<number>`(select count(*) from votes v where v.post_id = ${schema.posts.id} and v.value = 1)`.mapWith(Number),
  dislikes: sql<number>`(select count(*) from votes v where v.post_id = ${schema.posts.id} and v.value = -1)`.mapWith(Number),
  commentCount: sql<number>`(select count(*) from comments c where c.post_id = ${schema.posts.id})`.mapWith(Number),
  copyCount: sql<number>`(select count(*) from posts p2 where p2.copied_from_id = ${schema.posts.id})`.mapWith(Number),
  fadeCount: sql<number>`(select count(*) from posts p3 where p3.faded_from_id = ${schema.posts.id})`.mapWith(Number),
  pollCounts: sql<number[]>`(select coalesce(array_agg(coalesce(c.cnt, 0)::int order by gs.i), '{}') from generate_series(0, greatest(coalesce(jsonb_array_length(${schema.posts.options}), 0) - 1, -1)) gs(i) left join (select pv.option as opt, count(*)::int as cnt from poll_votes pv where pv.post_id = ${schema.posts.id} group by pv.option) c on c.opt = gs.i)`.mapWith((v) => (Array.isArray(v) ? v.map(Number) : [])),
};

export type FeedRow = {
  post: typeof schema.posts.$inferSelect;
  author: { id: string; handle: string; address?: string | null; avatarUrl: string | null; verified: boolean; showSizes: boolean; allowCopy?: boolean; allowFade?: boolean; isDemo: boolean; isBot: boolean } | null;
  likes: number;
  dislikes: number;
  commentCount: number;
  copyCount: number;
  fadeCount: number;
  pollCounts: number[];
  myVote?: number | null;
  myPollVote?: number | null;
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
    const [mine, polls] = await Promise.all([
      db.select().from(schema.votes).where(and(eq(schema.votes.userId, opts.viewerId), inArray(schema.votes.postId, ids))),
      db.select().from(schema.pollVotes).where(and(eq(schema.pollVotes.userId, opts.viewerId), inArray(schema.pollVotes.postId, ids))),
    ]);
    for (const r of rows) {
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
}
