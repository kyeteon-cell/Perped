"use client";

import { useEffect, useRef, useState } from "react";

/** Pull down at the top of the page to refresh: the Perped mark drops in, spins while it loads. Touch only. */
export function PullRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> | unknown }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const cb = useRef(onRefresh); cb.current = onRefresh;
  const pullRef = useRef(0); pullRef.current = pull;
  const busyRef = useRef(false); busyRef.current = busy;
  useEffect(() => {
    const down = (e: TouchEvent) => { start.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; };
    const move = (e: TouchEvent) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { if (pullRef.current) setPull(0); return; }
      setPull(Math.min(110, dy * 0.5));
    };
    const up = async () => {
      if (start.current == null) return;
      start.current = null;
      if (pullRef.current >= 64) {
        setBusy(true); setPull(64);
        try { navigator.vibrate?.(15); } catch {}
        try { await cb.current(); } catch {}
        setTimeout(() => { setBusy(false); setPull(0); }, 450);
      } else setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    const cancel = () => { start.current = null; if (!busyRef.current) setPull(0); };
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", cancel);
    // The browser's own pull-to-refresh would reload the whole page on top of ours.
    const html = document.documentElement, prevOb = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "contain";
    return () => { window.removeEventListener("touchstart", down); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); window.removeEventListener("touchcancel", cancel); html.style.overscrollBehaviorY = prevOb; };
  }, []);
  if (!pull && !busy) return null;
  const k = Math.min(1, pull / 64);
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: k }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/api/share-bg/icon-180" alt="" width={36} height={36} className={busy ? "spin" : ""} style={busy ? undefined : { transform: `rotate(${pull * 4}deg) scale(${0.6 + k * 0.4})` }} />
    </div>
  );
}
