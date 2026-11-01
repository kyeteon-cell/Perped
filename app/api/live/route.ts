import { getAuth, getProfile } from "@/lib/auth";
import { earlyAccessStatus, getLiveSettings, joinEarlyAccess, liveAllowed } from "@/lib/live";

export const dynamic = "force-dynamic";

/** GET /api/live → is real-money trading open, and (signed in) this person's early-access status. */
export async function GET(req: Request) {
  const live = await getLiveSettings();
  const auth = await getAuth(req).catch(() => null);
  if (!auth || auth.guest) return Response.json({ open: live.open, allowed: live.open, signedIn: !!auth, guest: !!auth?.guest });
  const me = await getProfile(auth.privyId);
  return Response.json({ open: live.open, allowed: liveAllowed(live.open, me), signedIn: true, guest: false, ...(me ? await earlyAccessStatus(me.id) : {}) });
}

/** POST /api/live → join the early-access list. Returns place in line. */
export async function POST(req: Request) {
  const auth = await getAuth(req).catch(() => null);
  if (!auth) return Response.json({ error: "sign in first" }, { status: 401 });
  if (auth.guest) return Response.json({ error: "guest" }, { status: 400 });
  const me = await getProfile(auth.privyId);
  if (!me) return Response.json({ error: "finish setting up your profile first" }, { status: 400 });
  return Response.json({ ok: true, ...(await joinEarlyAccess(me.id)) });
}
