"use client";


import { tt } from "@/lib/i18n";
import { useState } from "react";
import { BUILDER_FEE_REFERRED_TENTHS_BPS } from "@/lib/config";

const PEOPLE = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const VOLUME = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const money = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * "What would my group earn me?" Members × what each trades a month × the invite fee rate × your share.
 * Pure arithmetic on the published rates; the note under it says it's an estimate.
 */
export function EarningsCalc({ sharePct, title = "What your people could earn you", defaultPeople = 4, defaultVolume = 3 }: { sharePct: number; title?: string; defaultPeople?: number; defaultVolume?: number }) {
  const [pi, setPi] = useState(defaultPeople), [vi, setVi] = useState(defaultVolume);
  const people = PEOPLE[pi], vol = VOLUME[vi];
  const rate = BUILDER_FEE_REFERRED_TENTHS_BPS / 100_000; // 35 tenths of a bp = 0.035%
  const fees = people * vol * rate;
  const mine = fees * (sharePct / 100);
  return (
    <section className="calc">
      <div className="calc-h"><span className="eyebrow">{title}</span><span className="calc-rate">{sharePct}{tt("% of their fees")}</span></div>
      <div className="calc-out"><b className="mono">{money(mine)}</b><span>{tt("a month")}</span></div>
      <div className="calc-sub">{money(mine * 12)}{" "}{tt("a year, every year they keep trading")}</div>
      <label className="calc-row">
        <span>{tt("People who trade with your link")}</span><b className="mono">{people.toLocaleString("en-US")}</b>
        <input type="range" min={0} max={PEOPLE.length - 1} step={1} value={pi} onChange={(e) => setPi(Number(e.target.value))} aria-label={tt("People who trade with your link")} />
      </label>
      <label className="calc-row">
        <span>{tt("Each trades a month")}</span><b className="mono">{money(vol)}</b>
        <input type="range" min={0} max={VOLUME.length - 1} step={1} value={vi} onChange={(e) => setVi(Number(e.target.value))} aria-label={tt("Volume each person trades a month")} />
      </label>
      <p className="calc-note">{money(people * vol)}{" "}{tt("traded a month × the")}{" "}{(rate * 100).toFixed(3)}{tt("% invite fee =")}{" "}{money(fees)}{" "}{tt("in fees, and")}{" "}{sharePct}{tt("% of that is yours. An estimate: real earnings follow what people actually trade, and demo trades don’t pay.")}</p>
    </section>
  );
}
