import { getAuth, unauthorized } from "@/lib/auth";
import { fadeBlockReason } from "@/lib/fades";

export const dynamic = "force-dynamic";

/** GET /api/posts/:id/fade-check → { ok } or { ok:false, reason }. Called before a real fade goes to Hyperliquid. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { id } = await ctx.params;
  const reason = await fadeBlockReason(auth.privyId, Number(id));
  return Response.json(reason ? { ok: false, reason } : { ok: true });
}
