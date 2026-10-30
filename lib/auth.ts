import { PrivyClient } from "@privy-io/server-auth";
import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "./db";
import { guestAddress, verifyGuestToken } from "./guest";

const privy = new PrivyClient(process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cmvuadbdq07k40fl8a3hq3c3z", process.env.PRIVY_APP_SECRET ?? "");

export type AuthedUser = { privyId: string; address: string | null; hasExternalWallet: boolean; guest?: boolean };

/** Verify `Authorization: Bearer <privy token>` or `Authorization: Guest <guest token>` (demo-only accounts). */
export async function getAuth(req: Request): Promise<AuthedUser | null> {
  await ensureSchema();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Guest ")) {
    const id = verifyGuestToken(header.slice(6));
    return id ? { privyId: id, address: guestAddress(id), hasExternalWallet: false, guest: true } : null;
  }
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const claims = await privy.verifyAuthToken(token);
    // The embedded wallet address is sent by the client as a header; we verify it belongs to the user.
    const claimedAddress = req.headers.get("x-wallet-address");
    let address: string | null = null;
    let hasExternalWallet = false;
    const user = await privy.getUser(claims.userId);
    const wallets = user.linkedAccounts.filter((a) => a.type === "wallet") as Array<{ address?: string; walletClientType?: string; connectorType?: string }>;
    hasExternalWallet = wallets.some((w) => w.walletClientType !== "privy" && w.connectorType !== "embedded");
    if (claimedAddress) {
      const owns = wallets.some((w) => w.address?.toLowerCase() === claimedAddress.toLowerCase());
      if (owns) address = claimedAddress.toLowerCase();
    }
    return { privyId: claims.userId, address, hasExternalWallet };
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
