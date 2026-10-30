"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fmtPct, fmtPrice, fmtUsd, pnlForPosition, timeAgo } from "@/lib/format";
import { Avatar } from "./ui";
import type { ChartMarker } from "./PriceChart";
import type { MarketTrader } from "@/app/api/markets/[coin]/traders/route";

export type Lens = "following" | "top" | "all";

export function useMarketTraders(coin: string) {
  const { data } = useSWR<{ traders: MarketTrader[]; followingAny: boolean }>(`/api/markets/${coin}/traders`, { refreshInterval: 20_000 });
  return { traders: data?.traders ?? [], followingAny: !!data?.followingAny, loaded: !!data };
}

export function pick(traders: MarketTrader[], lens: Lens) {
  return traders.filter((t) => (lens === "following" ? t.following || t.mine : lens === "top" ? t.top : true));
}

export function toMarkers(rows: MarketTrader[]): ChartMarker[] {
  return rows.map((t) => ({ id: String(t.postId), t: new Date(t.openedAt).getTime(), side: t.side, label: `${t.handle} · ${t.side} ${t.leverage}× at ${t.entryPx}`, hot: t.fadeCount >= 3, muted: t.status === "closed", price: t.entryPx, avatarUrl: t.avatarUrl, handle: t.handle, href: `/post/${t.postId}` }));
}

/** Long/short split for Following · Top 10 · Everyone, for this market's open Perped positions. */
export function SentimentRibbon({ traders, followingAny }: { traders: MarketTrader[]; followingAny: boolean }) {
  const open = traders.filter((t) => t.status === "open");
  const split = (rows: MarketTrader[]) => { const l = rows.filter((r) => r.side === "long").length; return { l, n: rows.length, pct: rows.length ? Math.round((l / rows.length) * 100) : null }; };
  const groups: [string, ReturnType<typeof split>][] = [["Following", split(open.filter((t) => t.following))], ["Top 10", split(open.filter((t) => t.top))], ["Everyone", split(open)]];
  if (!open.length) return null;
  return (
    <div className="ribbon">
      {groups.map(([k, g]) => (
        <div key={k} className="rb">
          <div className="flex items-baseline justify-between"><span className="when">{k}</span><span className={`mono text-[12px] font-bold ${g.pct == null ? "muted" : g.pct >= 50 ? "green" : "red"}`}>{g.pct == null ? (k === "Following" && !followingAny ? "follow someone" : "—") : `${g.pct}% long`}</span></div>
          <div className="split mt-1" style={{ height: 5, background: g.pct == null ? "var(--line)" : undefined }}>{g.pct != null && <i style={{ width: `${g.pct}%` }} />}</div>
          <div className="when mt-0.5 text-[10px]">{g.n ? `${g.n} position${g.n === 1 ? "" : "s"}` : ""}</div>
        </div>
      ))}
    </div>
  );
}

/** Live tape of what traders are doing on this market, filtered by lens; the selected row (from a chart pin) is highlighted. */
export function MarketTape({ coin, traders, lens, setLens, followingAny, mid, selected, onSelect, meId }: {
  coin: string; traders: MarketTrader[]; lens: Lens; setLens: (l: Lens) => void; followingAny: boolean; mid: number; selected: string | null; onSelect: (id: string | null) => void; meId?: string | null;
}) {
  const rows = useMemo(() => pick(traders, lens).sort((a, b) => (a.status === b.status ? new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime() : a.status === "open" ? -1 : 1)), [traders, lens]);
  const [showClosed, setShowClosed] = useState(false);
  const shown = rows.filter((r) => showClosed || r.status === "open").slice(0, 25);
  useEffect(() => { if (selected) document.getElementById(`tape-${selected}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [selected]);
  void meId;
  return (
    <section className="tape">
      <div className="flex items-center justify-between">
        <div className="seg">{(["following", "top", "all"] as Lens[]).map((l) => <button key={l} className={`chip ${lens === l ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setLens(l)}>{l === "following" ? "Following" : l === "top" ? "Top 10" : "Everyone"}</button>)}</div>
        <button className="when" onClick={() => setShowClosed((v) => !v)}>{showClosed ? "hide closed" : "show closed"}</button>
      </div>
      {!shown.length && (
        <p className="muted mt-3 text-sm">{lens === "following" ? (followingAny ? `Nobody you follow is in ${coin} right now.` : "Follow a few traders and their trades on this market show up here, and on the chart.") : `No Perped trades on ${coin} yet. Be the first; the pins are yours.`}</p>
      )}
      <div className="mt-2 flex flex-col">
        {shown.map((t) => {
          const mark = t.status === "open" ? mid || t.entryPx : t.exitPx ?? t.entryPx;
          const { pnl, pct } = pnlForPosition(t.side, t.entryPx, mark, t.size);
          const roi = pct * t.leverage; const hot = t.fadeCount >= 3;
          return (
            <div key={t.postId} id={`tape-${t.postId}`} className={`trow ${selected === String(t.postId) ? "sel" : ""} ${t.status === "closed" ? "closed" : ""}`} onClick={() => onSelect(selected === String(t.postId) ? null : String(t.postId))}>
              <Link href={`/u/${t.handle}`} onClick={(e) => e.stopPropagation()}><Avatar handle={t.handle} url={t.avatarUrl} size={30} /></Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px]"><b className="truncate">{t.handle}</b>{t.top && <span className="pill gold">top</span>}{t.following && <span className="pill">following</span>}{t.isDemo && <span className="demo-tag">Demo</span>}{hot && <Link href={`/battle/${t.fadedFromId ?? t.postId}`} onClick={(e) => e.stopPropagation()} className="pill hot">⚔ {t.fadeCount} fading</Link>}</div>
                <div className="mono when text-[12px]"><span className={t.side === "long" ? "green" : "red"}>{t.side} {t.leverage}×</span> · in at {fmtPrice(t.entryPx)}{t.status === "closed" ? ` → ${fmtPrice(t.exitPx)}` : ""} · {fmtUsd(t.notionalUsd, { compact: true })} · {timeAgo(t.status === "closed" && t.closedAt ? t.closedAt : t.openedAt)}</div>
              </div>
              <div className="text-right">
                <div className={`mono text-[15px] font-bold ${roi >= 0 ? "green" : "red"}`}>{fmtPct(roi, 1)}</div>
                <div className={`mono text-[11px] ${pnl >= 0 ? "green" : "red"}`}>{fmtUsd(pnl, { sign: true })}</div>
              </div>
              {selected === String(t.postId) && t.status === "open" && !t.mine && (
                <div className="trow-acts">
                  <Link href={`/trade?copy=${t.postId}`} className="copy">Copy</Link>
                  <Link href={`/trade?fade=${t.postId}`} className="fade">Fade</Link>
                  <Link href={`/post/${t.postId}`} className="chip">Thread</Link>
                  {t.fadedFromId && <Link href={`/battle/${t.postId}`} className="chip">Battle</Link>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
