"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const KEY = "perped:arena-intro";
const CARDS = [
  { k: "1 · Fade", h: "Take the other side", p: "See a trade you think is wrong? Fade it: same coin, same leverage, opposite direction. Now it's you against them." },
  { k: "2 · Health", h: "Bars are your stop", p: "Each health bar runs from your entry to your stop loss, or liquidation if you have none. Under 40% it bleeds. Hit zero and you're KO'd." },
  { k: "3 · Winning", h: "Higher ROI wins", p: "When both have closed, the better ROI wins. Close first and your result is banked: they have to beat it. Get liquidated and you lose on the spot." },
  { k: "4 · Extras", h: "XP everywhere", p: "Not in a fight? Pick the winner for XP. Beat the Daily Fade for +50 XP. Fades started at Fight Night (9pm) pay double." },
];

/** First visit to the arena: four swipeable cards on how fades work. Shown once per device; `force` replays it. */
export function ArenaIntro({ force = false, onDone }: { force?: boolean; onDone?: () => void }) {
  const [show, setShow] = useState(false);
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => { try { if (force || !localStorage.getItem(KEY)) setShow(true); } catch {} }, [force]);
  if (!show) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch {} setShow(false); onDone?.(); };
  const go = (n: number) => { const el = track.current; if (!el) return; el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" }); };
  // Rendered on the page body: inside a sheet (which slides with a transform) "fixed" would be relative to the sheet.
  return createPortal(
    <div className="aint-bg" onClick={close}>
      <div className="aint" role="dialog" aria-label="How fades work" onClick={(e) => e.stopPropagation()}>
        <div className="aint-track" ref={track} onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>
          {CARDS.map((c, n) => (
            <section key={c.k} className="aint-card">
              <div className={`aint-art a${n}`} aria-hidden><i /><i /><i /></div>
              <small>{c.k}</small><h2>{c.h}</h2><p>{c.p}</p>
            </section>
          ))}
        </div>
        <div className="aint-dots">{CARDS.map((c, n) => <i key={c.k} className={n === i ? "on" : ""} />)}</div>
        <div className="aint-acts">
          <button type="button" onClick={close}>Skip</button>
          <button type="button" className="go" onClick={() => (i < CARDS.length - 1 ? go(i + 1) : close())}>{i < CARDS.length - 1 ? "Next" : "Let's fight"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
