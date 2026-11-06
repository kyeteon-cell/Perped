/**
 * Plain-words messages for requests that never got an answer (no signal, dropped connection, server timeout).
 * Used so a button never gets stuck on "Filling…" when the phone loses signal mid-tap.
 */
export function isOffline(): boolean {
  try { return typeof navigator !== "undefined" && navigator.onLine === false; } catch { return false; }
}

/** A thrown fetch (TypeError "Failed to fetch" / "Load failed" on iPhone) or a non-JSON reply means we never heard back. */
export function netMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  if (isOffline()) return "You're offline. Check your signal and try again.";
  if (e instanceof TypeError) return "Connection dropped before Perped answered. It may still have gone through: check your open trades before trying again.";
  if (e instanceof SyntaxError) return "Perped took too long to answer. Try again in a moment.";
  return fallback;
}

/** Reads `{ error }` from a failed reply without throwing when the body isn't JSON (timeouts return an HTML page). */
export async function errorOf(r: Response, fallback: string): Promise<string> {
  const j = await r.json().catch(() => null);
  return (j && typeof j.error === "string" && j.error) || fallback;
}
