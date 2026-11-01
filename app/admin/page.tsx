"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { AdminProgramme, type Metrics } from "@/components/AdminProgramme";

/** /admin?key=… — the numbers that matter, for the founder's phone. The key is remembered on this device. */
export default function Admin() {
  const { authenticated, authedFetch, profile, login } = useSession();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let k: string | null = null;
    try { k = new URLSearchParams(window.location.search).get("key") || localStorage.getItem("perped:admin-key"); if (k) localStorage.setItem("perped:admin-key", k); } catch {}
    setKey(k);
  }, []);
  // Signed-in admins and the owner get in with their account; the CRON_SECRET key still works for scripts.
  // Always send your login; add the saved key too if there is one. Either is enough on the server, so an old
  // or wrong saved key can't lock the owner out. A key that doesn't work is forgotten.
  const call = useCallback(async (url: string, init?: RequestInit) => {
    const u = new URL(url, window.location.origin);
    if (key) u.searchParams.set("key", key);
    const r = await authedFetch(u.pathname + u.search, init);
    if (r.status === 401 && key) { try { localStorage.removeItem("perped:admin-key"); } catch {} setKey(null); return authedFetch(url, init); }
    return r;
  }, [key, authedFetch]);
  const staff = !!key || profile?.role === "owner" || profile?.role === "admin";
  useEffect(() => {
    if (!staff) return;
    const load = () => call("/api/admin/metrics").then((r) => r.json()).then((j: Metrics & { error?: string }) => (j.error ? setErr(j.error) : (setM(j), setErr(null)))).catch((e) => setErr(String(e)));
    load(); const id = setInterval(load, 60_000); return () => clearInterval(id);
  }, [staff, call]);

  if (key === undefined) return <main className="p-5"><p className="muted">Loading…</p></main>;
  if (!staff) return <main className="p-5"><h1 className="text-xl font-extrabold">Admin</h1><p className="muted mt-2 text-sm">{authenticated ? "Your account isn't an admin. Ask the owner to add you." : "Sign in with an admin account."}</p>{!authenticated && <button className="btn ink mt-3" onClick={login}>Sign in</button>}</main>;
  if (err) return <main className="p-5"><p className="red">{err === "unauthorized" ? `Not authorised. Signed in as @${profile?.handle ?? "nobody"}${profile?.role ? ` (${profile.role})` : ""}. Sign out and back in, then try again.` : err}</p></main>;
  if (!m) return <main className="p-5"><p className="muted">Loading…</p></main>;
  return (
    <main className="px-4 pb-16 pt-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-extrabold">Perped control</h1><p className="when">Live · updated {new Date(m.at).toLocaleTimeString()}</p></div>
        <span className="adm-role">{profile?.role === "admin" ? "ADMIN" : "OWNER"}</span>
      </div>
      <AdminProgramme call={call} m={m} />
    </main>
  );
}
