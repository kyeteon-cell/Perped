"use client";

import { Glyph } from "@/components/Glyph";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { fmtPct, fmtUsd, pnlForPosition, timeAgo } from "@/lib/format";
import { Avatar, CoinMark, RankChip, RankEmblem, SkeletonList, ticker } from "@/components/ui";
import { ChallengeSheet } from "@/components/ChallengeSheet";
import { Sheet } from "@/components/Sheet";
import { rankFor } from "@/lib/rank";
import type { ArenaBattle, ArenaRes } from "@/app/api/arena/route";
import { FollowButton, useFollowing } from "@/components/FollowButton";
import { isFightNight } from "@/lib/fightnight";
import { Tug } from "@/components/Tug";
import { BodyCount, FinishSave, KillFeed } from "@/components/Bloodbath";
import type { ReactNode } from "react";

type Leg = ArenaBattle["faderLeg"];
const liqPx = (l: Leg) => (l.leverage > 1 ? (l.side === "long" ? l.entryPx * (1 - 1 / l.leverage) : l.entryPx * (1 + 1 / l.leverage)) : null);
const liqDist = (l: Leg, mid: number) => { const q = liqPx(l); return q && mid ? Math.abs((mid - q) / mid) * 100 : 100; };
type Heat = "all" | "nemesis" | "high" | "blood";
/** Everything the tabs need about one battle, at the live price. */
function readBattle(b: ArenaBattle, mid: number) {
  const settled = b.status === "settled";
  const a = settled ? b.faderRoi ?? 0 : roiOf(b.faderLeg, mid), t = settled ? b.targetRoi ?? 0 : roiOf(b.targetLeg, mid);
  const dA = liqDist(b.faderLeg, mid), dT = liqDist(b.targetLeg, mid);
  const maxLev = Math.max(b.faderLeg.leverage, b.targetLeg.leverage);
  const notional = Math.max(b.faderLeg.size * b.faderLeg.entryPx, b.targetLeg.size * b.targetLeg.entryPx);
  const minLiq = Math.min(dA, dT), closer = dA <= dT ? b.fader : b.target;
  const worst = Math.min(a, t), loser = a <= t ? b.fader : b.target, winner = a <= t ? b.target : b.fader, gap = Math.abs(a - t);
  const high = maxLev >= 20 || notional >= 5000 || minLiq <= 10;
  const heat = Math.min(5, 1 + (maxLev >= 10 ? 1 : 0) + (maxLev >= 20 ? 1 : 0) + (maxLev >= 40 ? 1 : 0) + (minLiq < 5 ? 1 : 0));
  // Loosened while volume builds: anyone clearly losing or a lopsided battle.
  const blood = gap > 7; // ROI gap of more than 7 points between the fighters
  const risk = (maxLev * Math.max(1, notional / 100)) / (minLiq + 0.5);
  return { a, t, maxLev, minLiq, closer, worst, loser, winner, gap, high, heat, blood, risk };
}

const roiOf = (l: ArenaBattle["faderLeg"], mid: number) => {
  const mark = l.status === "open" ? mid || l.entryPx : l.exitPx ?? l.entryPx;
  return pnlForPosition(l.side, l.entryPx, mark, l.size).pct * l.leverage;
};

/** One side of a battle row: the leader's half glows gold; nothing sits on top of the avatar. */
function Fighter({ u, roi, lead, right, side }: { u: ArenaBattle["fader"]; roi: number; lead: boolean; right?: boolean; side: "long" | "short" }) {
  return (
    <div className={`ab-f ${right ? "r" : ""} ${lead ? "lead" : ""}`}>
      <span className={`ab-av ${side}`}><Avatar handle={u.handle} url={u.avatarUrl} size={38} link={false} /></span>
      <div className="min-w-0">
        <div className="ab-name"><span className="truncate">{u.handle}</span><RankChip xp={u.xp} compact size={16} /></div>
        <div className={`mono ab-roi ${roi >= 0 ? "green" : "red"}`}>{fmtPct(roi, 1)}</div>
      </div>
    </div>
  );
}

/** Last standing: how the first side went out and when, the number the one still in has to beat, winning or chasing. */
/** A knockout: how the first side went out and when, what the one still in has to beat, and whether they're beating it. */
function koInfo(b: ArenaBattle, r: ReturnType<typeof readBattle>) {
  const fIn = b.faderLeg.status === "open";
  const out = fIn ? b.target : b.fader, outLeg = fIn ? b.targetLeg : b.faderLeg, still = fIn ? b.fader : b.target, stillLeg = fIn ? b.faderLeg : b.targetLeg;
  const outRoi = fIn ? r.t : r.a, stillRoi = fIn ? r.a : r.t;
  const x = outLeg.exitPx ?? outLeg.entryPx;
  const liq = outLeg.leverage > 1 ? (outLeg.side === "long" ? outLeg.entryPx * (1 - 1 / outLeg.leverage) : outLeg.entryPx * (1 + 1 / outLeg.leverage)) : null;
  const how = liq && (outLeg.side === "long" ? x <= liq * 1.002 : x >= liq * 0.998) ? "liquidated"
    : outLeg.slPx && Math.abs(x - outLeg.slPx) / outLeg.slPx < 0.003 ? "stopped out"
    : outRoi >= 0 ? "banked" : "cut";
  return { out, outLeg, still, stillLeg, outRoi, stillRoi, how, winning: stillRoi > outRoi };
}

function GladBadge({ b, r }: { b: ArenaBattle; r: ReturnType<typeof readBattle> }) {
  const k = koInfo(b, r);
  return (
    <>
      <Glyph n="swords" />
      <span className="truncate"><b>{k.out.handle}</b> {k.how} {fmtPct(k.outRoi, 1)}{k.outLeg.closedAt ? ` · ${timeAgo(k.outLeg.closedAt)} ago` : ""}</span>
      <span className="ml-auto flex items-center gap-1.5"><span className="muted">{k.still.handle} needs {fmtPct(k.outRoi, 1)}</span><span className={`glad-st ${k.winning ? "g" : "r"}`}>{k.winning ? "Winning" : "Chasing"}</span></span>
    </>
  );
}

type Row = { b: ArenaBattle; r: ReturnType<typeof readBattle> };

/** Hub card: the worst live fight, compact, with one Finish them button. */
function PitCard({ x }: { x: Row }) {
  const { b, r } = x, wr = r.winner.id === b.fader.id ? r.a : r.t;
  return (
    <div className="hub-card pit">
      <Link href={`/battle/${b.faderPostId}`} className="hub-body">
        <div className="hub-head"><span className="hub-tag blood gl"><Glyph n="drop" />The Pit</span><span className="when"><CoinMark coin={b.coin} size="xs" />{ticker(b.coin)}</span></div>
        <div className="hub-f"><span className="hub-av win"><Avatar handle={r.winner.handle} url={r.winner.avatarUrl} size={34} link={false} /><em><Glyph n="crown" tone="gold" /></em></span><b className="truncate">{r.winner.handle}</b><span className={`mono ${wr >= 0 ? "green" : "red"}`}>{fmtPct(wr, 1)}</span></div>
        <div className="hub-vs">vs</div>
        <div className="hub-f"><span className="hub-av crack"><Avatar handle={r.loser.handle} url={r.loser.avatarUrl} size={34} link={false} /></span><b className="truncate">{r.loser.handle}</b><span className={`mono ${r.worst >= 0 ? "green" : "red"}`}>{fmtPct(r.worst, 1)}</span></div>
        <div className="hub-foot">{r.minLiq < 50 ? <span className="ab-warn">liq in {r.minLiq.toFixed(1)}%</span> : <span className="when">{fmtPct(r.gap, 1).replace(/^[+−-]/, "")} gap</span>}</div>
      </Link>
      <FinishSave b={b} winner={r.winner} loser={r.loser} compact />
    </div>
  );
}

/** Hub card: the newest knockouts, one at a time (dots to flip), with a Back button for the one still in. */
function StandingCard({ list }: { list: Row[] }) {
  const [i, setI] = useState(0);
  const x = list[Math.min(i, list.length - 1)];
  if (!x) return (
    <div className="hub-card stand empty">
      <div className="hub-head"><span className="hub-tag chrome gl"><Glyph n="swords" />Last standing</span></div>
      <p className="when mt-2">When one side of a fade gets knocked out and the other is still in, they show up here for 24 hours.</p>
    </div>
  );
  const k = koInfo(x.b, x.r);
  return (
    <div className="hub-card stand">
      <Link href={`/battle/${x.b.faderPostId}`} className="hub-body">
        <div className="hub-head"><span className="hub-tag chrome gl"><Glyph n="swords" />Last standing</span><span className="when"><CoinMark coin={x.b.coin} size="xs" />{ticker(x.b.coin)}</span></div>
        <div className="hub-solo">
          <span className="hub-av big"><Avatar handle={k.still.handle} url={k.still.avatarUrl} size={48} link={false} /></span>
          <b className="truncate">{k.still.handle}</b>
          <span className={`mono hub-roi ${k.stillRoi >= 0 ? "green" : "red"}`}>{fmtPct(k.stillRoi, 1)}</span>
          <span className={`glad-st ${k.winning ? "g" : "r"}`}>{k.winning ? "Winning" : "Chasing"}</span>
        </div>
        <div className="hub-foot when truncate"><b>{k.out.handle}</b> {k.how} {fmtPct(k.outRoi, 1)}{k.outLeg.closedAt ? ` · ${timeAgo(k.outLeg.closedAt)}` : ""}</div>
        {k.outLeg.closedAt && <div className="hub-left">{leftOf(k.outLeg.closedAt)}</div>}
      </Link>
      {list.length > 1 && (
        <div className="hub-dots" role="tablist">
          {list.slice(0, 6).map((_, j) => <button key={j} aria-label={`Knockout ${j + 1}`} className={j === Math.min(i, list.length - 1) ? "on" : ""} onClick={() => setI(j)} />)}
        </div>
      )}
      <FinishSave b={x.b} winner={x.r.winner} loser={x.r.loser} quiet />
    </div>
  );
}

/** Small swipeable card for the rails. */
/** Time left before a knockout drops off Last standing (24 hours after it happened). */
const leftOf = (at: string) => {
  const ms = 86_400_000 - (Date.now() - +new Date(at));
  if (ms <= 0) return "dropping off";
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return `drops off in ${h ? `${h}h ` : ""}${m}m`;
};

function MiniFight({ x, rekt, lead }: { x: Row; rekt?: boolean; lead?: boolean }) {
  const { b, r } = x;
  if (lead) {
    const wr = r.winner.id === b.fader.id ? r.a : r.t;
    return (
      <Link href={`/battle/${b.faderPostId}`} className={`hub-mini ${b.nemesis ? "nem" : ""}`}>
        <div className="hub-head"><span className="when"><CoinMark coin={b.coin} size="xs" />{ticker(b.coin)}</span><span className="mono when">{b.faderLeg.leverage}×·{b.targetLeg.leverage}×</span></div>
        <div className="hub-pair"><Avatar handle={r.winner.handle} url={r.winner.avatarUrl} size={30} link={false} /><Avatar handle={r.loser.handle} url={r.loser.avatarUrl} size={30} link={false} /></div>
        <div className="truncate text-[12.5px] font-bold">{r.winner.handle} <span className="muted font-medium">leads</span></div>
        <div className={`mono text-[13px] font-extrabold ${wr >= 0 ? "green" : "red"}`}>{fmtPct(wr, 1)}</div>
      </Link>
    );
  }
  return (
    <Link href={`/battle/${b.faderPostId}`} className={`hub-mini ${rekt ? "rekt" : ""}`}>
      <div className="hub-head"><span className="when"><CoinMark coin={b.coin} size="xs" />{ticker(b.coin)}</span>{rekt ? <span className="rekt">REKT</span> : <span className="mono when">{fmtPct(r.gap, 0).replace(/^[+−-]/, "")} gap</span>}</div>
      <div className="hub-pair"><Avatar handle={r.winner.handle} url={r.winner.avatarUrl} size={30} link={false} /><Avatar handle={r.loser.handle} url={r.loser.avatarUrl} size={30} link={false} /></div>
      <div className="truncate text-[12.5px] font-bold">{rekt ? <>{r.loser.handle} <span className="muted font-medium">by</span> {r.winner.handle}</> : r.loser.handle}</div>
      <div className={`mono text-[13px] font-extrabold ${r.worst >= 0 ? "green" : "red"}`}>{fmtPct(r.worst, 1)}</div>
    </Link>
  );
}

/** Hub card for the All tab: one fight up big, both fighters and their P&L. */
function FightCard({ x, tag, cls }: { x: Row; tag: ReactNode; cls: string }) {
  const { b } = x, fa = b.fader, ta = b.target;
  return (
    <div className={`hub-card ${cls}`}>
      <Link href={`/battle/${b.faderPostId}`} className="hub-body">
        <div className="hub-head">{tag}<span className="when"><CoinMark coin={b.coin} size="xs" />{ticker(b.coin)}</span></div>
        {[[fa, x.r.a, b.faderLeg], [ta, x.r.t, b.targetLeg]].map(([u, roi, l], i) => {
          const uu = u as ArenaBattle["fader"], rr = roi as number, ll = l as ArenaBattle["faderLeg"];
          return (
            <div key={i} className="hub-f">
              <span className={`hub-av ${uu.id === x.r.winner.id && x.r.gap > 0.05 ? "win" : ""}`}><Avatar handle={uu.handle} url={uu.avatarUrl} size={34} link={false} />{uu.id === x.r.winner.id && x.r.gap > 0.05 && <em><Glyph n="crown" tone="gold" /></em>}</span>
              <b className="truncate">{uu.handle}</b>
              <span className="flex items-center gap-1.5"><span className={`mono ${rr >= 0 ? "green" : "red"}`}>{fmtPct(rr, 1)}</span><span className={`hub-side ${ll.side}`}>{ll.side === "long" ? "L" : "S"} {ll.leverage}×</span></span>
            </div>
          );
        })}
        <div className="hub-foot">{x.r.minLiq < 50 ? <span className="ab-warn">liq in {x.r.minLiq.toFixed(1)}%</span> : <span className="when">{fmtPct(x.r.gap, 1).replace(/^[+−-]/, "")} gap · {timeAgo(b.createdAt)}</span>}</div>
      </Link>
      <FinishSave b={b} winner={x.r.winner} loser={x.r.loser} quiet />
    </div>
  );
}

/** The All tab as a hub: Main event beside Your fight, then swipeable rails, then every fade. */
function AllHub({ rows, nem, high, mine, list }: { rows: Row[]; nem: Row[]; high: Row[]; mine: Row | null; list: ReactNode }) {
  const main = [...rows].sort((x, y) => y.r.risk - x.r.risk)[0];
  if (!main) return <>{list}</>;
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="hub-hero">
        <FightCard x={main} cls="main" tag={<span className="hub-tag gold gl"><Glyph n="trophy" />Main event</span>} />
        {mine && mine.b.id !== main.b.id ? <FightCard x={mine} cls="yours" tag={<span className="hub-tag ink gl"><Glyph n="swords" />Your fight</span>} />
          : (
            <div className="hub-card yours empty">
              <div className="hub-head"><span className="hub-tag ink gl"><Glyph n="swords" />Your fight</span></div>
              <p className="when mt-1">{mine ? "You're in the main event." : "You're not in a fade right now. Fade a trade from the feed and your fight lives here."}</p>
              <Link href="/" className="hub-btn mt-auto text-center">Find a trade to fade</Link>
            </div>
          )}
      </div>
      {nem.length > 0 && (
        <section>
          <div className="asub"><Glyph n="skull" /><b>Vendettas</b><span className="when">swipe</span></div>
          <div className="hub-rail">{nem.map((x) => <MiniFight key={x.b.id} x={x} lead />)}</div>
        </section>
      )}
      {high.length > 0 && (
        <section>
          <div className="asub"><Glyph n="flame" /><b>High stakes</b><span className="when">swipe</span></div>
          <div className="hub-rail">{high.slice(0, 12).map((x) => <MiniFight key={x.b.id} x={x} lead />)}</div>
        </section>
      )}
      <div className="asub"><Glyph n="bolt" /><b>Every fade</b><span className="when">{rows.length} live</span></div>
      {list}
    </div>
  );
}

/** Slim kill ticker along the top of the Arena: who got liquidated by whom, scrolling. */
function KillTicker({ kills }: { kills: ArenaBattle[] }) {
  if (!kills.length) return null;
  const items = kills.slice(0, 8).map((b) => {
    const w = b.winnerId === b.fader.id ? b.fader : b.target, l = w.id === b.fader.id ? b.target : b.fader;
    return <Link key={b.id} href={`/battle/${b.faderPostId}`} className="kt-item"><Glyph n="skull" tone="blood" /><b>{w.handle}</b> perped <b>{l.handle}</b><span className="when">{ticker(b.coin)} · {timeAgo(b.settledAt ?? b.createdAt)}</span></Link>;
  });
  return <div className="kticker" aria-label="Recent liquidations"><div className="kt-track">{items}{items.map((it, i) => <span key={`d${i}`} aria-hidden>{it}</span>)}</div></div>;
}

/** The Bloodbath as a hub: numbers up top, the Pit beside Last standing, then swipeable rails. */
function BloodHub({ blood, knocked, rekt, data }: { blood: Row[]; knocked: Row[]; rekt: Row[]; data: ArenaRes }) {
  const kills24 = (data.kills ?? []).filter((k) => Date.now() - +new Date(k.settledAt ?? k.createdAt) < 86_400_000).length;
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="hub-stats">
        <div><b className="mono">{blood.length}</b><span>getting perped</span></div>
        <div><b className="mono">{knocked.length}</b><span>knocked out</span></div>
        <div><b className="mono">{kills24}</b><span>liquidated 24h</span></div>
        <div><b className="mono">{blood[0] ? fmtPct(blood[0].r.gap, 0).replace(/^[+−-]/, "") : "–"}</b><span>widest gap</span></div>
      </div>
      <div className="hub-hero">
        {blood[0] ? <PitCard x={blood[0]} /> : <div className="hub-card pit empty"><div className="hub-head"><span className="hub-tag blood gl"><Glyph n="drop" />The Pit</span></div><p className="when mt-2">No bloodbaths right now. Everyone&rsquo;s still standing.</p></div>}
        <StandingCard list={knocked} />
      </div>
      {blood.length > 1 && (
        <section>
          <div className="asub"><Glyph n="drop" /><b>Getting perped</b><span className="when">swipe</span></div>
          <div className="hub-rail">{blood.slice(1).map((x) => <MiniFight key={x.b.id} x={x} />)}</div>
        </section>
      )}
      {rekt.length > 0 && (
        <section>
          <div className="asub"><Glyph n="tomb" /><b>Graveyard</b><span className="when">recently liquidated</span></div>
          <div className="hub-rail">{rekt.map((x) => <MiniFight key={x.b.id} x={x} rekt />)}</div>
        </section>
      )}
      <KillFeed kills={data.kills ?? []} />
      <BodyCount board={data.board} />
    </div>
  );
}

function BattleRow({ b, mid, badge, noChase }: { b: ArenaBattle; mid: number; badge?: ReactNode; noChase?: boolean }) {
  const settled = b.status === "settled";
  const a = settled ? b.faderRoi ?? 0 : roiOf(b.faderLeg, mid), t = settled ? b.targetRoi ?? 0 : roiOf(b.targetLeg, mid);
  const total = Math.abs(a) + Math.abs(t) || 1;
  const share = Math.max(8, Math.min(92, 50 + ((a - t) / total) * 50));
  const aWin = settled ? b.winnerId === b.fader.id : a > t, tWin = settled ? b.winnerId === b.target.id : t > a;
  // Lead change: flash the row gold for a moment.
  const leader = aWin ? "a" : tWin ? "t" : "";
  const prevLeader = useRef(leader);
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    if (prevLeader.current && leader && prevLeader.current !== leader) { setFlip(true); const id = setTimeout(() => setFlip(false), 1400); prevLeader.current = leader; return () => clearTimeout(id); }
    prevLeader.current = leader;
  }, [leader]);
  return (
    <Link href={`/battle/${b.faderPostId}`} className={`arow ${b.nemesis ? "nemesis" : ""} ${flip ? "flip" : ""}`}>
      {b.nemesis && <NemesisBar b={b} />}
      {isFightNight(b.createdAt) && b.status === "open" && <span className="fn-badge gl"><Glyph n="glove" />Fight Night · 2× XP</span>}
      {!settled && !noChase && (b.faderLeg.status === "closed" || b.targetLeg.status === "closed") && (() => {
        const fBanked = b.faderLeg.status === "closed", banker = fBanked ? b.fader : b.target, chaser = fBanked ? b.target : b.fader;
        const bank = fBanked ? a : t, now = fBanked ? t : a;
        return <span className={`chase-badge gl ${now > bank ? "ahead" : ""}`}><Glyph n="bank" />{banker.handle} banked {fmtPct(bank, 1)} · {chaser.handle} {now > bank ? "ahead" : "chasing"}</span>;
      })()}
      <div className="ab-grid">
        <Fighter u={b.fader} roi={a} lead={aWin} side={b.faderLeg.side} />
        <div className="ab-mid"><CoinMark coin={b.coin} size="xs" /><span className="ab-gap mono">{fmtPct(Math.abs(a - t), 1).replace(/^[+−-]/, "")}<small>gap</small></span><span className="when text-[10px]">{settled ? timeAgo(b.settledAt ?? b.createdAt) : <span className="ab-live">LIVE</span>}</span></div>
        <Fighter u={b.target} roi={t} lead={tWin} right side={b.targetLeg.side} />
      </div>
      <Tug share={share} left={b.faderLeg.side} right={b.targetLeg.side} />
      {badge && <div className="abadge">{badge}</div>}
    </Link>
  );
}

/** Fight Night: every day 9–10pm Bangkok (14:00–15:00 UTC). Countdown, then LIVE. */
function FightNight() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date(), start = new Date(now); start.setUTCHours(14, 0, 0, 0);
      const end = new Date(start.getTime() + 3_600_000);
      if (now >= end) start.setUTCDate(start.getUTCDate() + 1);
      if (now >= start && now < end) return setT("live");
      const ms = start.getTime() - now.getTime(), h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
      setT(h ? `${h}h ${m}m` : `${m}m`);
    };
    tick(); const id = setInterval(tick, 30_000); return () => clearInterval(id);
  }, []);
  if (!t) return null;
  return <Link href="/how-it-works#fight-night" className={`fightnight ${t === "live" ? "on" : ""}`}><span className="gl"><Glyph n="glove" />{t === "live" ? "Fight Night · LIVE" : `Fight Night in ${t}`}</span></Link>;
}

/** Sworn rivals meeting again: the series so far and which meeting this is. */
function NemesisBar({ b }: { b: ArenaBattle }) {
  const n = b.nemesis!;
  const lead = n.faderWins === n.targetWins ? "series level" : `${n.faderWins > n.targetWins ? b.fader.handle : b.target.handle} leads`;
  return (
    <div className="nem-bar">
      <span className="nem-tag gl"><Glyph n="skull" />Vendetta</span>
      <span className="nem-txt">Meeting #{n.meeting} · <b className="mono">{n.faderWins}–{n.targetWins}</b> · {lead}</span>
    </div>
  );
}

/** Pick someone to call out: rivals and top traders first, or search by handle. */
function CallOut({ onPick, onClose, rivals }: { onPick: (h: string) => void; onClose: () => void; rivals: string[] }) {
  const { profile } = useSession();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  const { data } = useSWR<{ users: { handle: string; avatarUrl: string | null; xp: number }[] }>(`/api/users?q=${encodeURIComponent(dq)}`);
  const list = (data?.users ?? []).filter((u) => u.handle !== profile?.handle);
  return (
    <Sheet label="Call someone out" onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="text-lg font-extrabold" data-sheet-handle>Call someone out</div>
        <p className="muted text-sm">Pick a trader. You choose the coin, your side and the clock; they take the other side.</p>
        <input className="field mt-3" placeholder="Search a handle" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {!q && rivals.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{rivals.map((h) => <button key={h} className="chip" onClick={() => onPick(h)}>Rematch {h}</button>)}</div>}
        <div className="mt-2 flex flex-col">
          {list.map((u) => (
            <button key={u.handle} className="lb" style={{ width: "100%", textAlign: "left", background: "none", border: 0 }} onClick={() => onPick(u.handle)}>
              <Avatar handle={u.handle} url={u.avatarUrl} size={36} link={false} />
              <div className="min-w-0 flex-1"><div className="name">{u.handle}<RankChip xp={u.xp} compact /></div><div className="when">{rankFor(u.xp).title} · {u.xp.toLocaleString()} XP</div></div>
              <span className="chip on"><Glyph n="swords" />Challenge</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** /arena — the PvP hub. */
/** "How it works" for the Arena: the whole thing in one sheet, in the order you meet it. */
function ArenaHow({ onClose }: { onClose: () => void }) {
  const S = ({ icon, title, children }: { icon: Parameters<typeof Glyph>[0]["n"]; title: string; children: ReactNode }) => (
    <section className="ah-sec"><h3 className="gl"><Glyph n={icon} />{title}</h3>{children}</section>
  );
  return (
    <Sheet label="How the Arena works" onClose={onClose}>
      <div className="ah px-5 pb-6">
        <h2 className="text-[22px] font-extrabold leading-tight">How the Arena works</h2>
        <p className="muted mt-1 text-[14px]">Every live fade on Perped in one place. Here&rsquo;s exactly how fights start, how they&rsquo;re won and what everything on this page means.</p>

        <S icon="bolt" title="A fade is a fight">
          <ul>
            <li><b>Fading a trade starts it:</b> same coin, the opposite side. Quick fade uses the trader&rsquo;s exact leverage and adds a stop loss for you.</li>
            <li><b>Higher ROI wins</b> (leverage included). Under 0.5% apart is a draw. Getting liquidated loses on the spot.</li>
            <li><b>Bank and chase:</b> if one side closes first, their ROI is locked in. The side still in has to beat it when they close, or they lose.</li>
            <li>It settles when both positions close. After 7 days, anything still open is marked at the live price.</li>
            <li>You can fade a trade once. Anyone else can pile in, so one trade can have many fights.</li>
          </ul>
        </S>

        <S icon="drop" title="Health bars">
          <ul>
            <li>100% at your entry, 0% at your stop loss, or at liquidation if you have no stop.</li>
            <li>Under 40% they bleed. A stop already in profit shows full: that fight can&rsquo;t be lost.</li>
          </ul>
        </S>

        <S icon="people" title="Finding fights">
          <ul>
            <li><b>Everyone / Following:</b> all fades, or only yours, people you follow and your rivals. It works with every tab below.</li>
            <li><b>All:</b> the <b>Main event</b> (the riskiest fight right now) next to <b>Your fight</b>, then Vendettas and High stakes to swipe, then every fade.</li>
            <li><b>Vendettas:</b> two traders in a feud: they&rsquo;ve fought each other more than anyone else, or one called the other out. Shows the series score.</li>
            <li><b>High stakes:</b> 20× or more, a $5k+ position, or someone within 10% of liquidation.</li>
          </ul>
        </S>

        <S icon="skull" title="Bloodbath">
          <ul>
            <li>Fights where the two sides are more than 7 ROI points apart.</li>
            <li><b>The Pit:</b> the most one-sided fight right now.</li>
            <li><b>Last standing:</b> one side is out (stopped, liquidated or banked) and the other is still in. Newest first; each stays 24 hours. <b>Winning</b> means they&rsquo;re beating the number the other side finished on; <b>Chasing</b> means they&rsquo;re not, yet.</li>
            <li><b>Getting perped:</b> the rest of the one-sided fights, to swipe through.</li>
            <li><b>Graveyard and kill feed:</b> recent liquidations. <b>Body count:</b> this week&rsquo;s Butcher (most people perped) and Most rekt.</li>
          </ul>
        </S>

        <S icon="dagger" title="Backing a side">
          <ul>
            <li><b>Back</b> on any fight copies that fighter&rsquo;s trade. One tap: you pick the size, it uses their leverage.</li>
            <li>In the Bloodbath it&rsquo;s <b>Finish them</b> (back the winner) or <b>Save them</b> (back the loser for a comeback).</li>
            <li>The two fighters can&rsquo;t back either side of their own fight.</li>
          </ul>
        </S>

        <S icon="swords" title="Call someone out">
          <ul>
            <li>A <b>duel</b>: a timed head-to-head they accept by link. The start price is the live price when they accept; whoever is ahead when the clock runs out wins.</li>
            <li>Fight the same trader three times, or call them out, and you become <b>rivals</b>: you&rsquo;re pinged with a one-tap fade whenever they trade.</li>
          </ul>
        </S>

        <S icon="trophy" title="XP and ranks">
          <ul>
            <li><b>Fade win +60</b> (+30 for winning by 20%+, +40 for beating someone two ranks above you). Loss +10. Draw +20. Liquidated: nothing.</li>
            <li><b>Duel win +75</b>, loss +10. From Knife Catcher up, losses cost XP, so ranks can be lost.</li>
            <li><b>Streak bounties:</b> anyone on 5+ wins carries one. Break it for 25 XP plus 10 per win in their streak.</li>
            <li><b>Fight Night:</b> 9 to 10pm Bangkok time every night. Fades started in that hour pay double XP.</li>
          </ul>
        </S>

        <Link href="/how-it-works#arena" className="btn mt-4 w-full" style={{ padding: 12, fontSize: 14 }} onClick={onClose}>Full rules</Link>
      </div>
    </Sheet>
  );
}

export default function ArenaPage() {
  const { authenticated, login, profile, authedFetch } = useSession();
  const { mids } = useMids();
  const { data } = useSWR<ArenaRes>("/api/arena", async () => (await authedFetch("/api/arena")).json(), { refreshInterval: 20_000 });
  const [picking, setPicking] = useState(false);
  const [how, setHow] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const me = data?.me;
  const lvl = rankFor(profile?.xp ?? 0);
  const callOut = () => (authenticated ? setPicking(true) : login());
  // Slim bar that pins to the top once you scroll past the header: your record + Fight Night.
  const [stuck, setStuck] = useState(false);
  useEffect(() => { const on = () => setStuck(window.scrollY > 240); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);

  return (
    <div className="fade-in pb-8" data-tint="gold">
      <div className={`arena-sticky ${stuck ? "on" : ""}`} aria-hidden={!stuck}>
        <b className="text-[15px] font-extrabold">Arena</b>
        {me && <span className="mono text-[13px] font-bold"><span className="green">{me.won}</span><span className="muted">–</span><span className="red">{me.lost}</span></span>}
        {me && me.streak > 0 && <span className="gl text-[13px] font-bold"><Glyph n="flame" tone="gold" />{me.streak}</span>}
        <span className="ml-auto"><FightNight /></span>
      </div>
      <header className="lb-hero" style={{ backgroundImage: "url(/api/share-bg/hero-bulls)" }}>
        <div className="flex items-center justify-between gap-2"><h1 className="h1" style={{ color: "#fff" }}>Arena</h1><button className="arena-how" onClick={() => setHow(true)}>How it works</button></div>
        <div className="text-[12px]" style={{ color: "rgba(255,255,255,.85)" }}>Fade someone and it&rsquo;s on. Call them out and it&rsquo;s a duel. Winner takes the XP.</div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><button className="arena-cta" onClick={callOut}><span className="gl"><Glyph n="swords" />Call someone out</span></button><FightNight /></div>
      </header>

      {!data && <SkeletonList n={3} card={false} />}

      {me && (
        <section className="block">
          <div className="flex items-center gap-3">
            <RankEmblem level={lvl.level} size={52} />
            <div className="flex-1">
              <div className="eyebrow">Your record</div>
              <div className="mono text-[24px] font-bold"><span className="green">{me.won}</span><span className="muted"> – </span><span className="red">{me.lost}</span>{me.drawn ? <span className="muted text-[15px]"> · {me.drawn} drawn</span> : null}</div>
            </div>
            <div className="text-right"><div className="text-[22px] font-extrabold">{me.streak > 0 ? <span className="gl"><Glyph n="flame" tone="gold" />{me.streak}</span> : "—"}</div><div className="when text-[11px]">streak · best {me.best}</div></div>
          </div>
        </section>
      )}

      {me && me.challenges.length > 0 && (
        <section className="block">
          <div className="eyebrow" style={{ color: "var(--red)" }}>You&rsquo;ve been called out</div>
          {me.challenges.map((c) => (
            <Link key={c.id} href={`/duels/${c.id}`} className="lb">
              <Avatar handle={c.from.handle} url={c.from.avatarUrl} size={40} link={false} />
              <div className="min-w-0 flex-1"><div className="name">{c.from.handle}</div><div className="when">{c.side} {ticker(c.coin)} · {fmtUsd(c.stakeUsd)} each · {c.hours}h</div></div>
              <span className="chip on">Answer</span>
            </Link>
          ))}
        </section>
      )}

      {data && <LiveTabs data={data} mids={mids} me={profile?.handle ?? null} />}
      {how && <ArenaHow onClose={() => setHow(false)} />}

      {me && me.rivals.length > 0 && (
        <section className="block">
          <div className="eyebrow">Your rivals</div>
          {me.rivals.map((r) => (
            <div key={r.user.id} className="lb">
              <Avatar handle={r.user.handle} url={r.user.avatarUrl} size={40} />
              <div className="min-w-0 flex-1"><Link href={`/rivalry/${profile?.handle}/${r.user.handle}`} className="name">{r.user.handle}<RankChip xp={r.user.xp} compact /></Link><Link href={`/rivalry/${profile?.handle}/${r.user.handle}`} className="mono when block"><span className="green">{r.won}W</span> · <span className="red">{r.lost}L</span> · see the series →</Link></div>
              <button className="chip on" onClick={() => setTarget(r.user.handle)}>Rematch</button>
            </div>
          ))}
        </section>
      )}

      {data && data.streaks.length > 0 && (
        <section className="block">
          <div className="eyebrow">Hot streaks</div>
          <div className="hstrip mt-2" style={{ margin: "8px -20px 0", padding: "0 20px 4px" }}>
            {data.streaks.map((s) => (
              <div key={s.user.id} className="hcard text-center" style={{ width: 120 }}>
                <div className="flex justify-center"><Avatar handle={s.user.handle} url={s.user.avatarUrl} size={44} /></div>
                <div className="name mt-1.5 truncate text-[13px]">{s.user.handle}</div>
                <div className="text-[18px] font-extrabold"><span className="gl"><Glyph n="flame" tone="gold" />{s.streak}</span></div>
                {s.streak >= 5 && <div className="bounty gl"><Glyph n="bag" />Bounty +{25 + s.streak * 10} XP</div>}
                {profile?.handle !== s.user.handle && <button className="chip mt-1.5 w-full justify-center" style={{ fontSize: 11, padding: "5px 8px" }} onClick={() => (authenticated ? setTarget(s.user.handle) : login())}>Break it</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {data && data.recent.length > 0 && (
        <section className="block">
          <div className="eyebrow">Recent results</div>
          <div className="mt-2 flex flex-col gap-2">{data.recent.map((b) => <BattleRow key={b.id} b={b} mid={mids[b.coin] ?? 0} />)}</div>
        </section>
      )}

      <div className="px-5 py-2 text-center"><Link href="/how-it-works#battles" className="when underline">How fades and duels are scored →</Link></div>

      {picking && <CallOut rivals={(me?.rivals ?? []).map((r) => r.user.handle)} onClose={() => setPicking(false)} onPick={(h) => { setPicking(false); setTarget(h); }} />}
      {target && <ChallengeSheet handle={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

/** Live battles by tab: All · Following · Vendettas · High stakes · Gladiators · Bloodbath. */
function LiveTabs({ data, mids, me }: { data: ArenaRes; mids: Record<string, number>; me: string | null }) {
  // Two questions, two controls: whose fights (Everyone / Following) and how hot (All · Vendettas · High stakes · Bloodbath).
  const [scope, setScope] = useState<"everyone" | "following">("everyone");
  const [tab, setTab] = useState<Heat>("all");
  const { set: follow } = useFollowing();
  const rivals = new Set((data.me?.rivals ?? []).map((r) => r.user.handle));
  const mine = (b: ArenaBattle) => !!me && (b.fader.handle === me || b.target.handle === me);
  const followed = (b: ArenaBattle) => follow.has(b.fader.handle) || follow.has(b.target.handle) || rivals.has(b.fader.handle) || rivals.has(b.target.handle);
  const inScope = (b: ArenaBattle) => scope === "everyone" || mine(b) || followed(b);
  // Nemesis matches float to the top; in Following, your own fades come first, then the newest.
  const all = data.live.map((b) => ({ b, r: readBattle(b, mids[b.coin] ?? 0) }));
  const rows = all.filter((x) => inScope(x.b)).sort((x, y) => scope === "following"
    ? Number(mine(y.b)) - Number(mine(x.b)) || +new Date(y.b.createdAt) - +new Date(x.b.createdAt)
    : Number(!!y.b.nemesis) - Number(!!x.b.nemesis));
  const nem = rows.filter((x) => !!x.b.nemesis);
  const high = rows.filter((x) => x.r.high).sort((x, y) => y.r.risk - x.r.risk);
  // Knockouts: one side is already out (stopped, liquidated or banked), the other still in. Newest first, 24 hours each.
  const solo = (b: ArenaBattle) => (b.faderLeg.status === "open") !== (b.targetLeg.status === "open");
  const koAt = (b: ArenaBattle) => +new Date((b.faderLeg.status === "open" ? b.targetLeg : b.faderLeg).closedAt ?? b.createdAt);
  const knocked = rows.filter((x) => solo(x.b) && Date.now() - koAt(x.b) < 86_400_000).sort((x, y) => koAt(y.b) - koAt(x.b));
  const blood = rows.filter((x) => x.r.blood && !solo(x.b)).sort((x, y) => y.r.gap - x.r.gap);
  const rekt = (data.rekt ?? []).map((b) => ({ b, r: readBattle(b, mids[b.coin] ?? 0) })).filter((x) => inScope(x.b));
  const nFol = all.filter((x) => mine(x.b) || followed(x.b)).length;
  const pills: { k: Heat; short: string; n: number }[] = [
    { k: "all", short: "All", n: rows.length },
    { k: "nemesis", short: "Vendettas", n: nem.length },
    { k: "high", short: "High stakes", n: high.length },
    { k: "blood", short: "Bloodbath", n: blood.length + knocked.length + rekt.length },
  ];
  const flames = (n: number) => <span className="flames">{Array.from({ length: n }, (_, i) => <Glyph key={i} n="flame" tone="gold" />)}</span>;
  const tag = (b: ArenaBattle) => mine(b) ? "your fade" : rivals.has(b.fader.handle) ? `your rival ${b.fader.handle}` : rivals.has(b.target.handle) ? `your rival ${b.target.handle}` : follow.has(b.fader.handle) ? `you follow ${b.fader.handle}` : follow.has(b.target.handle) ? `you follow ${b.target.handle}` : "";
  const list = tab === "all" ? rows : tab === "nemesis" ? nem : high;
  const row = ({ b, r }: { b: ArenaBattle; r: ReturnType<typeof readBattle> }, kind: Heat | "ko") => (
    <div key={`${kind}${b.id}`}>
      <BattleRow b={b} mid={mids[b.coin] ?? 0} noChase={kind === "ko"} badge={
        kind === "high" ? <><span>{flames(r.heat)}</span><b className="mono">{b.faderLeg.leverage}× vs {b.targetLeg.leverage}×</b>{r.minLiq < 50 && <span className="ab-warn">{r.closer.handle} liq in {r.minLiq.toFixed(1)}%</span>}</>
        : kind === "blood" ? <><Glyph n="skull" tone="blood" /><b>{r.loser.handle}</b><b className="mono red">{fmtPct(r.worst, 0)}</b>{r.minLiq < 50 && <span className="ab-warn">liq in {r.minLiq.toFixed(1)}%</span>}<span className="ml-auto muted"><span className="gl">{r.winner.handle}<Glyph n="crown" tone="gold" /></span></span></>
        : kind === "ko" ? <GladBadge b={b} r={r} />
        : scope === "following" && tag(b) ? <span className="ab-tag">{tag(b)}</span>
        : undefined
      } />
      <div className="bb-under"><FinishSave b={b} winner={r.winner} loser={r.loser} quiet={kind !== "blood"} /></div>
    </div>
  );
  const empty = scope === "following" && !rows.length;
  return (
    <section className="block">
      <div className="flex items-center justify-between"><span className="eyebrow flex items-center gap-2"><i className="livedot" />Live fades</span><span className="when">{all.length} live</span></div>
      <KillTicker kills={data.kills ?? []} />
      <div className="ascope mt-3" role="tablist" aria-label="Whose fades">
        <button role="tab" aria-selected={scope === "everyone"} className={scope === "everyone" ? "on" : ""} onClick={() => setScope("everyone")}>Everyone<small>{all.length}</small></button>
        <button role="tab" aria-selected={scope === "following"} className={scope === "following" ? "on" : ""} onClick={() => setScope("following")}>Following<small>{nFol}</small></button>
      </div>
      <div className="aheat mt-2" role="tablist" aria-label="How hot">
        {pills.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} className={`ah-${t.k} ${tab === t.k ? "on" : ""}`} onClick={() => setTab(t.k)}>{t.short}<small className="mono">{t.n}</small></button>)}
      </div>

      {empty ? (
        <div className="aempty mt-3">
          <p className="muted text-sm">Follow traders to fill this. Their fades show up here the moment they fade or get faded.</p>
          <div className="mt-2 flex flex-col gap-2">{data.streaks.slice(0, 3).map((s) => (
            <div key={s.user.id} className="flex items-center gap-2.5"><Avatar handle={s.user.handle} url={s.user.avatarUrl} size={30} /><span className="flex-1 truncate text-[14px] font-bold">{s.user.handle}<span className="when ml-1.5 gl"><Glyph n="flame" tone="gold" />{s.streak} streak</span></span><FollowButton handle={s.user.handle} compact /></div>
          ))}</div>
        </div>
      ) : tab === "blood" ? (
        <BloodHub blood={blood} knocked={knocked} rekt={rekt} data={data} />
      ) : tab === "all" ? (
        <AllHub rows={rows} nem={nem} high={high} mine={rows.find((x) => mine(x.b)) ?? null} list={
        <div className="flex flex-col gap-2">
          {list.map((x) => row(x, tab))}
          {!list.length && <p className="muted text-sm">No fades running. Fade a trade in the feed to start one.</p>}
        </div>
        } />
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {list.map((x) => row(x, tab))}
          {!list.length && <p className="muted text-sm">{tab === "high" ? "No high-stakes fades right now. Nobody's above 20× or near liquidation." : tab === "nemesis" ? "No vendettas running right now. A vendetta is a feud between two traders who have fought each other more than anyone else, or where one called the other out." : "No fades running. Fade a trade in the feed to start one."}</p>}
        </div>
      )}
    </section>
  );
}
