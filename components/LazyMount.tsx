"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Mounts its children only when they come near the screen, so below-the-fold sections don't load (or fetch) up front. */
export function LazyMount({ children, minHeight = 120, margin = "400px" }: { children: ReactNode; minHeight?: number; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || on) return;
    if (typeof IntersectionObserver === "undefined") { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el); return () => io.disconnect();
  }, [on, margin]);
  return on ? <>{children}</> : <div ref={ref} style={{ minHeight }} aria-hidden />;
}
