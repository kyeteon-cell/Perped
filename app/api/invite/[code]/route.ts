import { ensureSchema } from "@/lib/db";
import { normaliseReferralCode } from "@/lib/fees";
import { byHandle } from "@/lib/programme";
import { isFounder } from "@/lib/programme-rates";
import { BUILDER_FEE_REFERRED_TENTHS_BPS, BUILDER_FEE_STANDARD_TENTHS_BPS } from "@/lib/config";
import { tenthsBpsToLabel } from "@/lib/fees";

export const dynamic = "force-dynamic";

/** GET /api/invite/:code → who's inviting (public), for the invite landing page. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  await ensureSchema();
  const c = normaliseReferralCode((await ctx.params).code);
  const u = c ? await byHandle(c) : null;
  const fees = { normal: tenthsBpsToLabel(BUILDER_FEE_STANDARD_TENTHS_BPS), invited: tenthsBpsToLabel(BUILDER_FEE_REFERRED_TENTHS_BPS), normalBps: BUILDER_FEE_STANDARD_TENTHS_BPS, invitedBps: BUILDER_FEE_REFERRED_TENTHS_BPS };
  if (!u || u.isBot) return Response.json({ valid: false, fees });
  return Response.json({ valid: true, code: u.handle, handle: u.handle, avatarUrl: u.avatarUrl, founderSeat: isFounder(u) ? u.founderSeat : null, fees }, { headers: { "cache-control": "public, max-age=60" } });
}
