import { PrivyClient } from "@privy-io/server-auth";
import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "./db";
import { GUEST_COOKIE, guestAddress, verifyGuestToken } from "./guest";

const privy = new PrivyClient(process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cmvuadbdq07k40fl8a3hq3c3z", process.env.PRIVY_APP_SECRET ?? "");

export type AuthedUser = { privyId: string; address: string | null; hasExternalWallet: boolean; guest?: boolean; xHandle?: string | null };

/** Privy user lookups are a network round trip; cache them per user for 2 minutes. */
type PrivyUser = Awaited<ReturnType<typeof privy.getUser>>;
const userCache = new Map<string, { at: number; u: Promise<PrivyUser> }>();
function privyUser(id: string): Promise<PrivyUser> {
  const hit = userCache.get(id), now = Date.now();
  if (hit && now - hit.at < 120_000) return hit.u;
  const u = privy.getUser(id);
  userCache.set(id, { at: now, u });
  u.catch(() => userCache.delete(id));
  if (userCache.size > 2000) for (const [k, e] of userCache) if (now - e.at > 120_000) userCache.delete(k);
  return u;
}

/** Verify `Authorization: Bearer <privy token>` or `Authorization: Guest <guest token>` (demo-only accounts). */
export async function getAuth(req: Request): Promise<AuthedUser | null> {
  await ensureSchema();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Guest ")) {
    const id = verifyGuestToken(header.slice(6));
    return id ? { privyId: id, address: guestAddress(id), hasExternalWallet: false, guest: true } : null;
  }
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    // No header: a guest's cookie keeps them signed in even if the browser dropped localStorage.
    const m = new RegExp(`(?:^|;\\s*)${GUEST_COOKIE}=([^;]+)`).exec(req.headers.get("cookie") ?? "");
    const id = m ? verifyGuestToken(decodeURIComponent(m[1])) : null;
    return id ? { privyId: id, address: guestAddress(id), hasExternalWallet: false, guest: true } : null;
  }
  try {
    const claims = await privy.verifyAuthToken(token);
    // The embedded wallet address is sent by the client as a header; we verify it belongs to the user.
    const claimedAddress = req.headers.get("x-wallet-address");
    let address: string | null = null;
    let hasExternalWallet = false;
    let user = await privyUser(claims.userId);
    // A wallet linked in the last couple of minutes isn't in the cached copy yet: look again, fresh.
    if (claimedAddress && !user.linkedAccounts.some((a) => a.type === "wallet" && (a as { address?: string }).address?.toLowerCase() === claimedAddress.toLowerCase())) {
      userCache.delete(claims.userId);
      user = await privyUser(claims.userId);
    }
    const wallets = user.linkedAccounts.filter((a) => a.type === "wallet") as Array<{ address?: string; walletClientType?: string; connectorType?: string }>;
    hasExternalWallet = wallets.some((w) => w.walletClientType !== "privy" && w.connectorType !== "embedded");
    if (claimedAddress) {
      const owns = wallets.some((w) => w.address?.toLowerCase() === claimedAddress.toLowerCase());
      if (owns) address = claimedAddress.toLowerCase();
    }
    const x = user.linkedAccounts.find((a) => a.type === "twitter_oauth") as { username?: string | null } | undefined;
    return { privyId: claims.userId, address, hasExternalWallet, xHandle: x?.username ?? null };
  } catch {
    return null;
  }
}

/** Load (or null) the Perped profile for an authed user. */
export async function getProfile(privyId: string) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, privyId)).limit(1);
  return rows[0] ?? null;
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
