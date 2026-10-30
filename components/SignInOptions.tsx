"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { Icon, I } from "./ui";
import { DEMO_ENABLED } from "@/lib/config";

type Method = "twitter" | "google" | "email" | "wallet";

/**
 * The ways in, grouped by what they get you. Social logins land in demo with practice money;
 * connecting a wallet trades real money on Hyperliquid. Each button opens Privy on just that method.
 */
export function SignInOptions({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  const { login, startGuest, loginError, refreshMe } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = (m: Method) => login({ loginMethods: [m] });
  const demo = async () => { setBusy(true); try { await startGuest(); await refreshMe(); router.push("/"); } catch {} setBusy(false); };
  const cls = onDark ? "sio dark" : "sio";
  return (
    <div className={`${cls} ${compact ? "compact" : ""}`}>
      <div className="sio-group">
        <div className="sio-head"><span className="demo-tag">Demo</span><span>Practice with $10,000. No wallet needed.</span></div>
        <div className="sio-row">
          <button onClick={() => go("twitter")}><Icon d={I.x} size={16} />X</button>
          <button onClick={() => go("google")}><span className="g">G</span>Google</button>
          <button onClick={() => go("email")}><Icon d={I.mail} size={16} />Email</button>
          {DEMO_ENABLED && <button onClick={demo} disabled={busy}><Icon d={I.bolt} size={16} />{busy ? "…" : "Guest"}</button>}
        </div>
      </div>
      <div className="sio-group">
        <div className="sio-head"><span className="real-tag">Real</span><span>Your wallet becomes your Hyperliquid account.</span></div>
        <div className="sio-row">
          <button className="primary" onClick={() => go("wallet")}><Icon d={I.wallet} size={16} />Connect a wallet · trade real money</button>
        </div>
      </div>
      {loginError && <p className="red mt-2 text-xs">{loginError}</p>}
    </div>
  );
}
