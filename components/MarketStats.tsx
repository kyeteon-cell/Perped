"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Sheet } from "./Sheet";
import { fmtPct, fmtUsd, fmtPrice } from "@/lib/format";
import { getLevel, type Level } from "@/lib/level";
import type { MarketRow } from "@/lib/hl-info";
import type { BookStats, CoinStats } from "@/lib/market-stats";

export type MarketItem = MarketRow & { oiChange24h?: number | null };
type Kind = "funding" | "depth" | "premium" | "typical";

/** Shared fetch so the page (chart guides) and the tiles use one request. */
export function useCoinStats(coin: string) {
  return useSWR<CoinStats>(`/api/markets/${coin}/stats`, { refreshInterval: 60_000, revalidateOnFocus: false });
}

/** Minutes:seconds until the next hourly Hyperliquid funding payment. */
export function useFundingCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = 3_600_000 - (now % 3_600_000), m = Math.floor(left / 60_000), s = Math.floor((left % 60_000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const pct = (n: number, d = 3) => `${n.toFixed(d)}%`;
const LABELS: Record<Level | "default", Record<Kind, [string, string | null]>> = {
  new: { funding: ["Cost to hold", "Funding"], depth: ["Liquidity", "Depth ±2%"], premium: ["Price vs spot", "Premium"], typical: ["Typical day", null] },
  crypto: { funding: ["Funding", null], depth: ["Depth ±2%", null], premium: ["Premium", null], typical: ["Typical day", null] },
  perps: { funding: ["Funding", null], depth: ["Depth ±2%", null], premium: ["Premium", null], typical: ["Typical day", null] },
  default: { funding: ["Funding", null], depth: ["Depth ±2%", null], premium: ["Premium", null], typical: ["Typical day", null] },
};
const TIP_KEY = "perped:mk-tip";

/** Four tiles under the chart (funding, depth, premium, typical day), a stats strip, and a detail sheet for each. */
export function MarketStats({ coin, m }: { coin: string; m: MarketItem }) {
  const [open, setOpen] = useState<Kind | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [tip, setTip] = useState(false);
  useEffect(() => {
    setLevel(getLevel());
    try { setTip(!localStorage.getItem(TIP_KEY)); } catch {}
  }, []);
  const { data: st } = useCoinStats(coin);
  const { data: bk } = useSWR<BookStats>(`/api/markets/${coin}/book`, { refreshInterval: open === "depth" ? 3_000 : 15_000, revalidateOnFocus: false });
  const L = LABELS[level ?? "default"], beginner = level === "new" || level === "crypto";

  const tap = (k: Kind) => {
    setOpen(k);
    if (tip) { setTip(false); try { localStorage.setItem(TIP_KEY, "1"); } catch {} }
  };
  const d2 = bk?.depth.find((d) => d.pct === 2);
  const bidShare = d2 && d2.bids + d2.asks > 0 ? Math.round((d2.bids / (d2.bids + d2.asks)) * 100) : null;
  const binance = st?.funding.venues.find((v) => v.venue === "Binance") ?? st?.funding.venues[0];
  const premium = st?.premiumPct ?? m.premiumPct;

  const Tile = ({ k, right, value, sub, children }: { k: Kind; right?: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) => (
    <button className="mk-tile" onClick={() => tap(k)} aria-label={`${L[k][0]}: details`}>
      <small><span>{L[k][0]}{beginner && <i className="mk-q" aria-hidden>?</i>}</span>{right && <em>{right}</em>}</small>
      {L[k][1] && <span className="mk-term">{L[k][1]}</span>}
      <div className="v mono">{value}</div>
      {children}
      {sub && <div className="s">{sub}</div>}
    </button>
  );

  return (
    <>
      {tip && <div className="mk-tip">Tap any tile to see what it means</div>}
      <div className="mk-tiles">
        <Tile k="funding" right={m.funding8h >= 0 ? "longs pay" : "shorts pay"} value={<>{pct(m.funding8h)} <span className="mk-unit">/ 8h</span></>}
          sub={<>{(m.funding8h * 3 * 365).toFixed(1)}% a year{binance ? ` · ${binance.venue} ${pct(binance.rate8h)}` : ""}</>} />
        <Tile k="depth" right={bk ? `spread ${pct(bk.spreadPct)}` : undefined} value={d2 ? fmtUsd(d2.bids + d2.asks, { compact: true }) : "…"}
          sub={bidShare != null ? `Bids ${bidShare}% · asks ${100 - bidShare}%` : "Reading the order book"}>
          <div className="mk-bar"><b style={{ width: `${bidShare ?? 50}%` }} /><u style={{ width: `${100 - (bidShare ?? 50)}%` }} /></div>
        </Tile>
        <Tile k="premium" right="vs index" value={fmtPct(premium, 3)} sub={Math.abs(premium) < 0.01 ? "In line with spot" : premium > 0 ? "Perp trading above spot" : "Perp trading below spot"} />
        <Tile k="typical" value={st ? `${st.typical.rangePct.toFixed(1)}%` : "…"} right="low to high"
          sub={st ? `At ${st.liq.lev}× a ${st.liq.distPct.toFixed(1)}% move liquidates you` : "Reading 30 days of candles"} />
      </div>
      <div className="mk-strip">
        <div><small>Open interest</small><b className="mono">{fmtUsd(m.openInterest, { compact: true })}</b></div>
        <div><small>OI 24h</small><b className="mono">{m.oiChange24h == null ? <span className="muted" style={{ fontSize: 12 }}>tracking</span> : fmtPct(m.oiChange24h, 1)}</b></div>
        <div><small>Volume 24h</small><b className="mono">{fmtUsd(m.volume24h, { compact: true })}</b></div>
      </div>

      {open === "funding" && (
        <Sheet label={`${coin} funding`} onClose={() => setOpen(null)}>
          <FundingSheet coin={coin} m={m} st={st} beginner={beginner} />
        </Sheet>
      )}
      {open === "depth" && (
        <Sheet label={`${coin} order book`} onClose={() => setOpen(null)}>
          <DepthSheet coin={coin} bk={bk} beginner={beginner} />
        </Sheet>
      )}
      {open === "premium" && (
        <Sheet label={`${coin} premium`} onClose={() => setOpen(null)}>
          <div className="mk-sheet">
            <div className="h">{coin} {beginner ? "price vs spot" : "premium"}</div>
            <div className="sub">How far the perp price is from the spot index Hyperliquid tracks.</div>
            <div className="mk-big"><div><small>Perp (mark)</small><b className="mono">{fmtPrice(m.mark)}</b></div><div><small>Spot index</small><b className="mono">{fmtPrice(st?.oracle ?? m.oracle)}</b></div><div><small>Premium</small><b className="mono">{fmtPct(premium, 3)}</b></div></div>
            <Means>
              {premium > 0.05 ? "Traders are paying above spot to be long. That usually comes with higher funding, and it tends to close back toward zero." : premium < -0.05 ? "The perp is trading below spot: sellers are pushing harder than the underlying market. Shorts are crowded." : "The perp is tracking spot closely. Nothing unusual here."}
              {" "}Funding is built from this gap, so a big premium today means longs (or shorts, if negative) will pay more soon.
            </Means>
          </div>
        </Sheet>
      )}
      {open === "typical" && (
        <Sheet label={`${coin} typical day`} onClose={() => setOpen(null)}>
          <div className="mk-sheet">
            <div className="h">{coin} on a typical day</div>
            <div className="sub">Median of the last {st?.typical.days ?? 30} complete days of Hyperliquid prices.</div>
            {st && <>
              <div className="mk-big"><div><small>Low to high</small><b className="mono">{st.typical.rangePct.toFixed(1)}%</b></div><div><small>Up from open</small><b className="mono">{st.typical.upPct.toFixed(1)}%</b></div><div><small>Down from open</small><b className="mono">{st.typical.downPct.toFixed(1)}%</b></div></div>
              <div className="mk-rowl"><span>Today's open</span><b className="mono">{fmtPrice(st.typical.open)}</b></div>
              <div className="mk-rowl"><span>Typical high from there</span><b className="mono">{fmtPrice(st.typical.high)}</b></div>
              <div className="mk-rowl"><span>Typical low from there</span><b className="mono">{fmtPrice(st.typical.low)}</b></div>
              <div className="mk-eyebrow">Liquidation vs a normal day</div>
              {[2, 5, 10, 20, st.maxLev].filter((x, i, a) => x <= st.maxLev && a.indexOf(x) === i).map((lev) => {
                const dist = Math.max(0, (1 / lev - 1 / (2 * st.maxLev)) * 100), days = st.typical.downPct > 0 ? dist / st.typical.downPct : 0;
                return <div key={lev} className="mk-rowl"><span>{lev}×</span><b className="mono">{dist.toFixed(1)}% away{days > 0 && <span className="muted" style={{ fontWeight: 500 }}> · {days < 1 ? "inside" : `${days.toFixed(1)}×`} a normal day</span>}</b></div>;
              })}
              <Means>
                {`If a normal day already moves ${coin} further than your liquidation distance, you can be wiped out by noise alone. Pick leverage where liquidation sits well outside a typical day, or use a stop loss.`}
              </Means>
            </>}
          </div>
        </Sheet>
      )}
    </>
  );
}

function Means({ children }: { children: React.ReactNode }) {
  return <div className="mk-means"><div className="mk-eyebrow" style={{ marginTop: 0 }}>What this means for you</div><p>{children}</p></div>;
}

function FundingSheet({ coin, m, st, beginner }: { coin: string; m: MarketItem; st?: CoinStats; beginner: boolean }) {
  const cd = useFundingCountdown();
  const h = st?.funding.history ?? [];
  const max = Math.max(0.0001, ...h.map((x) => Math.abs(x.rate8h)));
  const others = st?.funding.venues ?? [];
  const avg = others.length ? others.reduce((a, v) => a + v.rate8h, 0) / others.length : null;
  const diff = avg == null ? 0 : m.funding8h - avg;
  return (
    <div className="mk-sheet">
      <div className="h">{coin} {beginner ? "cost to hold" : "funding"}</div>
      <div className="sub">Paid every hour on Hyperliquid. Positive means longs pay shorts; negative means shorts pay longs.</div>
      <div className="mk-big"><div><small>Per 8h</small><b className="mono">{pct(m.funding8h)}</b></div><div><small>Per year</small><b className="mono">{(m.funding8h * 3 * 365).toFixed(1)}%</b></div><div><small>Next payment</small><b className="mono">{cd}</b></div></div>
      {h.length > 0 && <>
        <svg className="mk-hist" viewBox={`0 0 ${h.length * 8} 64`} preserveAspectRatio="none" aria-label="Funding, last 7 days">
          <line x1="0" x2={h.length * 8} y1="40" y2="40" />
          {h.map((x, i) => { const hgt = (Math.abs(x.rate8h) / max) * (x.rate8h >= 0 ? 38 : 22); return <rect key={x.t} x={i * 8 + 1} y={x.rate8h >= 0 ? 40 - hgt : 40} width="6" height={Math.max(0.5, hgt)} rx="1" className={x.rate8h >= 0 ? "pos" : "neg"} />; })}
        </svg>
        <div className="sub">Last 7 days{st?.funding.peak ? ` · peak ${pct(st.funding.peak.rate8h)} / 8h on ${new Date(st.funding.peak.t).toLocaleDateString(undefined, { weekday: "long" })}` : ""}</div>
      </>}
      {others.length > 0 && <>
        <div className="mk-eyebrow">Same coin, other exchanges · per 8h</div>
        <div className="mk-venue"><b>Hyperliquid</b><span className="mono">{pct(m.funding8h)}</span><span className="tag">here</span></div>
        {others.map((v) => <div key={v.venue} className="mk-venue"><span>{v.venue}</span><span className="mono">{pct(v.rate8h)}</span><span className="tag mono">{(v.rate8h - m.funding8h >= 0 ? "+" : "") + (v.rate8h - m.funding8h).toFixed(3)}</span></div>)}
      </>}
      <Means>
        {m.funding8h >= 0.03 ? `Longs are paying a lot to stay in (${(m.funding8h * 3 * 365).toFixed(0)}% a year). Crowded longs are the classic setup for a fade, and holding a long here costs you every hour.` : m.funding8h < 0 ? "Shorts are paying longs. Shorts are crowded, so a squeeze up is more likely, and holding a long here actually earns you funding." : "Funding is at its normal resting rate. Holding a position costs very little; nobody is unusually crowded."}
        {avg != null && Math.abs(diff) >= 0.005 ? (diff > 0 ? " Funding is higher here than on other exchanges, so longs are more crowded on Hyperliquid." : " Funding is lower here than on other exchanges, so shorts lean harder on Hyperliquid.") : avg != null ? " It's in line with other exchanges." : ""}
      </Means>
    </div>
  );
}

function DepthSheet({ coin, bk, beginner }: { coin: string; bk?: BookStats; beginner: boolean }) {
  if (!bk) return <div className="mk-sheet"><div className="h">{coin} order book</div><div className="sub">Reading the order book…</div></div>;
  const lo = bk.mid * 0.98, hi = bk.mid * 1.02;
  const bids = bk.levels.bids.filter((l) => l.px >= lo), asks = bk.levels.asks.filter((l) => l.px <= hi);
  const max = Math.max(1, ...bids.map((l) => l.px * l.sz), ...asks.map((l) => l.px * l.sz));
  const d05 = bk.depth.find((d) => d.pct === 0.5)!, d2 = bk.depth.find((d) => d.pct === 2)!;
  const s = (x: number | null) => (x == null ? "more than shown" : pct(x));
  return (
    <div className="mk-sheet">
      <div className="h">{coin} {beginner ? "liquidity" : "order book"}</div>
      <div className="sub">Live from Hyperliquid, refreshed every few seconds.</div>
      <div className="mk-depth">
        {[...bids].reverse().map((l) => <i key={`b${l.px}`} className="b" style={{ height: `${Math.max(4, ((l.px * l.sz) / max) * 100)}%` }} />)}
        <i className="mid" />
        {asks.map((l) => <i key={`a${l.px}`} className="a" style={{ height: `${Math.max(4, ((l.px * l.sz) / max) * 100)}%` }} />)}
      </div>
      <div className="mk-axis mono"><span>{fmtPrice(lo)}</span><span>{fmtPrice(bk.mid)}</span><span>{fmtPrice(hi)}</span></div>
      <div className="mk-rowl"><span>Spread</span><b className="mono">{fmtPrice(bk.spread)} · {pct(bk.spreadPct)}</b></div>
      <div className="mk-rowl"><span>Within 0.5%</span><b className="mono">{fmtUsd(d05.bids, { compact: true })} bids · {fmtUsd(d05.asks, { compact: true })} asks</b></div>
      <div className="mk-rowl"><span>Within 2%</span><b className="mono">{d2.exact ? "" : "≈ "}{fmtUsd(d2.bids, { compact: true })} bids · {fmtUsd(d2.asks, { compact: true })} asks</b></div>
      <div className="mk-eyebrow">Cost of a market order (vs mid)</div>
      <div className="mk-slip">{bk.slip.map((x) => <div key={x.usd}><small>{fmtUsd(x.usd, { compact: true })}</small><b className="mono">{s(x.buy)}</b><span className="muted mono">sell {s(x.sell)}</span></div>)}</div>
      <Means>
        {`The order book is everyone waiting to buy (bids) or sell (asks). More money near the price means your order fills closer to what you see. ${(bk.slip[1]?.buy ?? 1) < 0.05 ? `${coin} is deep: a $10k market order barely moves it.` : `${coin} is thin: bigger orders fill noticeably worse, so consider a smaller size or a limit order.`} ${d2.bids > d2.asks * 1.3 ? "There's more waiting to buy than sell right now." : d2.asks > d2.bids * 1.3 ? "There's more waiting to sell than buy right now." : "Buyers and sellers are fairly balanced."}`}
      </Means>
    </div>
  );
}
