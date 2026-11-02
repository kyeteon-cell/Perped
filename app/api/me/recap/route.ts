import { getAuth, unauthorized } from "@/lib/auth";
import { lastWeek, weekRecap } from "@/lib/recap";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const { start, end } = lastWeek();
  const r = await weekRecap(auth.privyId, start, end);
  const active = r.fades.w + r.fades.l + r.fades.d + r.trades.n > 0;
  return Response.json({ recap: active ? r : null }, { headers: { "cache-control": "private, no-store" } });
}
