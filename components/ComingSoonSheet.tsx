"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sheet } from "./Sheet";
import { Glyph } from "./Glyph";
import { Icon, I } from "./ui";
import { useSession } from "@/lib/hooks/useSession";
import { useLive } from "@/lib/hooks/useLive";

const X_URL = "https://x.com/perped_";

/**
 * "Real money is coming soon". Opens on the "perped:coming-soon" event (openComingSoon()) from any greyed-out
 * real-money button. Turns the dead end into: Season 0 counts, get early access, follow @perped_.
 */
export function ComingSoonSheet() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { authenticated, isGuest, profile, authedFetch, login, linkX } = useSession();
  const { status, refresh } = useLive();
  const path = usePathname();

  useEffect(() => {
    const h = () => { setShow(true); setErr(null); refresh(); };
    window.addEventListener("perped:coming-soon", h);
    return () => window.removeEventListener("perped:coming-soon", h);
  }, [refresh]);
  useEffect(() => { setShow(false); }, [path]);
  if (!show) return null;

  const join = async () => {
    // Guests attach X to the account they already have, so their Season 0 record comes with them.
    if (isGuest) { setShow(false); linkX(); return; }
    if (!authenticated) { setShow(false); login(); return; }
    setBusy(true); setErr(null);
    try {
      const j = await authedFetch("/api/live", { method: "POST" }).then((r) => r.json());
      if (j.error) setErr(j.error); else await refresh();
    } catch { setErr("Couldn't reach Perped. Try again."); }
    setBusy(false);
  };

  const signedIn = authenticated && !isGuest && !!profile;
  let cta: React.ReactNode;
  if (signedIn && status?.early) cta = <div className="cs-state"><Icon d={I.check} size={16} />You&rsquo;ve got early access. You&rsquo;ll be first in.</div>;
  else if (signedIn && status?.joined) cta = <div className="cs-state"><Icon d={I.check} size={16} />You&rsquo;re on the list{status.place ? <> &middot; <b className="mono">#{status.place.toLocaleString()}</b> in line</> : null}</div>;
  else cta = <button className="btn brand w-full" style={{ padding: 13, fontSize: 15 }} disabled={busy} onClick={join}>{busy ? "…" : isGuest ? "Sign in with X for early access" : signedIn ? "Get early access" : "Sign in for early access"}</button>;

  return (
    <Sheet label="Real money is coming soon" onClose={() => setShow(false)}>
      <div className="cs px-5 pb-6">
        <div className="cs-badge"><Icon d={I.lock} size={14} />Real money · coming soon</div>
        <h2 className="mt-2 text-[22px] font-extrabold leading-tight">Real trading opens soon</h2>
        <p className="muted mt-1.5 text-[14px] leading-relaxed">Perped is demo only while we get ready. Every trade runs on live Hyperliquid prices with $10,000 of practice money, so nothing is at risk.</p>

        <div className="cs-season">
          <span className="cs-ico"><Glyph n="trophy" /></span>
          <div><b>Season 0 counts</b><p className="when mt-0.5">Your XP, rank, record and wins carry over when real money opens. Climb now, start ahead.</p></div>
        </div>

        <div className="mt-4">{cta}</div>
        {err && <p className="red mt-2 text-xs">{err}</p>}

        <a className="cs-x" href={X_URL} target="_blank" rel="noopener noreferrer">
          <span className="cs-ico x"><Icon d={I.x} size={16} /></span>
          <span className="flex-1"><b>Follow @perped_ on X</b><span className="when block">Launch date and early-access drops land there first</span></span>
          <span aria-hidden>→</span>
        </a>

        <button className="btn ghost mt-3 w-full" style={{ padding: 12, fontSize: 14 }} onClick={() => setShow(false)}>Keep practising</button>
      </div>
    </Sheet>
  );
}

/** Inline note for pages that explain real-money trading: shows only while it's closed. */
export function LiveSoonNote() {
  const { allowed, loaded, gate } = useLive();
  if (!loaded || allowed) return null;
  return (
    <button className="cs-note" onClick={gate(() => null)}>
      <Icon d={I.lock} size={16} />
      <span><b>Real money opens soon.</b> Perped is demo only for now. Everything below is how it will work. Tap for early access.</span>
    </button>
  );
}
