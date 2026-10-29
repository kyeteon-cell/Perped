import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { MAX_LEVERAGE, MAX_POSITION_USD } from "@/lib/config";

/** GET /api/posts?cursor=<id>&limit=30 → feed, newest first, with author + counts. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 30));
  const cursor = Number(url.searchParams.get("cursor") ?? 0);
  const handle = url.searchParams.get("handle");

  const rows = await db
    .select({
      post: schema.posts,
      author: { id: schema.users.id, handle: schema.users.handle, address: schema.users.address, avatarUrl: schema.users.avatarUrl },
      commentCount: sql<number>`(select count(*) from comments c where c.post_id = ${schema.posts.id})`.mapWith(Number),
      reactionCount: sql<number>`(select count(*) from reactions r where r.post_id = ${schema.posts.id})`.mapWith(Number),
      copyCount: sql<number>`(select count(*) from posts p2 where p2.copied_from_id = ${schema.posts.id})`.mapWith(Number),
    })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(
      handle
        ? cursor
          ? sql`${schema.users.handle} = ${handle} and ${schema.posts.id} < ${cursor}`
          : eq(schema.users.handle, handle)
        : cursor
          ? sql`${schema.posts.id} < ${cursor}`
          : undefined,
    )
    .orderBy(desc(schema.posts.id))
    .limit(limit);

  return Response.json({ posts: rows, nextCursor: rows.length === limit ? rows[rows.length - 1].post.id : null });
}

const Body = z.object({
  coin: z.string().min(1).max(20),
  side: z.enum(["long", "short"]),
  size: z.number().positive(),
  notionalUsd: z.number().positive().max(MAX_POSITION_USD * 100), // hard server ceiling
  leverage: z.number().int().min(1).max(MAX_LEVERAGE),
  entryPx: z.number().positive(),
  oid: z.number().int().optional(),
  caption: z.string().max(240).optional(),
  copiedFromId: z.number().int().optional(),
});

/** POST /api/posts → record a trade the client just placed on Hyperliquid. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const profile = await getProfile(auth.privyId);
  if (!profile) return Response.json({ error: "pick a handle first" }, { status: 400 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const b = parsed.data;
  const [post] = await db
    .insert(schema.posts)
    .values({
      userId: profile.id,
      coin: b.coin,
      side: b.side,
      size: String(b.size),
      notionalUsd: String(b.notionalUsd),
      leverage: b.leverage,
      entryPx: String(b.entryPx),
      oid: b.oid,
      caption: b.caption,
      copiedFromId: b.copiedFromId,
    })
    .returning();
  return Response.json({ post });
}
