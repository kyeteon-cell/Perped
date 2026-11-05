/**
 * The page scrolls inside one panel (#scroller), not the browser window. On iPhone (iOS 26) a scrolling window
 * could reopen half-scrolled with the bottom bars floating mid-screen; a window that never scrolls can't drift.
 * Use these helpers instead of window.scrollY / window.scrollTo.
 */
export const scroller = (): HTMLElement | null => (typeof document === "undefined" ? null : (document.getElementById("scroller") as HTMLElement | null));
export const scrollTopNow = () => scroller()?.scrollTop ?? (typeof window === "undefined" ? 0 : window.scrollY);
export const scrollToTop = (smooth = true) => { const s = scroller(); if (s) s.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" }); else window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" }); };
/** Listen to page scrolling; returns the unsubscribe. */
export function onPageScroll(fn: () => void) {
  const s = scroller() ?? window;
  s.addEventListener("scroll", fn, { passive: true });
  return () => s.removeEventListener("scroll", fn);
}
