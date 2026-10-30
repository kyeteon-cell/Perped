"use client";

import { useState } from "react";
import { RANKS, rankFor, XP_REASON_LABEL } from "@/lib/rank";
import { RankEmblem } from "./ui";
import { timeAgo } from "@/lib/format";

/** Rank, XP progress to the next title, battle record, and how the last few points were earned. */
export function RankCard({ xp, won, lost, recent }: { xp: number; won: number; lost: number; recent: { delta: number; reason: string; ref: string | null; createdAt: string }[] }) {
  const r = rankFor(xp);
  const [open, setOpen] = useState(false);
  return (
    <section className="block">
      <div className="flex items-center justify-between"><span className="eyebrow">Rank</span><button className="when" onClick={() => setOpen((v) => !v)}>{open ? "hide ladder" : "see the ladder"}</button></div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <RankEmblem level={r.level} size={64} />
          <div>
          <div className="text-[22px] font-extrabold tracking-tight">{r.title}</div>
          <div className="mono when mt-1">{r.xp.toLocaleString()} XP{r.next ? ` · ${r.toNext.toLocaleString()} to ${r.next.title}` : " · top of the ladder"}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-[20px] font-bold"><span className="green">{won}</span><span className="muted"> – </span><span className="red">{lost}</span></div>
          <div className="when">battles</div>
        </div>
      </div>
      <div className="xpbar mt-3"><i className={`lv${r.level}`} style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>
      {open && (
        <div className="mt-3 flex flex-col gap-1">
          {RANKS.map((x) => (
            <div key={x.level} className={`flex items-center justify-between text-[13px] ${x.level === r.level ? "font-bold" : x.level < r.level ? "muted" : "faint"}`}>
              <span className="flex items-center gap-2"><RankEmblem level={x.level} size={28} />{x.title}</span><span className="mono">{x.min.toLocaleString()} XP</span>
            </div>
          ))}
          <p className="faint mt-2 text-[11px]">Battles: win +120 (+60 for a 20%+ margin, +80 for beating a higher rank), loss +25, draw +50. Duels +150 / +30. Calls +15 / +5. Closed trades +10 / +3. Liquidations earn nothing.</p>
        </div>
      )}
      {recent.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {recent.slice(0, 5).map((e, i) => (
            <div key={i} className="flex items-center justify-between text-[12px]"><span className="muted">{XP_REASON_LABEL[e.reason] ?? e.reason} · {timeAgo(e.createdAt)} ago</span><span className={`mono font-bold ${e.delta > 0 ? "green" : "muted"}`}>+{e.delta}</span></div>
          ))}
        </div>
      )}
    </section>
  );
}
