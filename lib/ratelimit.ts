// Spam guards: how many things one account may create in a short window. Counted from the rows themselves,
// so limits hold across every server instance with no extra service. Staff and bots are exempt.
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { isStaff } from "./programme-rates";

type Who = { id: string; role?: string | null; isBot?: boolean | null };

const LIMITS = {
  post: [{ n: 20, s: 60 }, { n: 300, s: 3600 }], // generous: trading a lot is the point, scripted floods are not
  comment: [{ n: 10, s: 60 }, { n: 200, s: 3600 }],
  follow: [{ n: 30, s: 60 }, { n: 300, s: 3600 }],
} as const;

/** Returns a friendly error Response when over the limit, otherwise null. */
export async function rateLimit(kind: keyof typeof LIMITS, u: Who): Promise<Response | null> {
  if (u.isBot || isStaff(u.role)) return null;
  for (const { n, s } of LIMITS[kind]) {
    const since = new Date(Date.now() - s * 1000);
    const count = await countSince(kind, u.id, since);
    if (count >= n) {
      const wait = s >= 3600 ? "an hour" : "a minute";
      return Response.json({ error: `Slow down: that's a lot of ${kind}s. Try again in ${wait}.` }, { status: 429, headers: { "retry-after": String(s) } });
    }
  }
  return null;
}

async function countSince(kind: keyof typeof LIMITS, userId: string, since: Date) {
  const n = sql<number>`count(*)`.mapWith(Number);
  if (kind === "post") return (await db.select({ n }).from(schema.posts).where(and(eq(schema.posts.userId, userId), gt(schema.posts.createdAt, since))))[0]?.n ?? 0;
  if (kind === "comment") return (await db.select({ n }).from(schema.comments).where(and(eq(schema.comments.userId, userId), gt(schema.comments.createdAt, since))))[0]?.n ?? 0;
  return (await db.select({ n }).from(schema.follows).where(and(eq(schema.follows.followerId, userId), gt(schema.follows.createdAt, since))))[0]?.n ?? 0;
}
