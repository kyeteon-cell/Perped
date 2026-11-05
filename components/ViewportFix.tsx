"use client";

import { useEffect } from "react";

/**
 * iOS 26 bug (Apple FB19889436): after the keyboard closes, or when the bottom address bar hides on a long page,
 * Safari's visual viewport stays offset, so `position: fixed` bars drift up the page. This measures how far the
 * visible bottom of the screen is from where fixed elements think it is, and publishes it as --vv-bottom /
 * --vv-top; the nav, the positions pill and sheets shift by that much (0 everywhere else, and on other phones).
 * While you're typing, nothing moves, so the nav stays behind the keyboard as normal.
 *
 * Resuming the app (from the background, a notification or the home screen) is the other trap: iOS reports a
 * half-settled viewport for a moment and then fires no further resize, so a one-off reading would stick and
 * leave the nav and pill floating mid-screen. On every resume we reset to 0 and re-measure until it settles.
 */
export function ViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let raf = 0;
    let timers: number[] = [];
    let nudged = false;
    const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable); };
    const set = (bottom: number, top: number) => {
      root.style.setProperty("--vv-bottom", `${bottom}px`);
      root.style.setProperty("--vv-top", `${top}px`);
    };
    const apply = () => {
      raf = 0;
      if (document.visibilityState !== "visible") return;
      const top = Math.round(vv.offsetTop);
      const bottom = typing() ? 0 : Math.round(vv.offsetTop + vv.height - window.innerHeight);
      // Ignore sub-pixel noise and pinch zoom (scale ≠ 1), which has its own behaviour. The drift bug is tens of
      // pixels; anything bigger is a keyboard or a viewport that hasn't settled yet, never something to chase.
      const ok = Math.abs(vv.scale - 1) < 0.01;
      const sane = (v: number) => (ok && Math.abs(v) > 1 && Math.abs(v) < 420 ? v : 0);
      set(sane(bottom), typing() ? 0 : sane(top));
      // A sideways pan (iOS can drift the visible area right while a sheet has the page locked) moves every
      // fixed element off-centre: put it back.
      if (ok && !typing() && Math.abs(vv.offsetLeft) > 1 && window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY });
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(apply); };
    // Re-measure a few times while the screen settles after a resume / rotation.
    const settle = () => {
      timers.forEach(clearTimeout);
      nudged = false;
      set(0, 0);
      timers = [0, 80, 200, 400, 800, 1500, 3000].map((ms) => window.setTimeout(on, ms));
    };
    const vis = () => { if (document.visibilityState === "visible") settle(); };
    vv.addEventListener("resize", on); vv.addEventListener("scroll", on);
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    window.addEventListener("pageshow", settle); window.addEventListener("focus", settle); window.addEventListener("orientationchange", settle);
    document.addEventListener("visibilitychange", vis);
    const out = () => setTimeout(on, 60);
    document.addEventListener("focusout", out);
    document.addEventListener("focusin", on);
    settle();
    return () => {
      vv.removeEventListener("resize", on); vv.removeEventListener("scroll", on);
      window.removeEventListener("scroll", on); window.removeEventListener("resize", on);
      window.removeEventListener("pageshow", settle); window.removeEventListener("focus", settle); window.removeEventListener("orientationchange", settle);
      document.removeEventListener("visibilitychange", vis);
      document.removeEventListener("focusin", on); document.removeEventListener("focusout", out);
      timers.forEach(clearTimeout); if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
