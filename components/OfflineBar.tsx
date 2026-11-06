"use client";

import { useEffect, useState } from "react";

/**
 * Lost signal? A small chip at the top says prices and trades are paused, instead of the app silently showing
 * stale numbers. When signal comes back it says so briefly (SWR refetches what's on screen by itself on reconnect).
 */
export function OfflineBar() {
  const [state, setState] = useState<"online" | "offline" | "back">("online");
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = () => { if (t) clearTimeout(t); setState("offline"); };
    const on = () => {
      setState((s) => (s === "offline" ? "back" : s));
      if (t) clearTimeout(t);
      t = setTimeout(() => setState("online"), 2500);
    };
    try { if (navigator.onLine === false) setState("offline"); } catch {}
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => { if (t) clearTimeout(t); window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, []);
  if (state === "online") return null;
  return (
    <div role="status" aria-live="polite" className={`net-chip ${state === "back" ? "back" : ""}`}>
      {state === "offline" ? "You're offline · prices and trades paused" : "Back online · updating"}
    </div>
  );
}
