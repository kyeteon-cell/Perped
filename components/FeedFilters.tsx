"use client";

import { useEffect, useState } from "react";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { Sheet } from "./Sheet";
import { CoinMark, ticker } from "./ui";
import { useLive } from "@/lib/hooks/useLive";

export type FeedFilter = {
  coins: string[];
  side: "" | "long" | "short";
  margin: "" | "lt100" | "100-500" | "500-2000" | "gt2000";
  lev: "" | "le5" | "6-20" | "ge21";
  kinds: string[]; // empty = all
  money: "" | "real" | "demo";
  verified: boolean;
  nobots: boolean;
  hot: boolean;
};
export const EMPTY_FILTER: FeedFilter = { coins: [], side: "", margin: "", lev: "", kinds: [], money: "", verified: false, nobots: false, hot: false };

/** Turn the filter into feed query params. */
export function filterQuery(f: FeedFilter): string {
  const p = new URLSearchParams();
  if (f.coins.length) p.set("coins", f.coins.join(","));
  if (f.side) p.set("side", f.side);
  const m: Record<string, [number, number]> = { lt100: [0, 100], "100-500": [100, 500], "500-2000": [500, 2000], gt2000: [2000, 0] };
  if (f.margin) { const [a, b] = m[f.margin]; if (a) p.set("minMargin", String(a)); if (b) p.set("maxMargin", String(b)); }
  const l: Record<string, [number, number]> = { le5: [0, 5], "6-20": [6, 20], ge21: [21, 0] };
  if (f.lev) { const [a, b] = l[f.lev]; if (a) p.set("minLev", String(a)); if (b) p.set("maxLev", String(b)); }
  if (f.kinds.length) p.set("kinds", f.kinds.join(","));
  if (f.money) p.set("money", f.money);
  if (f.verified) p.set("verified", "1");
  if (f.nobots) p.set("nobots", "1");
  if (f.hot) p.set("hot", "1");
  const s = p.toString();
  return s ? `&${s}` : "";
}

export function activeCount(f: FeedFilter) {
  return (f.coins.length ? 1 : 0) + (f.side ? 1 : 0) + (f.margin ? 1 : 0) + (f.lev ? 1 : 0) + (f.kinds.length ? 1 : 0) + (f.money ? 1 : 0) + (f.verified ? 1 : 0) + (f.nobots ? 1 : 0) + (f.hot ? 1 : 0);
}

/** One-line summary for the chip row, e.g. "BTC, SOL · long · 20×+". */
export function filterSummary(f: FeedFilter) {
  const parts: string[] = [];
  if (f.coins.length) parts.push(f.coins.length > 3 ? `${f.coins.length} coins` : f.coins.map((c) => ticker(c)).join(", "));
  if (f.side) parts.push(f.side);
  if (f.margin) parts.push({ lt100: "under $100", "100-500": "$100–500", "500-2000": "$500–2k", gt2000: "$2k+" }[f.margin]);
  if (f.lev) parts.push({ le5: "≤5×", "6-20": "6–20×", ge21: "21×+" }[f.lev]);
  if (f.kinds.length) parts.push(f.kinds.join("/"));
  if (f.money) parts.push(f.money);
  if (f.verified) parts.push("verified");
  if (f.nobots) parts.push("no bots");
  if (f.hot) parts.push("contested");
  return parts.join(" · ");
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="ff-row"><div className="eyebrow mb-1.5" style={{ color: "var(--muted)" }}>{label}</div><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}
function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={`chip ${on ? "on" : ""}`} style={{ padding: "7px 11px", fontSize: 12 }} onClick={onClick}>{children}</button>;
}

/** The Home filter sheet. Changes apply live; Reset clears everything. */
export function FeedFilters({ value, onChange, onClose }: { value: FeedFilter; onChange: (f: FeedFilter) => void; onClose: () => void }) {
  const { markets } = useMarkets();
  const [f, setF] = useState<FeedFilter>(value);
  const { allowed: liveOk, gate } = useLive();
  const [q, setQ] = useState("");
  useEffect(() => { onChange(f); }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = [...markets].sort((a, b) => Number(b.volume24h ?? 0) - Number(a.volume24h ?? 0));
  const shown = (q ? top.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())) : top).slice(0, q ? 20 : 12);
  const toggleCoin = (c: string) => setF((x) => ({ ...x, coins: x.coins.includes(c) ? x.coins.filter((y) => y !== c) : [...x.coins, c] }));
  const toggleKind = (k: string) => setF((x) => ({ ...x, kinds: x.kinds.includes(k) ? x.kinds.filter((y) => y !== k) : [...x.kinds, k] }));
  const n = activeCount(f);
  return (
    <Sheet label="Filter the feed" onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="flex items-center justify-between" data-sheet-handle>
          <div className="text-lg font-extrabold">Filter the feed</div>
          <div className="flex items-center gap-2">
            {n > 0 && <button className="chip" onClick={() => setF(EMPTY_FILTER)}>Reset</button>}
            <button className="chip on" onClick={onClose}>Done{n ? ` · ${n}` : ""}</button>
          </div>
        </div>

        <Row label="Coins">
          <input className="field" style={{ padding: "8px 12px", fontSize: 13 }} placeholder="Search a market" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-1.5 w-full">
            {f.coins.filter((c) => !shown.some((m) => m.name === c)).map((c) => <Opt key={c} on onClick={() => toggleCoin(c)}><CoinMark coin={c} size="xs" />{ticker(c)}</Opt>)}
            {shown.map((m) => <Opt key={m.name} on={f.coins.includes(m.name)} onClick={() => toggleCoin(m.name)}><CoinMark coin={m.name} size="xs" />{ticker(m.name)}</Opt>)}
          </div>
        </Row>

        <Row label="Side">
          {([["", "Any"], ["long", "Long"], ["short", "Short"]] as const).map(([v, l]) => <Opt key={v} on={f.side === v} onClick={() => setF({ ...f, side: v })}>{l}</Opt>)}
        </Row>
        <Row label="Margin put up">
          {([["", "Any"], ["lt100", "Under $100"], ["100-500", "$100–500"], ["500-2000", "$500–2k"], ["gt2000", "$2k+"]] as const).map(([v, l]) => <Opt key={v} on={f.margin === v} onClick={() => setF({ ...f, margin: v })}>{l}</Opt>)}
        </Row>
        <Row label="Leverage">
          {([["", "Any"], ["le5", "Up to 5×"], ["6-20", "6–20×"], ["ge21", "21× and up"]] as const).map(([v, l]) => <Opt key={v} on={f.lev === v} onClick={() => setF({ ...f, lev: v })}>{l}</Opt>)}
        </Row>
        <Row label="Post types (none selected = all)">
          {([["trade", "Trades"], ["call", "Calls"], ["poll", "Polls"], ["text", "Posts"], ["system", "Results & alerts"]] as const).map(([v, l]) => <Opt key={v} on={f.kinds.includes(v)} onClick={() => toggleKind(v)}>{l}</Opt>)}
        </Row>
        <Row label="Money">
          {([["", "All"], ["real", "Real money"], ["demo", "Demo"]] as const).map(([v, l]) => v === "real" && !liveOk
            ? <button key={v} type="button" className="chip live-off" style={{ padding: "7px 11px", fontSize: 12 }} onClick={gate(() => null)}>{l}<span className="soon-pill">Soon</span></button>
            : <Opt key={v} on={f.money === v} onClick={() => setF({ ...f, money: v })}>{l}</Opt>)}
        </Row>
        <Row label="Traders">
          <Opt on={f.verified} onClick={() => setF({ ...f, verified: !f.verified })}>Verified only</Opt>
          <Opt on={f.nobots} onClick={() => setF({ ...f, nobots: !f.nobots })}>Hide house traders</Opt>
          <Opt on={f.hot} onClick={() => setF({ ...f, hot: !f.hot })}>Contested (3+ copies or fades)</Opt>
        </Row>
        <p className="faint mt-3 text-[11px]">Filters stick until you reset them. Side, margin and leverage apply to trades; calls and posts for your chosen coins still show unless you limit post types.</p>
      </div>
    </Sheet>
  );
}
