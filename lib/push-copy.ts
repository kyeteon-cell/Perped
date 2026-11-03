/**
 * Lock-screen copy for push alerts. Phones cut the title at roughly 30 characters (iOS adds its own
 * "from Perped" line under it), so a push gets a short headline that carries the one thing that matters,
 * and the detail goes in the body, which wraps over several lines instead of being cut off.
 */
export type PushCopy = { title: string; body?: string };
export const PUSH_TITLE_MAX = 34; // iOS shows about 36 characters on one line before it cuts the title

const LABEL: Record<string, string> = {
  rival: "Rival alert", lead: "Fade update", battle: "Fade result", faded: "You got faded", copied: "You got copied",
  settled: "Fade settled", tp: "Take profit hit", sl: "Stop loss hit", stop: "Stop loss hit", liquidation: "Liquidated",
  call_hit: "Call hit", call_missed: "Call missed", duel: "Duel", rank: "Rank update", achievement: "Trophy unlocked",
  pick: "Pick won", recap: "Your week", fade_summary: "Your live fades", follow: "New follower", reply: "New comment",
  referral: "New invite", earnings: "Earnings", founder: "Founder", admin: "Perped", account: "Account", waitlist: "Real money",
};

/** One sentence per line, so the lock screen never wraps in the middle of one ("you lead / 3–2"). */
export const lines = (t?: string | null) => (t ?? "").replace(/\s+·\s+/g, "\n").replace(/([.!?])\s+(?=\S)/g, "$1\n").trim();

/** Fit a headline: keep it if it fits, otherwise use the alert's short label and move the full line into the body. */
export function fitPush(type: string, title: string, body?: string | null, custom?: PushCopy): PushCopy {
  const p = fitRaw(type, title, body, custom);
  return { title: p.title, body: p.body ? lines(p.body) || undefined : undefined };
}
function fitRaw(type: string, title: string, body?: string | null, custom?: PushCopy): PushCopy {
  if (custom) {
    if (custom.title.length <= PUSH_TITLE_MAX) return { title: custom.title, body: custom.body ?? body ?? undefined };
    // Too long (a long handle): keep the part before ":" or "·" as the headline and lead the body with the rest.
    const m = /^(.+?)(?::\s+|\s+·\s+)(.+)$/.exec(custom.title);
    if (m && m[1].length <= PUSH_TITLE_MAX) return { title: m[1], body: `${m[2]}. ${custom.body ?? body ?? ""}`.trim() };
  }
  const b = (body ?? "").trim();
  if (title.length <= PUSH_TITLE_MAX) return { title, body: b || undefined };
  const lead = title.replace(/\s+/g, " ").trim();
  return { title: LABEL[type] ?? "Perped", body: b ? `${lead}. ${b}` : lead };
}

/** "3–2 to you" / "2–3 to them" / "level at 2–2", from your wins and theirs. */
export const seriesLine = (mine: number, theirs: number) => (mine === theirs ? `level at ${mine}–${theirs}` : mine > theirs ? `you lead ${mine}–${theirs}` : `they lead ${theirs}–${mine}`);
