"use client";

import { Glyph } from "./Glyph";
import { useEffect, useState } from "react";
import { usePush } from "@/lib/hooks/usePush";
import { useSession } from "@/lib/hooks/useSession";

/** "Turn on alerts" card. `compact` is the inline row for Settings. Hidden when on, unsupported or dismissed. */
export function PushPrompt({ compact = false }: { compact?: boolean }) {
  const { authenticated } = useSession();
  const { state, busy, enable, disable } = usePush();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { try { setDismissed(localStorage.getItem("perped:push-dismissed") === "1"); } catch {} }, []);
  if (!authenticated || state === "loading" || state === "unsupported") return null;

  if (compact) {
    return (
      <div className="srow">
        <span>Phone alerts{state === "ios-install" ? " · add Perped to your Home Screen first" : state === "denied" ? " · blocked in your browser settings" : ""}</span>
        {state === "on" ? <button className="chip on" onClick={disable} disabled={busy}>On</button>
          : state === "off" ? <button className="chip" onClick={enable} disabled={busy}>{busy ? "…" : "Off"}</button> : <span className="when">—</span>}
      </div>
    );
  }
  if (dismissed || state === "on" || state === "denied") return null;
  const close = () => { setDismissed(true); try { localStorage.setItem("perped:push-dismissed", "1"); } catch {} };
  return (
    <div className="pushcard">
      <div className="pushcard-ic"><Glyph n="bell" tone="gold" /></div>
      <div className="min-w-0 flex-1">
        <b>Don&rsquo;t miss a fade</b>
        {state === "ios-install"
          ? <p>On iPhone: tap <b>Share</b> → <b>Add to Home Screen</b>, open Perped from there, then turn alerts on here.</p>
          : <p>Get a ping when someone fades you, a rival trades, or a fade turns into a bloodbath.</p>}
        <div className="mt-2 flex gap-2">
          {state === "off" && <button className="chip on" onClick={enable} disabled={busy}>{busy ? "Turning on…" : "Turn on alerts"}</button>}
          <button className="chip" onClick={close}>Not now</button>
        </div>
      </div>
    </div>
  );
}
