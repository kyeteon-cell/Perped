"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Glyph } from "./Glyph";
import { Avatar, CoinMark, ticker } from "./ui";
import { Intro } from "./Intro";
import { TradeTicket } from "./TradeTicket";
import { useSession } from "@/lib/hooks/useSession";
import { track } from "@/lib/track";
import type { FeedRow } from "@/lib/feed";

import { LEVEL_KEY, type Level } from "@/lib/level";

const LEVELS: { k: Level; title: string; sub: string; icon: "drop" | "bolt" | "swords" }[] = [
  { k: "new", title: "I'm new to crypto", sub: "Never bought any. Show me from the start.", icon: "drop" },
  { k: "crypto", title: "I've bought crypto", sub: "But I've never traded perps or used leverage.", icon: "bolt" },
  { k: "perps", title: "I trade perps", sub: "Long, short, leverage, liquidation: I know it.", icon: "swords" },
];
const LEV: Record<Level, number> = { new: 2, crypto: 3, perps: 5 };

type Slide = { title: string; body: string[]; demo?: React.ReactNode };
const Up = () => <span className="wl-dir long">▲ Long = price up</span>;
const Down = () => <span className="wl-dir short">▼ Short = price down</span>;

const SLIDES: Record<"new" | "crypto", Slide[]> = {
  new: [
    { title: "Every coin has a price that moves", body: ["Bitcoin, Ethereum, Solana and hundreds more have a price that changes every second, all day, every day.", "Perped shows those prices live. You make money by calling which way a price goes next."],
      demo: <div className="wl-demo"><span className="wl-tick"><CoinMark coin="BTC" size="sm" /><b>BTC</b><span className="mono">$97,412</span><span className="green mono">+1.8%</span></span><span className="wl-tick"><CoinMark coin="ETH" size="sm" /><b>ETH</b><span className="mono">$3,284</span><span className="red mono">−0.6%</span></span></div> },
    { title: "Pick a direction", body: ["Think it goes up? Go long. Think it goes down? Go short. You can make money either way.", "If the price moves your way you're in profit. If it moves against you, you're in loss."], demo: <div className="wl-demo row"><Up /><Down /></div> },
    { title: "Leverage multiplies it, both ways", body: ["With 2× leverage, a 1% move in the price is 2% on your money. With 10×, it's 10%.", "It multiplies losses exactly the same. Start low: we'll set you up at 2×."],
      demo: <div className="wl-demo"><div className="wl-lev"><span>Price moves</span><b className="mono">+1%</b></div><div className="wl-lev"><span>At 2×</span><b className="mono green">+2%</b></div><div className="wl-lev"><span>At 10×</span><b className="mono green">+10%</b></div><div className="wl-lev"><span>…or the other way at 10×</span><b className="mono red">−10%</b></div></div> },
    { title: "Stop loss and liquidation", body: ["A stop loss closes your trade automatically if the price goes too far against you, so a bad trade stays a small loss.", "If the price goes much too far, the trade is closed for you anyway: that's liquidation. Higher leverage gets there faster."] },
    { title: "Practice money, real prices", body: ["You start with $10,000 of demo money. The prices are real, the money isn't, so nothing is at risk while you learn.", "Every trade you make is a post: people can copy you, or fade you (bet against you), and you can do the same to them."] },
  ],
  crypto: [
    { title: "Perps: bet on the price, both ways", body: ["A perp (perpetual future) is a position on a coin's price, not the coin itself. You can go long (price up) or short (price down).", "No expiry: you hold it as long as you like and close whenever you want."], demo: <div className="wl-demo row"><Up /><Down /></div> },
    { title: "Leverage and liquidation", body: ["Leverage multiplies your position. $100 at 10× trades like $1,000: a 1% move is ±10% on your $100.", "Move about 1 ÷ leverage against you and you're liquidated: at 10× that's roughly 10%. We'll start you at 3×."] },
    { title: "Stop loss, take profit, funding", body: ["A stop loss closes you out at a price you choose; take profit locks in a win. Quick fade adds a stop for you.", "Funding is a small payment between longs and shorts every hour that keeps the perp price near the real price."] },
    { title: "Perped makes it social", body: ["Every trade is a post with live P&L. Copy traders you rate, or fade (take the other side of) the ones you don't.", "Every fade is a head-to-head: higher ROI wins. You start with $10,000 of demo money at live prices."] },
  ],
};

function Deck({ slides, onDone }: { slides: Slide[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const x0 = useRef<number | null>(null);
  const s = slides[i], last = i === slides.length - 1;
  return (
    <div className="intro" onTouchStart={(e) => { x0.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (x0.current == null) return; const dx = e.changedTouches[0].clientX - x0.current; if (Math.abs(dx) > 50) setI((n) => Math.max(0, Math.min(slides.length - 1, n + (dx < 0 ? 1 : -1)))); x0.current = null; }}>
      <div className="intro-top"><div className="intro-dots">{slides.map((_, n) => <button key={n} aria-label={`Slide ${n + 1}`} className={n === i ? "on" : ""} onClick={() => setI(n)} />)}</div><button className="intro-skip" onClick={onDone}>Skip</button></div>
      <div key={i} className="intro-slide">
        <div className="eyebrow">{i + 1} of {slides.length}</div>
        <h2 className="intro-h">{s.title}</h2>
        {s.demo && <div className="intro-mock">{s.demo}</div>}
        {s.body.map((b, n) => <p key={n} className="intro-p">{b}</p>)}
      </div>
      <div className="intro-nav">
        {i > 0 ? <button className="btn ghost" onClick={() => setI(i - 1)}>Back</button> : <span />}
        <button className="btn ink" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "Try it" : "Next"}</button>
      </div>
    </div>
  );
}

/** Step 2: the first trade, guided. Coin, direction, then the real ticket (demo money). */
function FirstTrade({ level, onDone, onSkip }: { level: Level; onDone: () => void; onSkip: () => void }) {
  const [coin, setCoin] = useState("BTC");
  const [side, setSide] = useState<"long" | "short" | null>(null);
  return (
    <div className="intro">
      <div className="intro-top"><span className="eyebrow">Your first trade</span><button className="intro-skip" onClick={onSkip}>Skip</button></div>
      <div className="intro-slide">
        <h2 className="intro-h">{level === "perps" ? "Open a demo position" : "Make your first trade"}</h2>
        <p className="intro-p">{level === "new" ? "Pick a coin, then pick which way you think it goes. It's practice money, so there's nothing to lose." : level === "crypto" ? "Pick a coin and a side. We've set leverage to 3× and you can add a stop loss." : "Demo money, live Hyperliquid prices. Pick a market and go."}</p>
        <div className="wl-step"><b>1</b>Pick a coin</div>
        <div className="wl-coins">{["BTC", "ETH", "SOL", "HYPE"].map((c) => <button key={c} className={coin === c ? "on" : ""} onClick={() => setCoin(c)}><CoinMark coin={c} size="sm" />{ticker(c)}</button>)}</div>
        <div className="wl-step"><b>2</b>{level === "perps" ? "Pick a side" : "Up or down?"}</div>
        <div className="wl-sides">
          <button className={`long ${side === "long" ? "on" : ""}`} onClick={() => setSide("long")}><b>▲ Long</b><span>{level === "perps" ? "Buy" : "I think it goes up"}</span></button>
          <button className={`short ${side === "short" ? "on" : ""}`} onClick={() => setSide("short")}><b>▼ Short</b><span>{level === "perps" ? "Sell" : "I think it goes down"}</span></button>
        </div>
        {side && (
          <>
            <div className="wl-step"><b>3</b>{level === "new" ? "Choose how much to put in" : "Size it and go"}</div>
            {level === "new" && <p className="when mb-2">Start small, like $100. Leverage is set to 2×, so a 1% move is 2% on that $100.</p>}
            <div className="wl-ticket"><TradeTicket key={`${coin}-${side}`} seed={{ coin, side, leverage: LEV[level] }} compact onDone={onDone} /></div>
          </>
        )}
      </div>
      <div className="intro-nav"><button className="btn ghost" onClick={onSkip}>Skip this</button><span className="wl-hint">{side ? "Place the trade above to continue" : "Pick a coin and a direction"}</span></div>
    </div>
  );
}

/** Step 3: the first fade, guided. Takes the other side of a live trade from the feed. */
function FirstFade({ level, onDone, onSkip }: { level: Level; onDone: () => void; onSkip: () => void }) {
  const { profile } = useSession();
  const { data } = useSWR<{ posts: FeedRow[] }>("/api/posts?tab=live&limit=30");
  const pick = (data?.posts ?? []).find((p) => p.post.kind === "trade" && p.post.status === "open" && p.author && p.author.handle !== profile?.handle);
  useEffect(() => { if (data && !pick) onSkip(); }, [data, pick, onSkip]);
  if (!pick) return <div className="intro"><div className="intro-slide"><p className="muted">Finding a live trade to fade…</p></div></div>;
  const s = pick.post.side as "long" | "short", mine = s === "long" ? "short" : "long", lev = pick.post.leverage ?? 2;
  return (
    <div className="intro">
      <div className="intro-top"><span className="eyebrow">Your first fade</span><button className="intro-skip" onClick={onSkip}>Skip</button></div>
      <div className="intro-slide">
        <h2 className="intro-h">Now bet against someone</h2>
        <p className="intro-p">{level === "new" ? "Fading means taking the other side of someone's trade. If they think the price goes up, you bet it goes down. Whoever ends with the better result wins the fight." : level === "crypto" ? "A fade opens the opposite position to someone else's, at their leverage, with a stop loss added for you. It becomes a head-to-head: higher ROI wins." : "Quick fade: opposite side, their leverage, auto stop loss. It's a head-to-head on ROI, scored in the Arena."}</p>
        <div className="wl-them">
          <Avatar handle={pick.author!.handle} url={pick.author!.avatarUrl} size={40} link={false} />
          <div className="min-w-0 flex-1"><b>{pick.author!.handle}</b><span className="when block">is <b className={s === "long" ? "green" : "red"}>{s}</b> {ticker(pick.post.coin!)} at {lev}×</span></div>
          <CoinMark coin={pick.post.coin!} size="sm" />
        </div>
        <div className="wl-vs"><span>You go <b className={mine === "long" ? "green" : "red"}>{mine}</b></span><span className="when">{level === "new" ? (mine === "short" ? "you win if the price falls" : "you win if the price rises") : `same ${lev}×, stop loss added`}</span></div>
        <div className="wl-ticket"><TradeTicket seed={{ coin: pick.post.coin!, side: mine, leverage: lev, fadedFromId: pick.post.id, handle: pick.author!.handle, lockLev: true, toBattle: true }} compact quick onDone={onDone} /></div>
      </div>
      <div className="intro-nav"><button className="btn ghost" onClick={onSkip}>Skip this</button><span className="wl-hint">Place the fade above to start the fight</span></div>
    </div>
  );
}

const NEXT: Record<Level, string[]> = {
  new: ["Watch your trade on the home feed: the number on the right is how it's doing.", "Close it any time from the trade itself. Try a few small ones before going bigger.", "Tap How it works in the Arena whenever you want the rules."],
  crypto: ["Add a stop loss to every trade from Manage: it's the habit that keeps you in the game.", "Copy someone you rate, fade someone you don't.", "Win fades to climb ranks. Season 0 counts when real money opens."],
  perps: ["Fades are scored on ROI. Close first and your ROI is banked for them to beat.", "Vendettas, Bloodbath and Fight Night (9 to 10pm Bangkok, double XP) are in the Arena.", "Your invite code earns you a share of your people's fees."],
};

/** First open: one question, the explainer for that level, then a guided first trade and first fade (both skippable). */
export function Welcome({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { ready, authenticated, startGuest, refreshMe } = useSession();
  const [level, setLevel] = useState<Level | null>(null);
  const [step, setStep] = useState<"ask" | "learn" | "trade" | "fade" | "done">("ask");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Level | null>(null);
  const finish = () => { try { localStorage.setItem("perped:intro-seen", "1"); } catch {} track("intro_done"); onClose(); };
  // Before the first trade, make sure there's a free demo account to trade with.
  const toTrade = async () => {
    if (ready && !authenticated) { setBusy(true); await startGuest().catch(() => null); await refreshMe().catch(() => null); setBusy(false); }
    setStep("trade");
  };
  const choose = (l: Level) => { track(l === "new" ? "welcome_new" : l === "crypto" ? "welcome_crypto" : "welcome_perps"); setLevel(l); try { localStorage.setItem(LEVEL_KEY, l); } catch {} setStep("learn"); };

  return (
    <div className="intro-overlay" role="dialog" aria-label="Welcome to Perped">
      {step === "ask" && (
        <div className="intro">
          <div className="intro-top"><span className="eyebrow">Welcome to Perped</span><button className="intro-skip" onClick={finish}>Skip</button></div>
          <div className="intro-slide">
            <h2 className="intro-h">How much do you know about crypto?</h2>
            <p className="intro-p">We&rsquo;ll explain Perped at your level, then walk you through a first trade with practice money.</p>
            <div className="wl-levels">{LEVELS.map((l) => (
              <button key={l.k} className={`wl-level ${sel === l.k ? "on" : ""}`} aria-pressed={sel === l.k} onClick={() => setSel(l.k)}><span className="wl-ic"><Glyph n={l.icon} /></span><span className="min-w-0 flex-1"><b>{l.title}</b><span>{l.sub}</span></span><span className="wl-radio" aria-hidden /></button>
            ))}</div>
            <p className="when mt-4">You can change this any time in Settings.</p>
          </div>
          <div className="intro-nav"><button className="btn ghost" onClick={finish}>Skip</button><button className="btn ink" disabled={!sel} onClick={() => sel && choose(sel)}>Continue</button></div>
        </div>
      )}
      {step === "learn" && level && (level === "perps" ? <Intro onDone={toTrade} doneLabel={busy ? "…" : "Try it"} /> : <Deck slides={SLIDES[level]} onDone={toTrade} />)}
      {step === "trade" && level && <FirstTrade level={level} onDone={() => { track("first_trade_done"); setStep("fade"); }} onSkip={() => { track("first_trade_skip"); setStep("fade"); }} />}
      {step === "fade" && level && <FirstFade level={level} onDone={() => { track("first_fade_done"); finish(); }} onSkip={() => { track("first_fade_skip"); setStep("done"); }} />}
      {step === "done" && level && (
        <div className="intro">
          <div className="intro-slide">
            <div className="eyebrow">You&rsquo;re set</div>
            <h2 className="intro-h">{level === "new" ? "That's the basics" : "You're in"}</h2>
            <ul className="wl-next">{NEXT[level].map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          <div className="intro-nav"><span /><button className="btn ink" onClick={() => { finish(); router.push("/"); }}>Go to the feed</button></div>
        </div>
      )}
    </div>
  );
}

/** Shown once per device on first open (or with ?welcome=1 to replay it from Settings). */
export function WelcomeOnce() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const replay = new URLSearchParams(window.location.search).get("welcome") === "1";
      if (replay || !localStorage.getItem("perped:intro-seen")) setShow(true);
      if (replay) window.history.replaceState(null, "", window.location.pathname);
    } catch {}
  }, []);
  if (!show) return null;
  return <Welcome onClose={() => setShow(false)} />;
}
