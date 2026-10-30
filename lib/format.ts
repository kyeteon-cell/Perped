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
