"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { Icon, I } from "./ui";
import { DEMO_ENABLED } from "@/lib/config";
import { useLive } from "@/lib/hooks/useLive";

type Method = "twitter" | "google" | "email" | "wallet";

/**
 * The ways in, grouped by what they get you. Social logins land in demo with practice money;
 * connecting a wallet trades real money on Hyperliquid. Each button opens Privy on just that method.
 */
export function SignInOptions({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  const { login, startGuest, restoreGuest, loginError, refreshMe } = useSession();
  const router = useRouter();
  const { allowed: liveOk, gate } = useLive();
  const [busy, setBusy] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [prev, setPrev] = useState<{ token: string; handle: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [key, setKey] = useState("");
  useEffect(() => { try { const t = localStorage.getItem("perped:guest-prev"), h = localStorage.getItem("perped:guest-prev-handle"); if (t) setPrev({ token: t, handle: h ?? "your guest account" }); } catch {} }, []);
  const back = async (token: string) => { setBusy(true); setGuestError(null); try { await restoreGuest(token); await refreshMe(); router.push("/"); } catch (e) { setGuestError(e instanceof Error ? e.message : String(e)); } setBusy(false); };
  const go = (m: Method) => login({ loginMethods: [m] });
  const demo = async () => { setBusy(true); setGuestError(null); try { await startGuest(); await refreshMe(); router.push("/"); } catch (e) { setGuestError(`Guest sign-in failed: ${e instanceof Error ? e.message : String(e)}`); } setBusy(false); };
  const cls = onDark ? "sio dark" : "sio";
  return (
    <div className={`${cls} ${compact ? "compact" : ""}`}>
      <div className="sio-group">
        <div className="sio-head"><span className="demo-tag">Demo</span><span>Practice with $10,000. No wallet needed.</span></div>
        {prev && <button className="sio-continue" disabled={busy} onClick={() => back(prev.token)}><Icon d={I.user} size={16} />{busy ? "…" : `Continue as ${prev.handle}`}</button>}
        <div className="sio-row">
          <button onClick={() => go("twitter")}><Icon d={I.x} size={16} />X</button>
          <button onClick={() => go("google")}><span className="g">G</span>Google</button>
          <button onClick={() => go("email")}><Icon d={I.mail} size={16} />Email</button>
          {DEMO_ENABLED && <button onClick={demo} disabled={busy}><Icon d={I.bolt} size={16} />{busy ? "…" : "Guest"}</button>}
        </div>
      </div>
      {liveOk ? (
        <div className="sio-group">
          <div className="sio-head"><span className="real-tag">Real</span><span>Your wallet becomes your Hyperliquid account.</span></div>
          <div className="sio-row">
            <button className="primary" onClick={() => go("wallet")}><Icon d={I.wallet} size={16} />Connect a wallet · trade real money</button>
          </div>
        </div>
      ) : (
        <div className="sio-group live-off" role="button" tabIndex={0} onClick={gate(() => null)}>
          <div className="sio-head"><span className="real-tag">Real</span><span>Real-money trading opens soon.</span><span className="soon-pill">Soon</span></div>
          <div className="sio-row">
            <button className="primary" onClick={(e) => { e.stopPropagation(); gate(() => null)(); }}><Icon d={I.lock} size={16} />Connect a wallet · coming soon</button>
          </div>
        </div>
      )}
      <div className="mt-2 text-center">
        {!restoring ? <button className="when underline" onClick={() => setRestoring(true)}>Have a guest key? Restore your account</button> : (
          <div className="flex gap-2"><input className="field" style={{ padding: "8px 12px", fontSize: 13 }} placeholder="Paste your guest key" value={key} onChange={(e) => setKey(e.target.value)} /><button className="chip on" disabled={busy || !key.trim()} onClick={() => back(key)}>Restore</button></div>
        )}
      </div>
      {(loginError || guestError) && <p className="red mt-2 text-xs">{loginError ?? guestError}</p>}
    </div>
  );
}
