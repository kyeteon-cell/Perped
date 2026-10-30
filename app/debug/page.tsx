"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSession } from "@/lib/hooks/useSession";

/** /debug — what the browser sees of the sign-in state. For fixing login problems; safe to share (no secrets). */
export default function DebugPage() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const s = useSession();
  const [me, setMe] = useState<string>("…");
  const [guest, setGuest] = useState<string>("not tried");
  const [tokenOk, setTokenOk] = useState<string>("…");
  useEffect(() => {
    (async () => {
      const headers = new Headers();
      if (authenticated) {
        const t = await getAccessToken().catch((e) => { setTokenOk(`getAccessToken failed: ${String(e)}`); return null; });
        if (t) { setTokenOk(`token ok (${t.length} chars)`); headers.set("authorization", `Bearer ${t}`); }
        const w = wallets[0]; if (w?.address) headers.set("x-wallet-address", w.address.toLowerCase());
      } else {
        setTokenOk("not authenticated with Privy");
        try { const g = localStorage.getItem("perped:guest"); if (g) headers.set("authorization", `Guest ${g}`); } catch {}
      }
      try { const r = await fetch("/api/me", { headers }); setMe(`${r.status} ${await r.text()}`); } catch (e) { setMe(`fetch failed: ${String(e)}`); }
    })();
  }, [authenticated, wallets, getAccessToken]);
  const tryGuest = async () => {
    setGuest("…");
    try { const r = await fetch("/api/guest", { method: "POST" }); setGuest(`${r.status} ${(await r.text()).slice(0, 400)}`); } catch (e) { setGuest(`fetch failed: ${String(e)}`); }
  };
  const rows: [string, string][] = [
    ["privy ready", String(ready)],
    ["privy authenticated", String(authenticated)],
    ["privy user id", user?.id ?? "—"],
    ["linked accounts", (user?.linkedAccounts ?? []).map((a) => `${a.type}${"walletClientType" in a ? `:${(a as { walletClientType?: string }).walletClientType}` : ""}`).join(", ") || "—"],
    ["wallets (client)", wallets.map((w) => `${w.walletClientType} ${w.address.slice(0, 8)}…`).join(", ") || "—"],
    ["access token", tokenOk],
    ["session.ready / authenticated / isGuest", `${s.ready} / ${s.authenticated} / ${s.isGuest}`],
    ["session.address", s.address ?? "—"],
    ["session.loginError", s.loginError ?? "—"],
    ["session.profile", s.profile ? `@${s.profile.handle}` : s.profileLoading ? "loading" : "none"],
    ["session.linkError", s.linkError ?? "—"],
    ["GET /api/me", me],
    ["POST /api/guest", guest],
    ["origin", typeof window !== "undefined" ? window.location.origin : ""],
    ["user agent", typeof navigator !== "undefined" ? navigator.userAgent : ""],
  ];
  return (
    <main className="px-5 py-6">
      <h1 className="text-xl font-bold">Sign-in debug</h1>
      <p className="muted mt-1 text-sm">Screenshot this page and send it over.</p>
      <div className="mt-4 flex flex-col gap-2">
        {rows.map(([k, v]) => <div key={k} className="card" style={{ padding: "10px 12px" }}><div className="when">{k}</div><div className="mono break-all text-[12px]">{v}</div></div>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn" onClick={tryGuest}>Test guest</button>
        <button className="btn" onClick={() => s.login({ loginMethods: ["twitter"] })}>Test X</button>
        <button className="btn" onClick={() => s.login({ loginMethods: ["email"] })}>Test email</button>
        <button className="btn" onClick={() => s.login({ loginMethods: ["wallet"] })}>Test wallet</button>
        <button className="btn" onClick={() => s.logout()}>Log out</button>
      </div>
    </main>
  );
}
