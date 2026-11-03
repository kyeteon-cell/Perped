// Verified Hyperliquid history: a trader signs a message with the wallet they trade from, and we read that
// wallet's public record from Hyperliquid mainnet (PnL, volume, closes) so their profile starts with a real
// track record instead of zero. Nothing is copied into the feed; it's a summary card, refreshed daily.
import { verifyMessage } from "viem";
import { info, type Fill } from "./hl-info";
import { linkMessage } from "./hl-link";
import type { HlRecord } from "./hl-link";
export type { HlRecord };



type Period = { accountValueHistory: [number, string][]; pnlHistory: [number, string][]; vlm: string };


/** Checks the signed link message: right wallet, right account, signed in the last 15 minutes. */
export async function checkLinkSignature(address: string, handle: string, issued: string, signature: string): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return "That isn't a wallet address";
  const t = Date.parse(issued);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 15 * 60_000) return "That signature has expired. Try again.";
  const ok = await verifyMessage({ address: address as `0x${string}`, message: linkMessage(address, handle, issued), signature: signature as `0x${string}` }).catch(() => false);
  return ok ? null : "The signature doesn't match that wallet";
}

const last = (h: [number, string][] | undefined) => (h && h.length ? Number(h[h.length - 1][1]) : 0);
const plain = (coin: string) => coin.replace(/^[a-z0-9]+:/, "");

/** Reads the wallet's public mainnet record from Hyperliquid. */
export async function readHlRecord(address: string): Promise<HlRecord> {
  const user = address.toLowerCase();
  const [portfolio, fills] = await Promise.all([
    info<[string, Period][]>({ type: "portfolio", user }).catch(() => [] as [string, Period][]),
    info<Fill[]>({ type: "userFills", user, aggregateByTime: true }).catch(() => [] as Fill[]),
  ]);
  const p = Object.fromEntries(portfolio) as Record<string, Period | undefined>;
  // Perp-only figures where Hyperliquid has them (spot moves would muddy a trading record).
  const all = p.perpAllTime ?? p.allTime, month = p.perpMonth ?? p.month, week = p.perpWeek ?? p.week;
  const closes = fills.filter((f) => Number(f.closedPnl) !== 0);
  const net = (f: Fill) => Number(f.closedPnl) - Number(f.fee || 0);
  const wins = closes.filter((f) => net(f) > 0).length;
  const byPnl = [...closes].sort((a, b) => net(b) - net(a));
  const vol = new Map<string, number>();
  for (const f of fills) vol.set(plain(f.coin), (vol.get(plain(f.coin)) ?? 0) + Number(f.px) * Number(f.sz));
  const firstPoint = (p.allTime?.accountValueHistory ?? []).find((x) => Number(x[1]) > 0)?.[0] ?? null;
  return {
    address: user,
    pnlAll: last(all?.pnlHistory), pnl30d: last(month?.pnlHistory), pnl7d: last(week?.pnlHistory),
    volumeAll: Number(all?.vlm ?? 0), volume30d: Number(month?.vlm ?? 0),
    accountValue: last(p.allTime?.accountValueHistory),
    since: firstPoint ?? (fills.length ? Math.min(...fills.map((f) => f.time)) : null),
    closes: closes.length, wins, winRate: closes.length ? (wins / closes.length) * 100 : 0,
    best: byPnl[0] && net(byPnl[0]) > 0 ? { coin: plain(byPnl[0].coin), pnl: net(byPnl[0]), time: byPnl[0].time } : null,
    worst: byPnl.length && net(byPnl[byPnl.length - 1]) < 0 ? { coin: plain(byPnl[byPnl.length - 1].coin), pnl: net(byPnl[byPnl.length - 1]), time: byPnl[byPnl.length - 1].time } : null,
    topCoins: [...vol.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([coin, volume]) => ({ coin, volume })),
    updatedAt: Date.now(),
  };
}

/** A record worth showing: the wallet has actually traded perps. */
export const hasHistory = (r: HlRecord) => r.volumeAll > 0 || r.closes > 0;
