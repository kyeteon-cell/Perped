"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { scroller } from "@/lib/scroller";

/**
 * Scroll position per page for the in-app scroll panel: going Back returns you to where you were; going to a
 * new page starts at the top (what the browser did for us when the window scrolled).
 */
export function ScrollMemory() {
  const path = usePathname() ?? "/";
  const back = useRef(false);
  const pos = useRef<Record<string, number>>({});
  useEffect(() => {
    const pop = () => { back.current = true; };
    window.addEventListener("popstate", pop);
    try { history.scrollRestoration = "manual"; } catch {}
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const s = scroller(); if (!s) return;
    const want = back.current ? pos.current[path] ?? 0 : 0;
    back.current = false;
    // Wait a frame for the new page to lay out, then try again once its data has had a moment to arrive.
    requestAnimationFrame(() => { s.scrollTop = want; });
    const t = want ? setTimeout(() => { if (Math.abs(s.scrollTop - want) > 4) s.scrollTop = want; }, 350) : 0;
    let raf = 0;
    const save = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pos.current[path] = s.scrollTop; }); };
    s.addEventListener("scroll", save, { passive: true });
    return () => { s.removeEventListener("scroll", save); clearTimeout(t); if (raf) cancelAnimationFrame(raf); };
  }, [path]);
  return null;
}
