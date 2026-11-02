"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that rolls to its new value instead of jumping (money, XP, balances). Eases over ~500ms,
 * and shows the final value straight away for people who turn motion off.
 */
export function Roll({ v, fmt, ms = 500 }: { v: number; fmt: (x: number) => string; ms?: number }) {
  const [shown, setShown] = useState(v);
  const from = useRef(v), raf = useRef(0);
  useEffect(() => {
    const start = from.current, end = v;
    const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(start) || !Number.isFinite(end) || start === end) { from.current = end; setShown(end); return; }
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      const x = start + (end - start) * e; from.current = x; setShown(x);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [v, ms]);
  return <>{fmt(shown)}</>;
}
