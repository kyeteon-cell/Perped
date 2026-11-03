import { z } from "zod";
import { getAuth, unauthorized } from "@/lib/auth";
import { closeTradePost } from "@/lib/trades";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { checkSoon } from "@/lib/achievements";
import { settleBattles } from "@/lib/battles";
import { getMids } from "@/lib/hl-info";

export const dynamic = "force-dynamic";

const Body = z.object({ exitPx: z.number().positive().optional(), fraction: z.number().min(0.01).max(1).optional() });

/** POST /api/posts/:id/close {exitPx?, fraction?} → close (or partially close) your trade; settles copiers vs faders when it fully closes. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const r = await closeTradePost(Number(id), auth.privyId, { ...parsed.data, reason: "manual" });
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
  after(async () => {
    // A fight where both sides have now closed is decided: settle it straight away instead of waiting for the 5-minute sweep.
    if (r && typeof r === "object" && !("partial" in r && (r as { partial?: boolean }).partial)) {
      await settleBattles(await getMids().catch(() => ({})), { postIds: [Number(id)] }).catch(() => 0);
    }
    const [p] = await db.select({ userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.id, Number(id))).limit(1); await checkSoon(p?.userId);
  });
  return Response.json(r);
}
