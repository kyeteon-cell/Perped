"use client";


import { tt } from "@/lib/i18n";
import { useEffect, useState } from "react";

const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/**
 * Keeps the installed app on the latest version. An app left open (or resumed from the background) keeps running
 * the code it loaded, so fixes didn't reach people until they force-closed it. When a newer version is live:
 * coming back to the app reloads it straight away; if you're in the middle of using it, a small "Update" chip
 * appears instead, so nothing reloads under your finger.
 */
export function UpdateCheck() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (MINE === "dev") return;
    let stale = false;
    const check = async () => {
      const r = await fetch("/api/version", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (r?.build && r.build !== "dev" && r.build !== MINE) { stale = true; setReady(true); }
      return stale;
    };
    const busy = () => { const a = document.activeElement as HTMLElement | null; return !!document.querySelector(".sheet, .mo-cer, .aint") || (!!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")); };
    const onVis = async () => {
      if (document.visibilityState !== "visible") return;
      if ((stale || (await check())) && !busy()) window.location.reload();
    };
    check();
    const t = setInterval(check, 5 * 60_000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pageshow", onVis); };
  }, []);
  if (!ready) return null;
  return <button type="button" className="upd-chip" onClick={() => window.location.reload()}>{tt("New version ready · Update")}</button>;
}
