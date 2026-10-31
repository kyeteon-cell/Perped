"use client";

import { Glyph } from "./Glyph";
import Link from "next/link";
import { useState } from "react";
import { fmtPct } from "@/lib/format";
import { Avatar } from "./ui";
import { Sheet } from "./Sheet";

export type TradeBattle = { battleId: number; faderPostId: number; vs?: string; won: boolean | null; myRoi: number; theirRoi: number; reason?: string | null };

/** Everyone this trade fought, from a post's meta. Wins first. */
export function battlesOf(meta: unknown): TradeBattle[] {
  const m = (meta ?? {}) as { battles?: TradeBattle[]; battle?: TradeBattle };
  return m.battles?.length ? m.battles : m.battle ? [m.battle] : [];
}

/**
 * "Beat mooncat, wickhunter +4": the opponents a trade beat, as many names as fit, with a sheet listing every
 * battle on the trade. Falls back to "Perped by …" / "Drew with …" when there were no wins.
 */
export function BattleSummary({ battles, size = "md" }: { battles: TradeBattle[]; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  if (!battles.length) return null;
  const wins = battles.filter((b) => b.won === true), losses = battles.filter((b) => b.won === false), draws = battles.filter((b) => b.won === null);
  const shown = wins.length ? wins : losses.length ? losses : draws;
  const tone = wins.length ? "win" : losses.length ? "loss" : "draw";
  const verb = wins.length ? "Beat" : losses.length ? "Perped by" : "Drew with";
  const names = shown.map((b) => b.vs ?? "?");
  const maxNames = size === "sm" ? 1 : 2;
  const extra = names.length - maxNames;
  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <span onClick={stop} className="bsum-wrap">
      <button type="button" className={`bsum ${tone} ${size}`} onClick={(e) => { stop(e); setOpen(true); }}>
        <span className="bsum-stack">{shown.slice(0, 3).map((b, i) => <span key={i} className="bsum-av"><Avatar handle={b.vs ?? "?"} size={size === "sm" ? 16 : 20} link={false} /></span>)}</span>
        <span className="bsum-text"><Glyph n="bolt" /> {verb} {names.slice(0, maxNames).join(", ")}{extra > 0 ? ` +${extra}` : ""}</span>
        {battles.length > 1 && <span className="bsum-rec">{wins.length}W {losses.length}L{draws.length ? ` ${draws.length}D` : ""}</span>}
      </button>
      {open && (
        <span onClick={(e) => e.stopPropagation()}>
          <Sheet label="Fades on this trade" onClose={() => setOpen(false)}>
            <div className="px-5 pb-6">
              <div className="text-lg font-extrabold" data-sheet-handle>Fades on this trade</div>
              <div className="when">{wins.length} won · {losses.length} lost{draws.length ? ` · ${draws.length} drawn` : ""}</div>
              <div className="mt-3 flex flex-col">
                {battles.map((b) => (
                  <Link key={b.battleId} href={`/battle/${b.faderPostId}`} className="lb" onClick={() => setOpen(false)}>
                    <Avatar handle={b.vs ?? "?"} size={36} link={false} />
                    <div className="min-w-0 flex-1"><div className="name">{b.vs}</div><div className="mono when">you {fmtPct(b.myRoi, 1)} · them {fmtPct(b.theirRoi, 1)}{b.reason === "liquidation" ? " · liquidation" : ""}</div></div>
                    <span className={`lbl ${b.won === true ? "long" : b.won === false ? "short" : ""}`} style={{ padding: "3px 10px", fontSize: 11 }}>{b.won === true ? "Won" : b.won === false ? "Lost" : "Draw"}</span>
                  </Link>
                ))}
              </div>
            </div>
          </Sheet>
        </span>
      )}
    </span>
  );
}
