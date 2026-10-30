"use client";

import { useMids } from "@/lib/hooks/useMids";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { CoinMark, ticker } from "./ui";
import { fmtPct, fmtPrice } from "@/lib/format";

const SHOW = ["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE", "SUI", "LINK", "AVAX", "ARB"];

/** Live price strip across the top of every page, fed by the Hyperliquid WebSocket. */
export function Ticker() {
  const { mids } = useMids();
  const { markets } = useMarkets();
  const rows = SHOW.map((c) => {
    const m = markets.find((x) => x.name === c);
    const px = mids[c] ?? m?.mid ?? 0;
    return { c, px, ch: m?.change24h ?? 0 };
  }).filter((r) => r.px > 0);
  if (!rows.length) return <div className="ticker" aria-hidden />;
  const items = [...rows, ...rows]; // duplicated for a seamless loop
  return (
    <div className="ticker" aria-label="Live prices">
      <div className="tk-track">
        {items.map((r, i) => (
          <span key={`${r.c}-${i}`} className="tk">
            <CoinMark coin={r.c} size="xs" />
            <span>{ticker(r.c)}</span>
            <span className="mono" style={{ fontWeight: 500 }}>{fmtPxShort(r.px)}</span>
            <span className={`mono ${r.ch >= 0 ? "green" : "red"}`}>{fmtPct(r.ch, 1)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function fmtPxShort(v: number) {
  return fmtPrice(v);
}
