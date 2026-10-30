import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, getProfile, unauthorized } from "@/lib/auth";
import { notify } from "@/lib/feed";

const Body = z.object({ handle: z.string() });

/** POST /api/follows {handle} → toggle follow. */
export async function POST(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "pick a handle first" }, { status: 400 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const [target] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, parsed.data.handle.toLowerCase())).limit(1);
  if (!target || target.id === me.id) return Response.json({ error: "not found" }, { status: 404 });
  const where = and(eq(schema.follows.followerId, me.id), eq(schema.follows.followeeId, target.id));
  const [existing] = await db.select().from(schema.follows).where(where).limit(1);
  if (existing) {
    await db.delete(schema.follows).where(where);
    return Response.json({ following: false });
  }
  await db.insert(schema.follows).values({ followerId: me.id, followeeId: target.id });
  await notify(target.id, "follow", `${me.handle} followed you`, undefined, `/u/${me.handle}`);
  return Response.json({ following: true });
}

/** GET /api/follows?handle=&dir=followers|following → list with light stats. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const handle = (url.searchParams.get("handle") ?? "").toLowerCase();
  const dir = url.searchParams.get("dir") === "following" ? "following" : "followers";
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  if (!u) return Response.json({ users: [] });
  const col = dir === "followers" ? schema.follows.followeeId : schema.follows.followerId;
  const other = dir === "followers" ? schema.follows.followerId : schema.follows.followeeId;
  const rows = await db
    .select({ handle: schema.users.handle, avatarUrl: schema.users.avatarUrl, pnl7d: schema.stats.realizedPnl7d, winRate: schema.stats.winRate })
    .from(schema.follows)
    .innerJoin(schema.users, eq(schema.users.id, other))
    .leftJoin(schema.stats, eq(schema.stats.userId, schema.users.id))
    .where(eq(col, u.id))
    .limit(200);
  return Response.json({ users: rows });
}
