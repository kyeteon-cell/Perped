"use client";


import { tt } from "@/lib/i18n";
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
        <span>{tt("Phone alerts")}{state === "ios-install" ? tt(" · add Perped to your Home Screen first") : state === "denied" ? tt(" · blocked in your browser settings") : ""}</span>
        {state === "on" ? <button className="chip on" onClick={disable} disabled={busy}>{tt("On")}</button>
          : state === "off" ? <button className="chip" onClick={enable} disabled={busy}>{busy ? "…" : tt("Off")}</button> : <span className="when">—</span>}
      </div>
    );
  }
  if (dismissed || state === "on" || state === "denied") return null;
  const close = () => { setDismissed(true); try { localStorage.setItem("perped:push-dismissed", "1"); } catch {} };
  return (
    <div className="pushcard">
      <div className="pushcard-ic"><Glyph n="bell" tone="gold" /></div>
      <div className="min-w-0 flex-1">
        <b>{tt("Don’t miss a fade")}</b>
        {state === "ios-install"
          ? <p>{tt("On iPhone: tap")}{" "}<b>{tt("Share")}</b> → <b>{tt("Add to Home Screen")}</b>{tt(", open Perped from there, then turn alerts on here.")}</p>
          : <p>{tt("Get a ping when someone fades you, a rival trades, or a fade turns into a bloodbath.")}</p>}
        <div className="mt-2 flex gap-2">
          {state === "off" && <button className="chip on" onClick={enable} disabled={busy}>{busy ? tt("Turning on…") : tt("Turn on alerts")}</button>}
          <button className="chip" onClick={close}>{tt("Not now")}</button>
        </div>
      </div>
    </div>
  );
}
