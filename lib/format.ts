// Pure formatting helpers (no deps) used on both server and client.

export function fmtUsd(n: number | string | null | undefined, opts: { compact?: boolean; sign?: boolean } = {}) {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  if (!Number.isFinite(v)) return "$0";
  const sign = opts.sign && v > 0 ? "+" : v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (opts.compact) {
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  }
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Margin / stake amounts: "$250", "$1,250", "$87.50" — no trailing .00 on round numbers. */
export function fmtStake(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  if (!Number.isFinite(v)) return "$0";
  const abs = Math.abs(v), whole = Math.abs(abs - Math.round(abs)) < 0.005;
  return `$${abs.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

export function fmtPct(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

/**
 * Display price: 5 significant figures like Hyperliquid's UI, thousands separators, no trailing zeros,
 * never more than 6 decimals. 102.12488804590004 → "102.12", 0.1715259763 → "0.17153", 67890.12 → "67,890".
 */
export function fmtPrice(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : n;
  if (v == null || !Number.isFinite(v) || v === 0) return v === 0 ? "0" : "—";
  const abs = Math.abs(v);
  const sig = Number(abs.toPrecision(5));
  const decimals = Math.min(6, Math.max(0, decimalsOf(sig)));
  const out = sig.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  return (v < 0 ? "-" : "") + out;
}

// Hyperliquid prices: up to 5 significant figures, and at most (6 - szDecimals) decimals for perps.
export function fmtPx(px: number, szDecimals = 0) {
  if (!Number.isFinite(px)) return "0";
  const maxDecimals = Math.max(0, 6 - szDecimals);
  const sig = Number(px.toPrecision(5));
  const fixed = sig.toFixed(Math.min(maxDecimals, decimalsOf(sig)));
  return trimZeros(fixed);
}

// Round a size to the coin's szDecimals.
export function roundSize(sz: number, szDecimals: number) {
  const f = 10 ** szDecimals;
  return Math.floor(sz * f + 1e-9) / f;
}

export function fmtSize(sz: number, szDecimals: number) {
  return trimZeros(sz.toFixed(szDecimals));
}

export function timeAgo(ts: number | string | Date) {
  const t = typeof ts === "number" ? ts : new Date(ts).getTime();
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function pnlForPosition(side: "long" | "short", entryPx: number, markPx: number, size: number) {
  const diff = side === "long" ? markPx - entryPx : entryPx - markPx;
  const pnl = diff * size;
  const pct = entryPx > 0 ? (diff / entryPx) * 100 : 0;
  return { pnl, pct };
}

type RoiPost = { side: string | null; entryPx: string | number | null; exitPx?: string | number | null; size: string | number | null; leverage: number | null; status: string | null; realizedPnl?: string | number | null; meta?: unknown };
/**
 * Leverage-adjusted ROI of a whole trade, partial closes included: everything banked plus what's still open,
 * over the margin the trade started with. Scoring on the last exit price alone would ignore earlier slices.
 */
export function tradeRoiPct(p: RoiPost, mark?: number) {
  const entry = Number(p.entryPx), lev = p.leverage ?? 1, size = Number(p.size ?? 0);
  const meta = (p.meta ?? {}) as { partials?: { size: number }[]; realizedSoFar?: number; closeReason?: string };
  const sliced = (meta.partials ?? []).reduce((a, x) => a + Number(x.size || 0), 0);
  const margin = ((size + sliced) * entry) / lev;
  const side = p.side === "short" ? "short" : "long";
  if (!(margin > 0)) return 0;
  if (p.status === "closed") {
    if (p.realizedPnl != null && p.realizedPnl !== "") return (Number(p.realizedPnl) / margin) * 100;
    if (meta.closeReason === "liquidation") return -100;
    return pnlForPosition(side, entry, Number(p.exitPx ?? entry), size + sliced).pct * lev;
  }
  const open = pnlForPosition(side, entry, mark || entry, size).pnl;
  return ((Number(meta.realizedSoFar ?? 0) + open) / margin) * 100;
}

export function sizeTier(usd: number) {
  if (usd >= 10000) return "whale";
  if (usd >= 1000) return "large";
  if (usd >= 100) return "mid";
  return "small";
}

function decimalsOf(n: number) {
  const s = n.toString();
  if (s.includes("e-")) return Number(s.split("e-")[1]) + (s.split(".")[1]?.split("e")[0].length ?? 0);
  return s.split(".")[1]?.length ?? 0;
}

function trimZeros(s: string) {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Demo liquidation price: where the loss equals the margin (no maintenance margin, for simplicity). */
export function demoLiqPx(side: "long" | "short", entry: number, lev: number) {
  return side === "long" ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev);
}

/**
 * Automatic stop for fades, as a fraction of price: −10% of margin, but never tighter than a 1% price move
 * (so normal noise doesn't stop you out at high leverage), and always well inside liquidation (≤ 60% of the way).
 */
export function autoStopDist(lev: number) {
  const l = Math.max(1, lev);
  return Math.max(0.1 / l, Math.min(0.01, 0.6 / l));
}

/** Hyperliquid market names are upper-case, except the 1000x markets which keep a lower-case "k" (kPEPE, kBONK). */
export function normCoin(c: string) {
  const t = c.trim();
  return /^k[A-Za-z0-9]/.test(t) && t.length > 2 && t[1] === t[1].toUpperCase() ? "k" + t.slice(1).toUpperCase() : t.toUpperCase();
}

/** Funding per 8h (%) → a plain label when one side is clearly crowded. Hyperliquid's resting rate is 0.01% / 8h. */
export function crowdLabel(funding8h: number): string | null {
  if (funding8h >= 0.03) return "crowded long";
  if (funding8h <= -0.03) return "crowded short";
  if (funding8h < 0) return "shorts pay";
  return null;
}
