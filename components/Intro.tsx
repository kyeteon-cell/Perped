"use client";


import { tt } from "@/lib/i18n";
import { small } from "@/lib/img";
import { Glyph } from "./Glyph";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { track } from "@/lib/track";
import { useLive } from "@/lib/hooks/useLive";

/** The six things to know, one per slide. Each has a tiny live-looking mock so it reads at a glance. */
const SLIDES: { k: string; eyebrow: string; title: string; body: string[]; mock: React.ReactNode }[] = [
  {
    k: "post", eyebrow: "1 · The feed", title: "Every trade is a post",
    body: ["Open a position and it lands in the feed with your name, a live chart and live P&L.", "Green means bought or in profit. Red means sold or in loss. Always."],
    mock: (
      <div className="im-card">
        <div className="im-row"><i className="im-av a" /><b>samui_sam</b><span className="muted">{" "}{tt("· bought")}</span><span className="im-pill g">+12.4%</span></div>
        <div className="im-chart">{[30, 42, 38, 55, 48, 62, 58, 70, 66, 78].map((h, i) => <i key={i} className={i % 3 === 1 ? "r" : "g"} style={{ height: `${h}%` }} />)}<span className="im-buy">{tt("▲ BUY")}</span></div>
        <div className="im-row small"><span>{tt("HYPE · $250 × 20")}</span><span className="muted">{tt("TP 31.2 · SL 27.9")}</span></div>
      </div>
    ),
  },
  {
    k: "fade", eyebrow: "2 · Copy or fade", title: "Back them or take the other side",
    body: ["Swipe right to copy. Swipe left, or tap Quick fade, to bet against them.", "Quick fade only asks for your size. It matches their leverage, flips the side, adds a stop loss and drops you straight into the fade."],
    mock: (
      <div className="im-card">
        <div className="im-swipe"><span className="im-sw copy">{tt("Copy →")}</span><span className="im-sw fade">{tt("← Fade")}</span></div>
        <div className="im-qf"><b className="gl"><Glyph n="bolt" />{tt("Quick fade kate")}</b><span className="muted">{tt("She’s long ETH 25× · you go short")}</span><div className="im-amt mono">$100</div><div className="im-chips"><i>25</i><i className="on">100</i><i>250</i><i>500</i></div><div className="im-btn short">{tt("Fade · Short ETH 25×")}</div></div>
      </div>
    ),
  },
  {
    k: "battle", eyebrow: "3 · Fades", title: "Every fade is a head-to-head",
    body: ["Higher ROI when both close wins. Close first and your ROI is banked: they have to beat it. Get liquidated and you lose on the spot.", "Health bars run from your entry to your stop loss (or liquidation if you have none). Under 40% they start to bleed."],
    mock: (
      <div className="im-card">
        <div className="im-row"><i className="im-av b" /><b>kate</b><span className="im-vs">VS</span><b>mooncat</b><i className="im-av c" /></div>
        <div className="im-hp"><div><small>{tt("Margin/SL health")}</small><span><i className="g" style={{ width: "86%" }} /></span></div><div className="r"><small>{tt("Margin/SL health")}</small><span className="bleed"><i className="r" style={{ width: "31%" }} /></span></div></div>
        <div className="im-row small"><span className="green">+9.1%</span><span className="muted">{tt("kate ahead by 14.2%")}</span><span className="red">−5.1%</span></div>
      </div>
    ),
  },
  {
    k: "arena", eyebrow: "4 · The Arena", title: "Watch it, then jump in",
    body: ["Tabs for Vendettas (two traders locked in a feud), High stakes, Following and Bloodbath, where someone is getting perped.", "In Bloodbath: Finish them backs the winner, Save them backs the loser. Got liquidated? Revenge fades their next trade."],
    mock: (
      <div className="im-card">
        <div className="im-tabs"><i>{tt("All")}</i><i className="nem"><Glyph n="skull" />{" "}{tt("Vendettas")}</i><i><Glyph n="flame" />{" "}{tt("High")}</i><i className="on"><Glyph n="drop" />{" "}{tt("Bloodbath")}</i></div>
        <div className="im-pit"><span className="im-tag"><Glyph n="drop" />{" "}{tt("The Pit")}</span><div className="im-row"><b className="gl">degenpriest<Glyph n="crown" tone="gold" /></b><span className="im-vs">VS</span><b className="crack">wenlambo</b></div><div className="im-acts"><span className="fin"><Glyph n="dagger" />{" "}{tt("Finish them")}</span><span><Glyph n="buoy" />{" "}{tt("Save them")}</span></div></div>
      </div>
    ),
  },
  {
    k: "rank", eyebrow: "5 · Ranks & trophies", title: "Earn XP. Lose it too.",
    body: ["Wins, calls and fades earn XP and ranks. From Knife Catcher up, losses cost XP, so ranks can be lost. 29 trophies to collect, bronze to obsidian, each with a card to share.", "Beat someone on a 5+ win streak and you claim their bounty. Fight the same trader three times and you’re rivals. Fight Night is 9pm Bangkok, every night."],
    mock: (
      <div className="im-card">
        <div className="im-ranks">{[1, 3, 5, 7, 8].map((l) => <img key={l} src={small(`/api/share-bg/rank-${l}`, 128)} alt="" loading="lazy" decoding="async" />)}</div>
        <div className="im-row small"><span className="im-bounty"><Glyph n="bag" />{" "}{tt("Bounty +95 XP")}</span><span className="im-fn"><Glyph n="glove" />{" "}{tt("Fight Night in 2h 10m")}</span></div>
      </div>
    ),
  },
  {
    k: "money", eyebrow: "6 · Your money", title: "Practice free. Trade real when ready.",
    body: ["You start with $10,000 of demo money at live prices. Nothing is at risk.", "Real trades fill on Hyperliquid from your own wallet. Perped never holds your funds. Leverage can wipe your margin, so start small."],
    mock: (
      <div className="im-card">
        <div className="im-row"><span className="demo-tag">{tt("Demo")}</span><b className="mono">$10,000.00</b><span className="muted">{tt("practice balance")}</span></div>
        <div className="im-row"><span className="real-tag">{tt("Real")}</span><span>{tt("Your wallet → Hyperliquid")}</span><span className="muted">{tt("✓ verified on-chain")}</span></div>
      </div>
    ),
  },
];

/** The money slide while real trading is still closed. */
const MONEY_SOON: (typeof SLIDES)[number] = {
  k: "money", eyebrow: "6 · Your money", title: "Practice free. Real money soon.",
  body: ["You start with $10,000 of demo money at live Hyperliquid prices. Nothing is at risk.", "Real trading opens soon. This is Season 0: your XP, rank and record carry over when it does."],
  mock: (
    <div className="im-card">
      <div className="im-row"><span className="demo-tag">{tt("Demo")}</span><b className="mono">$10,000.00</b><span className="muted">{tt("practice balance")}</span></div>
      <div className="im-row live-off"><span className="real-tag">{tt("Real")}</span><span>{tt("Your wallet → Hyperliquid")}</span><span className="soon-pill">{tt("Soon")}</span></div>
    </div>
  ),
};

/** Swipeable intro deck. `onDone` fires on the last slide (or "Skip"). */

export function Intro({ onDone, doneLabel = "Start trading" }: { onDone: () => void; doneLabel?: string }) {
  const [i, setI] = useState(0);
  const x0 = useRef<number | null>(null);
  const go = (n: number) => setI(Math.max(0, Math.min(SLIDES.length - 1, n)));
  const { allowed: liveOk } = useLive();
  const s = SLIDES[i].k === "money" && !liveOk ? MONEY_SOON : SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <div className="intro" onTouchStart={(e) => { x0.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (x0.current == null) return; const dx = e.changedTouches[0].clientX - x0.current; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); x0.current = null; }}>
      <div className="intro-top"><div className="intro-dots">{SLIDES.map((d, n) => <button key={d.k} aria-label={`Slide ${n + 1}`} className={n === i ? "on" : ""} onClick={() => go(n)} />)}</div><button className="intro-skip" onClick={onDone}>{tt("Skip")}</button></div>
      <div key={s.k} className="intro-slide">
        <div className="eyebrow">{s.eyebrow}</div>
        <h2 className="intro-h">{s.title}</h2>
        <div className="intro-mock">{s.mock}</div>
        {s.body.map((b, n) => <p key={n} className="intro-p">{b}</p>)}
      </div>
      <div className="intro-nav">
        {i > 0 ? <button className="btn ghost" onClick={() => go(i - 1)}>{tt("Back")}</button> : <Link href="/how-it-works" className="btn ghost" onClick={onDone}>{tt("Full guide")}</Link>}
        <button className="btn ink" onClick={() => (last ? onDone() : go(i + 1))}>{last ? doneLabel : tt("Next")}</button>
      </div>
    </div>
  );
}
