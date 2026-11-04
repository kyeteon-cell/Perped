"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom sheet. Locks the page behind it (no scroll-through on iOS), mounts at the top of the DOM so nothing
 * on the page can sit over it, and closes on a swipe down from the handle/header or when the sheet's own
 * content is scrolled to the top and pulled further.
 */
export function Sheet({ label, onClose, className = "", children }: { label: string; onClose: () => void; className?: string; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number; fromTop: boolean } | null>(null);

  // Scroll lock without moving the page: overflow hidden on <html> (iOS 16+ honours it). The old trick of fixing
  // <body> in place and scrolling back on close knocked iOS 26's viewport out of line, leaving the nav and the
  // positions pill floating mid-screen after a sheet closed.
  useEffect(() => {
    const h = document.documentElement.style, b = document.body.style;
    const prev = { h: h.overflow, b: b.overflow };
    h.overflow = "hidden"; b.overflow = "hidden";
    return () => { h.overflow = prev.h; b.overflow = prev.b; };
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    const s = el.current; if (!s) return;
    const t = e.touches[0];
    const target = e.target as HTMLElement;
    const inHeader = !!target.closest("[data-sheet-handle]");
    drag.current = { y: t.clientY, dy: 0, fromTop: inHeader || s.scrollTop <= 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current, s = el.current; if (!d || !s) return;
    const dy = e.touches[0].clientY - d.y;
    if (!d.fromTop || dy <= 0) { d.dy = 0; return; }
    // Pulling down from the top: move the sheet with the finger and stop the inner scroll.
    if (s.scrollTop <= 0) { d.dy = dy; s.style.transition = "none"; s.style.transform = `translate(-50%, ${dy}px)`; if (e.cancelable) e.preventDefault(); }
  };
  const onTouchEnd = () => {
    const d = drag.current, s = el.current; drag.current = null; if (!d || !s) return;
    if (d.dy > 90) { s.style.transition = "transform .18s ease-in"; s.style.transform = "translate(-50%, 110%)"; setTimeout(onClose, 160); }
    else { s.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)"; s.style.transform = "translate(-50%, 0)"; }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div ref={el} className={`sheet ${className}`} role="dialog" aria-label={label} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div className="grab-zone" data-sheet-handle><div className="grab" /></div>
        {children}
      </div>
    </>,
    document.body,
  );
}
