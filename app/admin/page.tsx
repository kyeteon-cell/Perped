"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { AdminProgramme } from "@/components/AdminProgramme";

type M = {
  at: string;
  people: { total: number; today: number; week: number; guests: number };
  funnel: { cohort: number; traded: number; battled: number; returned: number };
  trades: { today: number; traders_today: number; week: number; traders_week: number; fades_week: number; copies_week: number };
  volume: { real_today: number; real_week: number; demo_week: number };
  events: { visitors_today: number; visitors_week: number; intro_week: number; quickfade_week: number };
  push: { devices: number; people: number };
  perTraderPerDay: number;
  estFees: { today: number; week: number };
  daily: { day: string; signups: number; trades: number; traders: number }[];
  error?: string;
};

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const usd = (n: number) => `$${n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : n.toFixed(0)}`;

/** /admin?key=… — the numbers that matter, for the founder's phone. The key is remembered on this device. */
export default function Admin() {
  const { authenticated, authedFetch, profile, login } = useSession();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [m, setM] = useState<M | null>(null);
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
    const load = () => call("/api/admin/metrics").then((r) => r.json()).then((j: M) => (j.error ? setErr(j.error) : (setM(j), setErr(null)))).catch((e) => setErr(String(e)));
    load(); const id = setInterval(load, 60_000); return () => clearInterval(id);
  }, [staff, call]);

  if (key === undefined) return <main className="p-5"><p className="muted">Loading…</p></main>;
  if (!staff) return <main className="p-5"><h1 className="text-xl font-extrabold">Admin</h1><p className="muted mt-2 text-sm">{authenticated ? "Your account isn't an admin. Ask the owner to add you." : "Sign in with an admin account."}</p>{!authenticated && <button className="btn ink mt-3" onClick={login}>Sign in</button>}</main>;
  if (err) return <main className="p-5"><p className="red">{err === "unauthorized" ? `Not authorised. Signed in as @${profile?.handle ?? "nobody"}${profile?.role ? ` (${profile.role})` : ""}. Sign out and back in, then try again.` : err}</p></main>;
  if (!m) return <main className="p-5"><p className="muted">Loading…</p></main>;
  const f = m.funnel;
  const tiles: [string, string, string?][] = [
    ["Trades / trader / day", String(m.perTraderPerDay), "the revenue number: fills come from this"],
    ["Trades today", String(m.trades.today), `${m.trades.traders_today} traders`],
    ["Real volume today", usd(m.volume.real_today), `≈ ${usd(m.estFees.today)} fees`],
    ["Real volume 7d", usd(m.volume.real_week), `≈ ${usd(m.estFees.week)} fees · demo ${usd(m.volume.demo_week)}`],
    ["People", String(m.people.total), `+${m.people.today} today · +${m.people.week} this week`],
    ["Visitors today", String(m.events.visitors_today), `${m.events.visitors_week} this week`],
    ["Phone alerts on", String(m.push.people), `${m.push.devices} devices`],
    ["Fades vs copies (7d)", `${m.trades.fades_week} / ${m.trades.copies_week}`, `${m.events.quickfade_week} quick fades opened`],
  ];
  return (
    <main className="px-4 pb-16 pt-5">
      <h1 className="text-xl font-extrabold">Perped admin</h1>
      <AdminProgramme call={call} />
      <h2 className="mt-8 text-[17px] font-extrabold">Numbers</h2>
      <p className="when">Real users only, bots excluded · updated {new Date(m.at).toLocaleTimeString()}</p>
      <div className="adm-grid mt-4">{tiles.map(([k, v, s]) => <div key={k} className="adm-tile"><small>{k}</small><b className="mono">{v}</b>{s && <span>{s}</span>}</div>)}</div>
      <h2 className="mt-6 text-[15px] font-extrabold">Funnel · people who joined in the last 7 days</h2>
      <div className="adm-funnel mt-2">
        {([["Visited", m.events.visitors_week, m.events.visitors_week], ["Finished the intro", m.events.intro_week, m.events.visitors_week], ["Joined", f.cohort, m.events.visitors_week], ["Made a trade", f.traded, f.cohort], ["Got into a fade", f.battled, f.cohort], ["Came back the next day", f.returned, f.cohort]] as [string, number, number][]).map(([k, n, of]) => (
          <div key={k} className="adm-step"><span>{k}</span><b className="mono">{n}</b><em>{pct(n, of)}</em><i style={{ width: of ? `${Math.min(100, (n / of) * 100)}%` : "0%" }} /></div>
        ))}
      </div>
      <h2 className="mt-6 text-[15px] font-extrabold">Last 14 days</h2>
      <table className="adm-table mt-2"><thead><tr><th>Day</th><th>Signups</th><th>Trades</th><th>Traders</th></tr></thead>
        <tbody>{m.daily.map((d) => <tr key={d.day}><td>{d.day}</td><td className="mono">{d.signups}</td><td className="mono">{d.trades}</td><td className="mono">{d.traders}</td></tr>)}</tbody></table>
    </main>
  );
}
