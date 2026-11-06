"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { FeedRow } from "@/lib/feed";
import { usePulseCards } from "./Pulse";

const FirstBattle = dynamic(() => import("./FirstBattle").then((m) => m.FirstBattle), { ssr: false });
const FightNightHome = dynamic(() => import("./FightNightHome").then((m) => m.FightNightHome), { ssr: false });
const DailyFade = dynamic(() => import("./DailyFade").then((m) => m.DailyFade), { ssr: false });
const QuickCall = dynamic(() => import("./QuickCall").then((m) => m.QuickCall), { ssr: false });

/**
 * "Happening now": one swipeable strip in place of five stacked cards, so the feed starts on the first screen.
 * Order is priority: your first fade (new players) → Fight Night (an hour before and during) → Daily Fade →
 * the one-hour call → the live Pulse cards. Each card still decides for itself whether to show; a slide whose
 * card has nothing to show collapses (CSS :empty), so whatever matters most right now is always first.
 * Auto-advances like Pulse did, and stops for good once you touch it so it never moves under your finger.
 */
export function NowStrip({ rows, mids }: { rows: FeedRow[]; mids: Record<string, number> }) {
  const { data: pulse, cards } = usePulseCards(mids);
  const rail = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const [n, setN] = useState(0);
  const [idx, setIdx] = useState(0);

  const visible = () => Array.from(rail.current?.children ?? []).filter((c) => (c as HTMLElement).offsetWidth > 0) as HTMLElement[];
  const step = () => { const v = visible(); return v.length > 1 ? v[1].offsetLeft - v[0].offsetLeft : v[0]?.offsetWidth ?? 300; };

  // Count the slides that actually have something in them (cards load and hide themselves on their own schedule).
  useEffect(() => {
    const el = rail.current; if (!el) return;
    const count = () => setN(visible().length);
    count();
    const mo = new MutationObserver(count);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      const el = rail.current;
      if (!el || touched.current || n < 2 || document.visibilityState !== "visible") return;
      if (el.getBoundingClientRect().bottom < 0) return; // scrolled past it: don't burn frames
      const w = step();
      const next = (Math.round(el.scrollLeft / w) + 1) % n;
      el.scrollTo({ left: next * w, behavior: "smooth" });
    }, 7000);
    return () => clearInterval(id);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => { touched.current = true; };
  return (
    <section className="now" aria-label="Happening now">
      <div className="now-head">
        <span className="eyebrow flex items-center gap-2"><i className="livedot" />Happening now</span>
        {n > 1 && <span className="now-dots" aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} className={i === idx ? "on" : ""} />)}</span>}
      </div>
      <div
        ref={rail}
        className="prail now-rail"
        onTouchStart={stop}
        onPointerDown={stop}
        onWheel={stop}
        onScroll={(e) => setIdx(Math.min(n - 1, Math.round(e.currentTarget.scrollLeft / step())))}
      >
        <div className="now-slide"><FirstBattle rows={rows} /></div>
        <div className="now-slide"><FightNightHome /></div>
        <div className="now-slide"><DailyFade /></div>
        <div className="now-slide"><QuickCall mids={mids} /></div>
        {pulse ? cards : <div className="now-slide"><div className="pulse-skel" aria-hidden /></div>}
      </div>
    </section>
  );
}
