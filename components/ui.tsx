"use client";

import Link from "next/link";
import useSWR from "swr";
import { rankFor } from "@/lib/rank";

/** Small shared pieces: icons, coin monograms, avatars, theme helpers. */

export function Icon({ d, size = 20, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

export const I = {
  home: "M3 11.5 12 4l9 7.5M5 10v10h14V10",
  markets: "M3 17l6-6 4 4 8-8M14 7h7v7",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 6h3a3 3 0 0 1-3 3M7 6H4a3 3 0 0 0 3 3",
  user: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21a8 8 0 0 1 16 0",
  bell: "M6 8a6 6 0 0 1 12 0v5l2 3H4l2-3zM10 20a2 2 0 0 0 4 0",
  search: "M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM20 20l-3.5-3.5",
  back: "m15 5-7 7 7 7",
  like: "M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2v4h5a2 2 0 0 1 2 2l-1.5 7a2 2 0 0 1-2 2H7",
  dislike: "M17 13V4h3v9zM17 13l-4 8a2 2 0 0 1-3-2v-4H5a2 2 0 0 1-2-2l1.5-7a2 2 0 0 1 2-2H17",
  comment: "M4 5h16v11H9l-5 4z",
  copy: "M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  check: "M20 6 9 17l-5-5",
  warn: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  plus: "M12 5v14M5 12h14",
  list: "M8 7h8M8 12h8M8 17h5",
  shield: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
  card: "M3 7h18v10H3zM3 11h18",
  down: "M12 3v12M7 10l5 5 5-5M4 21h16",
  wallet: "M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2",
  x: "M4 4l16 16M20 4L4 20",
  share: "M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7",
  mail: "M4 7h16v10H4zM4 7l8 6 8-6",
  circle: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  lock: "M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11",
};

/** Coloured disc with the ticker's first letters. */
/**
 * Hyperliquid lists some low-priced coins in thousands with a "k" prefix (kPEPE = 1000 PEPE).
 * Show the real ticker and keep the multiplier as a hint.
 */
export function coinInfo(coin: string): { base: string; ticker: string; mult: number } {
  const base = coin.startsWith("k") && coin.length > 1 && coin[1] === coin[1].toUpperCase() ? coin.slice(1) : coin;
  return { base, ticker: base, mult: base === coin ? 1 : 1000 };
}

/** Coin logo from Hyperliquid's own icon set, with a coloured letter badge as the fallback. */
export function CoinMark({ coin, size }: { coin: string; size?: "xs" | "sm" | "lg" }) {
  const { base, mult } = coinInfo(coin);
  return (
    <span className={`cm ${size ?? ""}`} data-c={base} title={mult > 1 ? `${coin} = ${mult} ${base}` : base}>
      <img
        src={`https://app.hyperliquid.xyz/coins/${encodeURIComponent(coin)}.svg`}
        alt=""
        loading="lazy"
        onError={(e) => { const img = e.currentTarget; img.style.display = "none"; (img.nextSibling as HTMLElement | null)?.removeAttribute("hidden"); }}
      />
      <b hidden>{base.slice(0, 4)}</b>
    </span>
  );
}

/** Human ticker for a Hyperliquid coin name: "kPEPE" → "PEPE" (with "1000×" when `withMult`). */
export function ticker(coin: string, withMult = false) {
  const { base, mult } = coinInfo(coin);
  return withMult && mult > 1 ? `${base} ·1000×` : base;
}

/** Deterministic gradient avatar from a handle. */
/**
 * Avatar. Pass `url` (string or null) when the caller has the profile; leave it undefined and the picture is
 * looked up by handle (one small request per handle, cached), so system cards and suggestions get photos too.
 */
export function Avatar({ handle, size = 40, url, link = true }: { handle: string; size?: number; url?: string | null; link?: boolean }) {
  const idx = [...handle].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  const { data } = useSWR<{ url: string | null }>(url === undefined && handle && handle !== "?" ? `/api/avatar?handle=${encodeURIComponent(handle)}` : null, { dedupingInterval: 300_000, revalidateOnFocus: false });
  const src = url ?? data?.url ?? null;
  const pic = src
    ? <img src={src} alt="" className="av" style={{ width: size, height: size, objectFit: "cover" }} />
    : <span className={`av av-${idx}`} style={{ width: size, height: size, fontSize: Math.round(size / 3) }}>{handle.slice(0, 2).toUpperCase()}</span>;
  // Every profile picture is a link to that profile, unless the caller already sits inside a link.
  if (!link || !handle || handle === "?") return pic;
  return <Link href={`/u/${handle}`} className="avlink" aria-label={`${handle}'s profile`} onClick={(e) => e.stopPropagation()}>{pic}</Link>;
}

export type Theme = "light" | "dark" | "auto";
export function setTheme(t: Theme) {
  try { localStorage.setItem("perped-theme", t); } catch {}
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}
export function getTheme(): Theme {
  try { return (localStorage.getItem("perped-theme") as Theme) || "auto"; } catch { return "auto"; }
}

/** Shimmer placeholder. `lines` stacks text-shaped bars; `h` makes one block of that height. */
export function Skeleton({ lines = 0, h, w, className = "", round = false }: { lines?: number; h?: number; w?: string | number; className?: string; round?: boolean }) {
  if (lines > 0) return <div className={`flex flex-col gap-2 ${className}`}>{Array.from({ length: lines }).map((_, i) => <i key={i} className="skel" style={{ height: 12, width: i === lines - 1 ? "55%" : "100%" }} />)}</div>;
  return <i className={`skel ${round ? "rounded-full" : ""} ${className}`} style={{ height: h ?? 16, width: w ?? "100%" }} />;
}

/** A feed/list placeholder: n rows of avatar + two text lines, inside cards. */
export function SkeletonList({ n = 3, card = true }: { n?: number; card?: boolean }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={card ? "card" : ""} style={{ padding: card ? 14 : "6px 0", animationDelay: `${i * 60}ms` }}>
          <div className="flex items-center gap-3">
            <Skeleton round h={36} w={36} />
            <div className="flex-1"><Skeleton h={12} w="40%" /><Skeleton h={10} w="25%" className="mt-2" /></div>
          </div>
          <Skeleton lines={2} className="mt-3" />
        </div>
      ))}
    </div>
  );
}

/** Rank emblem. Compact = just the emblem (next to names); full = emblem + title. */
export function RankChip({ xp, compact = false, size }: { xp?: number | null; compact?: boolean; size?: number }) {
  const r = rankFor(xp ?? 0);
  const px = size ?? (compact ? 18 : 22);
  return (
    <span className={`rank-chip lv${r.level} ${compact ? "compact" : ""}`} title={`${r.title} · ${r.xp} XP`}>
      <img src={`/api/share-bg/rank-${r.level}`} alt="" className="rank-em" style={{ width: px, height: px }} />
      {!compact && <span>{r.title}</span>}
    </span>
  );
}

/** Big emblem for cards and headers. */
export function RankEmblem({ level, size = 72 }: { level: number; size?: number }) {
  return <img src={`/api/share-bg/rank-${level}`} alt="" className={`rank-big lv${level}`} style={{ width: size, height: size }} />;
}
