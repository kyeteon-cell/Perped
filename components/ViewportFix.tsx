"use client";

import { useEffect } from "react";

/**
 * iOS 26 bug (Apple FB19889436): after the keyboard closes, or when the bottom address bar hides on a long page,
 * Safari's visual viewport stays offset, so `position: fixed` bars drift up the page. This measures how far the
 * visible bottom of the screen is from where fixed elements think it is, and publishes it as --vv-bottom /
 * --vv-top; the nav, the positions pill and sheets shift by that much (0 everywhere else, and on other phones).
 * While you're typing, nothing moves, so the nav stays behind the keyboard as normal.
 */
export function ViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let raf = 0;
    const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable); };
    const apply = () => {
      raf = 0;
      const top = Math.round(vv.offsetTop);
      const bottom = typing() ? 0 : Math.round(vv.offsetTop + vv.height - window.innerHeight);
      // Ignore sub-pixel noise and pinch zoom (scale ≠ 1), which has its own behaviour.
      const ok = Math.abs(vv.scale - 1) < 0.01;
      root.style.setProperty("--vv-bottom", `${ok && Math.abs(bottom) > 1 ? bottom : 0}px`);
      root.style.setProperty("--vv-top", `${ok && Math.abs(top) > 1 && !typing() ? top : 0}px`);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(apply); };
    vv.addEventListener("resize", on); vv.addEventListener("scroll", on);
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    const out = () => setTimeout(on, 60);
    document.addEventListener("focusout", out);
    document.addEventListener("focusin", on);
    apply();
    return () => { vv.removeEventListener("resize", on); vv.removeEventListener("scroll", on); window.removeEventListener("scroll", on); window.removeEventListener("resize", on); document.removeEventListener("focusin", on); document.removeEventListener("focusout", out); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
