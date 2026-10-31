// Who's allowed into /admin: the CRON_SECRET key (scripts, the chat command) counts as owner; otherwise the signed-in user's role.
import { getAuth, getProfile } from "./auth";
import { isStaff } from "./programme-rates";

export type Staff = { role: "owner" | "admin"; userId: string | null; handle: string | null; viaKey: boolean };

export async function staffFrom(req: Request): Promise<Staff | null> {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key") ?? req.headers.get("x-admin-key");
  if (secret && key === secret) return { role: "owner", userId: null, handle: null, viaKey: true };
  const auth = await getAuth(req).catch(() => null);
  if (!auth || auth.guest) return null;
  const p = await getProfile(auth.privyId);
  if (!p || !isStaff(p.role)) return null;
  return { role: p.role as "owner" | "admin", userId: p.id, handle: p.handle, viaKey: false };
}
