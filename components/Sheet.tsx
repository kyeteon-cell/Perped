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

  // Scroll lock: fix the body in place and restore the scroll position on close.
  useEffect(() => {
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow };
    b.position = "fixed"; b.top = `-${y}px`; b.width = "100%"; b.overflow = "hidden";
    return () => { b.position = prev.position; b.top = prev.top; b.width = prev.width; b.overflow = prev.overflow; window.scrollTo(0, y); };
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
