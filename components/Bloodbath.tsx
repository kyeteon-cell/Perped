"use client";

import Link from "next/link";
import { useState } from "react";
import type { ArenaBattle, ArenaRes } from "@/app/api/arena/route";
import type { FeedRow } from "@/lib/feed";
import { fmtPct, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";
import { healthOf, type Fighter } from "./BattleArena";
import { QuickTrade, legItem } from "./QuickTrade";
import { Avatar, CoinMark, ticker } from "./ui";

type Mini = ArenaBattle["fader"];
type Leg = ArenaBattle["faderLeg"];
const legOf = (b: ArenaBattle, u: Mini): Leg => (u.id === b.fader.id ? b.faderLeg : b.targetLeg);
const fighter = (u: Mini, l: Leg, roi: number): Fighter => ({ handle: u.handle, avatarUrl: u.avatarUrl, side: l.side, lev: l.leverage, entry: l.entryPx, roi });

/** A health bar for the Pit: same chrome bar as the battle page, bleeding under 40%. */
function Bar({ f, live, right }: { f: Fighter; live: number; right?: boolean }) {
  const h = healthOf(f, live), w = `${Math.max(3, h * 100)}%`, bleed = h < 0.4;
  return (
    <div className={`ar-hpbox ${right ? "r" : ""}`}>
      <div className="ar-hphead"><span>Margin/SL health</span><b style={{ color: bleed ? "var(--red)" : f.side === "long" ? "var(--green)" : "var(--red)" }}>{Math.round(h * 100)}%</b></div>
      <div className={`ar-hpbar ${bleed ? "bleed" : ""}`}>
        <div className="ar-hptrack"><i className={f.side} style={{ width: w }} /></div>
        {bleed && <div className="ar-drips" style={{ width: w }} aria-hidden="true"><b /><b /><b /></div>}
      </div>
    </div>
  );
}

/** Finish them (back the winner) / Save them (back the loser): one-tap, size-only, same leverage. */
export function FinishSave({ b, winner, loser }: { b: ArenaBattle; winner: Mini; loser: Mini }) {
  const { authenticated, login } = useSession();
  const [open, setOpen] = useState<null | { item: FeedRow; title: string }>(null);
  const pick = (u: Mini, title: string) => {
    if (!authenticated) return login();
    const l = legOf(b, u);
    setOpen({ item: legItem({ id: l.postId, coin: b.coin, side: l.side, leverage: l.leverage }, { handle: u.handle, avatarUrl: u.avatarUrl }), title });
  };
  return (
    <>
      <div className="bb-acts">
        <button className="bb-finish" onClick={() => pick(winner, "🗡 Finish them · back")}>🗡 Finish them<small>back {winner.handle}</small></button>
        <button className="bb-save" onClick={() => pick(loser, "🛟 Save them · back")}>🛟 Save them<small>back {loser.handle}</small></button>
      </div>
      {open && <QuickTrade item={open.item} mode="copy" lock title={open.title} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Revenge / run it back: quick-fade the opponent's newest open trade; if they have none, make them your nemesis so you get pinged. */
export function RevengeButton({ handle, label = "🩸 Revenge", className = "bb-revenge" }: { handle: string; label?: string; className?: string }) {
  const { authenticated, login, authedFetch } = useSession();
  const [item, setItem] = useState<FeedRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!authenticated) return login();
    setBusy(true);
    const r = await fetch(`/api/posts?handle=${encodeURIComponent(handle)}&kind=trade&status=open&limit=10`).then((x) => x.json()).catch(() => null) as { posts?: FeedRow[] } | null;
    const open = (r?.posts ?? []).filter((x) => x.post.status === "open").sort((a, b) => +new Date(b.post.createdAt) - +new Date(a.post.createdAt))[0];
    if (open) setItem(open);
    else {
      await authedFetch("/api/rivalries", { method: "POST", body: JSON.stringify({ handle, action: "call" }) }).catch(() => null);
      setMsg(`${handle} has no open trade. They're your nemesis now: you'll get a ping the moment they open one.`);
    }
    setBusy(false);
  };
  return (
    <>
      <button className={className} onClick={go} disabled={busy}>{busy ? "Finding their trade…" : label}</button>
      {msg && <p className="when mt-1.5 text-[12px]">{msg}</p>}
      {item && <QuickTrade item={item} mode="fade" onClose={() => setItem(null)} />}
    </>
  );
}

/** The Pit: the most one-sided live battle, shown big. */
export function BloodPit({ b, mid, winner, loser, worst, minLiq }: { b: ArenaBattle; mid: number; winner: Mini; loser: Mini; worst: number; minLiq: number }) {
  const wl = legOf(b, winner), ll = legOf(b, loser);
  const roiOf = (l: Leg) => (mid && l.entryPx ? ((l.side === "long" ? mid - l.entryPx : l.entryPx - mid) / l.entryPx) * 100 * l.leverage : 0);
  const fw = fighter(winner, wl, roiOf(wl)), fl = fighter(loser, ll, roiOf(ll));
  return (
    <div className="bb-pit">
      <div className="bb-pit-top"><span className="bb-pit-tag">🩸 The Pit</span><span className="when"><CoinMark coin={b.coin} size="xs" /> {ticker(b.coin)} · {timeAgo(b.createdAt)}</span></div>
      <Link href={`/battle/${b.faderPostId}`} className="bb-pit-body">
        <div className="bb-f win">
          <span className="bb-av"><Avatar handle={winner.handle} url={winner.avatarUrl} size={56} link={false} /><em>👑</em></span>
          <b className="truncate">{winner.handle}</b>
          <span className={`mono bb-roi ${fw.roi >= 0 ? "green" : "red"}`}>{fmtPct(fw.roi, 1)}</span>
          <span className={`lbl ${wl.side}`}><i />{wl.side === "long" ? "Long" : "Short"} {wl.leverage}×</span>
        </div>
        <div className="bb-vs">VS{minLiq < 50 && <small>liq in {minLiq.toFixed(1)}%</small>}</div>
        <div className="bb-f lose">
          <span className="bb-av crack"><Avatar handle={loser.handle} url={loser.avatarUrl} size={56} link={false} /></span>
          <b className="truncate">{loser.handle}</b>
          <span className={`mono bb-roi ${worst >= 0 ? "green" : "red"}`}>{fmtPct(worst, 1)}</span>
          <span className={`lbl ${ll.side}`}><i />{ll.side === "long" ? "Long" : "Short"} {ll.leverage}×</span>
        </div>
      </Link>
      <div className="ar-hp mt-3"><Bar f={fw} live={mid} /><Bar f={fl} live={mid} right /></div>
      <FinishSave b={b} winner={winner} loser={loser} />
    </div>
  );
}

/** Kill feed: liquidations as they happen. */
export function KillFeed({ kills }: { kills: ArenaBattle[] }) {
  if (!kills.length) return null;
  return (
    <div className="bb-kills">
      <div className="eyebrow">Kill feed</div>
      {kills.slice(0, 6).map((b) => {
        const w = b.winnerId === b.fader.id ? b.fader : b.target, l = w.id === b.fader.id ? b.target : b.fader;
        const ll = legOf(b, l);
        return (
          <Link key={b.id} href={`/battle/${b.faderPostId}`} className="bb-kill">
            <span>💀</span><b>{w.handle}</b><span className="muted">liquidated</span><b>{l.handle}</b>
            <span className="mono muted">{ticker(b.coin)} {ll.leverage}×</span>
            <span className="when ml-auto">{timeAgo(b.settledAt ?? b.createdAt)}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** This week's body count. */
export function BodyCount({ board }: { board: ArenaRes["board"] }) {
  if (!board || (!board.butchers.length && !board.rekt.length)) return null;
  const col = (title: string, rows: ArenaRes["board"]["butchers"], unit: string) => (
    <div className="bb-board-col">
      <div className="eyebrow">{title}</div>
      {rows.map((r, i) => (
        <Link key={r.user.id} href={`/u/${r.user.handle}`} className="bb-board-row">
          <span className="mono when">{i + 1}</span><Avatar handle={r.user.handle} url={r.user.avatarUrl} size={24} link={false} /><span className="truncate text-[13px] font-bold">{r.user.handle}</span><span className="mono ml-auto text-[12px]">{r.n} {unit}</span>
        </Link>
      ))}
    </div>
  );
  return (
    <div className="bb-board">
      {col("🗡 Butcher · this week", board.butchers, "perped")}
      {col("🪦 Most rekt", board.rekt, "lost")}
    </div>
  );
}
