import { desc, eq, or, sql } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export type ActivityItem = {
  type: "open" | "close" | "copy" | "fade" | "call" | "post" | "poll" | "battle" | "comment" | "like" | "dislike";
  at: string;
  text: string;
  href: string;
  coin?: string | null;
  side?: "long" | "short" | null;
  roi?: number | null;
  won?: boolean | null;
  who?: string | null; // the other person, when there is one
};

/** GET /api/profile/:handle/activity → one chronological stream of everything this trader did. */
export async function GET(_req: Request, ctx: { params: Promise<{ handle: string }> }) {
  await ensureSchema();
  const { handle } = await ctx.params;
  const [u] = await db.select({ id: schema.users.id, handle: schema.users.handle }).from(schema.users).where(eq(schema.users.handle, handle.toLowerCase())).limit(1);
  if (!u) return Response.json({ items: [] });
  const items: ActivityItem[] = [];

  // Their own posts: trades (open + close events), copies/fades, calls, text, polls.
  const posts = await db.select().from(schema.posts).where(eq(schema.posts.userId, u.id)).orderBy(desc(schema.posts.createdAt)).limit(150);
  const srcIds = posts.map((p) => p.copiedFromId ?? p.fadedFromId).filter((x): x is number => !!x);
  const srcAuthors = srcIds.length ? await db.select({ id: schema.posts.id, handle: schema.users.handle }).from(schema.posts).leftJoin(schema.users, eq(schema.users.id, schema.posts.userId)).where(sql`${schema.posts.id} in ${srcIds}`) : [];
  const authorOf = (id: number | null) => srcAuthors.find((s) => s.id === id)?.handle ?? null;
  for (const p of posts) {
    const href = `/post/${p.id}`;
    if (p.kind === "trade") {
      const lev = p.leverage ?? 1, entry = Number(p.entryPx);
      const who = authorOf(p.copiedFromId ?? p.fadedFromId);
      const verb = p.fadedFromId ? "fade" : p.copiedFromId ? "copy" : "open";
      items.push({ type: verb, at: p.createdAt.toISOString(), coin: p.coin, side: p.side as "long" | "short", who, href,
        text: verb === "fade" ? `Faded ${who ?? "a trade"} · ${p.side} ${p.coin} ${lev}×` : verb === "copy" ? `Copied ${who ?? "a trade"} · ${p.side} ${p.coin} ${lev}×` : `Opened ${p.side} ${p.coin} ${lev}×` });
      if (p.status === "closed" && p.closedAt) {
        const exit = Number(p.exitPx ?? entry);
        const roi = ((exit - entry) / entry) * 100 * (p.side === "long" ? 1 : -1) * lev;
        const reason = (p.meta as { closeReason?: string } | null)?.closeReason;
        items.push({ type: "close", at: p.closedAt.toISOString(), coin: p.coin, side: p.side as "long" | "short", roi, href,
          text: `${reason === "liquidation" ? "Liquidated on" : reason === "tp" ? "Take profit on" : reason === "sl" ? "Stopped out of" : "Closed"} ${p.side} ${p.coin} ${lev}× · ${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%` });
      }
    } else if (p.kind === "call") {
      items.push({ type: "call", at: p.createdAt.toISOString(), coin: p.coin, side: p.side as "long" | "short", href, text: `Called ${p.coin} ${p.side === "long" ? "higher" : "lower"}${p.callStatus && p.callStatus !== "open" ? ` · ${p.callStatus}` : ""}` });
    } else if (p.kind === "poll") {
      items.push({ type: "poll", at: p.createdAt.toISOString(), href, text: `Asked: ${p.body ?? ""}` });
    } else if (p.kind === "text") {
      items.push({ type: "post", at: p.createdAt.toISOString(), coin: p.coin, href, text: p.body ?? "" });
    }
  }

  // Battles they were in.
  const battles = await db.select().from(schema.battles).where(or(eq(schema.battles.faderId, u.id), eq(schema.battles.targetId, u.id))).orderBy(desc(schema.battles.createdAt)).limit(60);
  const oppIds = [...new Set(battles.map((b) => (b.faderId === u.id ? b.targetId : b.faderId)))];
  const opps = oppIds.length ? await db.select({ id: schema.users.id, handle: schema.users.handle }).from(schema.users).where(sql`${schema.users.id} in ${oppIds}`) : [];
  for (const b of battles) {
    const opp = opps.find((o) => o.id === (b.faderId === u.id ? b.targetId : b.faderId))?.handle ?? "someone";
    const href = `/battle/${b.faderPostId}`;
    if (b.status === "settled" && b.settledAt) {
      const won = b.winnerId ? b.winnerId === u.id : null;
      const my = Number(b.faderId === u.id ? b.faderRoi : b.targetRoi), their = Number(b.faderId === u.id ? b.targetRoi : b.faderRoi);
      items.push({ type: "battle", at: b.settledAt.toISOString(), coin: b.coin, won, who: opp, href, text: won === true ? `Perped ${opp} on ${b.coin} · ${my >= 0 ? "+" : ""}${my.toFixed(1)}% vs ${their >= 0 ? "+" : ""}${their.toFixed(1)}%` : won === false ? `Perped by ${opp} on ${b.coin} · ${my >= 0 ? "+" : ""}${my.toFixed(1)}% vs ${their >= 0 ? "+" : ""}${their.toFixed(1)}%` : `Drew with ${opp} on ${b.coin}` });
    } else {
      items.push({ type: "battle", at: b.createdAt.toISOString(), coin: b.coin, won: null, who: opp, href, text: `Fade live vs ${opp} on ${b.coin}` });
    }
  }

  // Comments and likes they left.
  const comments = await db.select({ id: schema.comments.id, postId: schema.comments.postId, body: schema.comments.body, createdAt: schema.comments.createdAt, onHandle: schema.users.handle })
    .from(schema.comments).leftJoin(schema.posts, eq(schema.posts.id, schema.comments.postId)).leftJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(eq(schema.comments.userId, u.id)).orderBy(desc(schema.comments.createdAt)).limit(60);
  for (const c of comments) items.push({ type: "comment", at: c.createdAt.toISOString(), who: c.onHandle, href: `/post/${c.postId}`, text: `Commented on ${c.onHandle ?? "a post"}: “${c.body.slice(0, 90)}${c.body.length > 90 ? "…" : ""}”` });
  const votes = await db.select({ postId: schema.votes.postId, value: schema.votes.value, createdAt: schema.votes.createdAt, onHandle: schema.users.handle, coin: schema.posts.coin, kind: schema.posts.kind })
    .from(schema.votes).leftJoin(schema.posts, eq(schema.posts.id, schema.votes.postId)).leftJoin(schema.users, eq(schema.users.id, schema.posts.userId))
    .where(eq(schema.votes.userId, u.id)).orderBy(desc(schema.votes.createdAt)).limit(60);
  for (const v of votes) items.push({ type: v.value > 0 ? "like" : "dislike", at: v.createdAt.toISOString(), who: v.onHandle, coin: v.coin, href: `/post/${v.postId}`, text: `${v.value > 0 ? "Liked" : "Disliked"} ${v.onHandle ?? "a post"}'s ${v.kind === "trade" ? `${v.coin} trade` : v.kind ?? "post"}` });

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return Response.json({ items: items.slice(0, 120) });
}
