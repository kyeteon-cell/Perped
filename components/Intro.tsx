"use client";

import { Glyph } from "./Glyph";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { track } from "@/lib/track";

/** The six things to know, one per slide. Each has a tiny live-looking mock so it reads at a glance. */
const SLIDES: { k: string; eyebrow: string; title: string; body: string[]; mock: React.ReactNode }[] = [
  {
    k: "post", eyebrow: "1 · The feed", title: "Every trade is a post",
    body: ["Open a position and it lands in the feed with your name, a live chart and live P&L.", "Green means bought or in profit. Red means sold or in loss. Always."],
    mock: (
      <div className="im-card">
        <div className="im-row"><i className="im-av a" /><b>samui_sam</b><span className="muted"> · bought</span><span className="im-pill g">+12.4%</span></div>
        <div className="im-chart">{[30, 42, 38, 55, 48, 62, 58, 70, 66, 78].map((h, i) => <i key={i} className={i % 3 === 1 ? "r" : "g"} style={{ height: `${h}%` }} />)}<span className="im-buy">▲ BUY</span></div>
        <div className="im-row small"><span>HYPE · $250 × 20</span><span className="muted">TP 31.2 · SL 27.9</span></div>
      </div>
    ),
  },
  {
    k: "fade", eyebrow: "2 · Copy or fade", title: "Back them or take the other side",
    body: ["Swipe right to copy. Swipe left, or tap Quick fade, to bet against them.", "Quick fade only asks for your size. It matches their leverage, flips the side, adds a stop loss and drops you straight into the fade."],
    mock: (
      <div className="im-card">
        <div className="im-swipe"><span className="im-sw copy">Copy →</span><span className="im-sw fade">← Fade</span></div>
        <div className="im-qf"><b className="gl"><Glyph n="bolt" />Quick fade kate</b><span className="muted">She&rsquo;s long ETH 25× · you go short</span><div className="im-amt mono">$100</div><div className="im-chips"><i>25</i><i className="on">100</i><i>250</i><i>500</i></div><div className="im-btn short">Fade · Short ETH 25×</div></div>
      </div>
    ),
  },
  {
    k: "battle", eyebrow: "3 · Fades", title: "Every fade is a head-to-head",
    body: ["Higher ROI when both close wins. Close first and your ROI is banked: they have to beat it. Get liquidated and you lose on the spot.", "Health bars run from your entry to your stop loss (or liquidation if you have none). Under 40% they start to bleed."],
    mock: (
      <div className="im-card">
        <div className="im-row"><i className="im-av b" /><b>kate</b><span className="im-vs">VS</span><b>mooncat</b><i className="im-av c" /></div>
        <div className="im-hp"><div><small>Margin/SL health</small><span><i className="g" style={{ width: "86%" }} /></span></div><div className="r"><small>Margin/SL health</small><span className="bleed"><i className="r" style={{ width: "31%" }} /></span></div></div>
        <div className="im-row small"><span className="green">+9.1%</span><span className="muted">kate ahead by 14.2%</span><span className="red">−5.1%</span></div>
      </div>
    ),
  },
  {
    k: "arena", eyebrow: "4 · The Arena", title: "Watch it, then jump in",
    body: ["Tabs for Vendettas (two traders locked in a feud), High stakes, Following and Bloodbath, where someone is getting perped.", "In Bloodbath: Finish them backs the winner, Save them backs the loser. Got liquidated? Revenge fades their next trade."],
    mock: (
      <div className="im-card">
        <div className="im-tabs"><i>All</i><i className="nem"><Glyph n="skull" /> Vendettas</i><i><Glyph n="flame" /> High</i><i className="on"><Glyph n="drop" /> Bloodbath</i></div>
        <div className="im-pit"><span className="im-tag"><Glyph n="drop" /> The Pit</span><div className="im-row"><b className="gl">degenpriest<Glyph n="crown" tone="gold" /></b><span className="im-vs">VS</span><b className="crack">wenlambo</b></div><div className="im-acts"><span className="fin"><Glyph n="dagger" /> Finish them</span><span><Glyph n="buoy" /> Save them</span></div></div>
      </div>
    ),
  },
  {
    k: "rank", eyebrow: "5 · Ranks", title: "Earn XP. Lose it too.",
    body: ["Wins, calls and fades earn XP and ranks. From Knife Catcher up, losses cost XP, so ranks can be lost.", "Beat someone on a 5+ win streak and you claim their bounty. Fight the same trader three times and you’re rivals. Fight Night is 9pm Bangkok, every night."],
    mock: (
      <div className="im-card">
        <div className="im-ranks">{[1, 3, 5, 7, 9].map((l) => <img key={l} src={`/api/share-bg/rank-${l}`} alt="" />)}</div>
        <div className="im-row small"><span className="im-bounty"><Glyph n="bag" /> Bounty +95 XP</span><span className="im-fn"><Glyph n="glove" /> Fight Night in 2h 10m</span></div>
      </div>
    ),
  },
  {
    k: "money", eyebrow: "6 · Your money", title: "Practice free. Trade real when ready.",
    body: ["You start with $10,000 of demo money at live prices. Nothing is at risk.", "Real trades fill on Hyperliquid from your own wallet. Perped never holds your funds. Leverage can wipe your margin, so start small."],
    mock: (
      <div className="im-card">
        <div className="im-row"><span className="demo-tag">Demo</span><b className="mono">$10,000.00</b><span className="muted">practice balance</span></div>
        <div className="im-row"><span className="real-tag">Real</span><span>Your wallet → Hyperliquid</span><span className="muted">✓ verified on-chain</span></div>
      </div>
    ),
  },
];

/** Swipeable intro deck. `onDone` fires on the last slide (or "Skip"). */
/** First visit: the intro as a full-screen overlay, shown once per device. */
export function IntroOnce() {
  const [show, setShow] = useState(false);
  const { authenticated, startGuest } = useSession();
  useEffect(() => { try { if (!localStorage.getItem("perped:intro-seen")) setShow(true); } catch {} }, []);
  if (!show) return null;
  const done = () => {
    try { localStorage.setItem("perped:intro-seen", "1"); } catch {}
    track("intro_done");
    setShow(false);
    // Straight into a free demo account so the first trade is one tap away.
    if (!authenticated) startGuest().catch(() => null);
  };
  return <div className="intro-overlay" role="dialog" aria-label="Welcome to Perped"><Intro onDone={done} doneLabel={authenticated ? "Start trading" : "Try it free"} /></div>;
}

export function Intro({ onDone, doneLabel = "Start trading" }: { onDone: () => void; doneLabel?: string }) {
  const [i, setI] = useState(0);
  const x0 = useRef<number | null>(null);
  const go = (n: number) => setI(Math.max(0, Math.min(SLIDES.length - 1, n)));
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <div className="intro" onTouchStart={(e) => { x0.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (x0.current == null) return; const dx = e.changedTouches[0].clientX - x0.current; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); x0.current = null; }}>
      <div className="intro-top"><div className="intro-dots">{SLIDES.map((d, n) => <button key={d.k} aria-label={`Slide ${n + 1}`} className={n === i ? "on" : ""} onClick={() => go(n)} />)}</div><button className="intro-skip" onClick={onDone}>Skip</button></div>
      <div key={s.k} className="intro-slide">
        <div className="eyebrow">{s.eyebrow}</div>
        <h2 className="intro-h">{s.title}</h2>
        <div className="intro-mock">{s.mock}</div>
        {s.body.map((b, n) => <p key={n} className="intro-p">{b}</p>)}
      </div>
      <div className="intro-nav">
        {i > 0 ? <button className="btn ghost" onClick={() => go(i - 1)}>Back</button> : <Link href="/how-it-works" className="btn ghost" onClick={onDone}>Full guide</Link>}
        <button className="btn ink" onClick={() => (last ? onDone() : go(i + 1))}>{last ? doneLabel : "Next"}</button>
      </div>
    </div>
  );
}
