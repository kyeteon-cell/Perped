import { PrivyClient } from "@privy-io/server-auth";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";

const privy = new PrivyClient(process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "", process.env.PRIVY_APP_SECRET ?? "");

export type AuthedUser = { privyId: string; address: string | null };

/** Verify the Privy access token sent as `Authorization: Bearer <token>`. */
export async function getAuth(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const claims = await privy.verifyAuthToken(token);
    // The embedded wallet address is sent by the client as a header; we verify it belongs to the user.
    const claimedAddress = req.headers.get("x-wallet-address");
    let address: string | null = null;
    if (claimedAddress) {
      const user = await privy.getUser(claims.userId);
      const owns = user.linkedAccounts.some(
        (a) => a.type === "wallet" && "address" in a && a.address.toLowerCase() === claimedAddress.toLowerCase(),
      );
      if (owns) address = claimedAddress.toLowerCase();
    }
    return { privyId: claims.userId, address };
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
