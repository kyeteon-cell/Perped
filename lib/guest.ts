// Guest (no-login) demo accounts. A guest is identified by a random id signed with a server secret,
// stored in the browser; it can trade in demo only and never touches Hyperliquid.
import { createHmac, randomUUID, createHash, timingSafeEqual } from "crypto";

function secret() {
  const s = process.env.GUEST_SECRET || process.env.CRON_SECRET || process.env.PRIVY_APP_SECRET || process.env.DATABASE_URL;
  if (!s) throw new Error("No secret available for guest tokens (set GUEST_SECRET)");
  return s;
}

export function isGuestId(id: string) {
  return id.startsWith("guest:");
}

export function newGuestToken(): { id: string; token: string } {
  const id = `guest:${randomUUID()}`;
  const sig = createHmac("sha256", secret()).update(id).digest("base64url");
  return { id, token: `${id}.${sig}` };
}

export function verifyGuestToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot), sig = token.slice(dot + 1);
  if (!isGuestId(id)) return null;
  const expect = createHmac("sha256", secret()).update(id).digest("base64url");
  if (sig.length !== expect.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expect)) ? id : null;
}

/** Deterministic placeholder "address" so the users.address unique index is satisfied. Not a real wallet. */
export function guestAddress(id: string) {
  return `0x${createHash("sha256").update(id).digest("hex").slice(0, 40)}`;
}
