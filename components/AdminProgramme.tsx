"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "./ui";

type Founder = { handle: string; avatarUrl: string | null; seat: number | null; since: string | null; status: string | null; invited: number; invited2: number; realTraders: number; feesIn: number; earned: number; daysIn: number };
type P = {
  me: { role: "owner" | "admin"; handle: string | null };
  seats: { total: number; wave: number; filled: number; graceDays: number };
  founders: Founder[];
  staff: { handle: string; role: string }[];
  waitlist: { waiting: number; batch: number; paused: boolean; next: string; lastRelease?: string };
  month: { paidOut: number; invite: number; invite2: number; creator: number };
  health: { builder: boolean; appUrl: string; cronSecret: boolean; nextRelease: string };
  totals: { people?: number; live?: number; invited?: number; owed?: number };
  live?: { open: boolean; openedAt?: string };
  errors: Record<string, string>;
  error?: string;
};
export type Metrics = {
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
};
type Tab = "overview" | "founders" | "waitlist" | "payouts" | "team" | "tools";
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const usd = (n: number) => `$${n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : n.toFixed(n < 10 ? 2 : 0)}`;

/** Admin: founder seats, the waitlist, admins (owner only), renames (owner only). */
export function AdminProgramme({ call, m }: { call: (url: string, init?: RequestInit) => Promise<Response>; m: Metrics | null }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [who, setWho] = useState(""), [whoRes, setWhoRes] = useState<Record<string, unknown> | null>(null);
  const [p, setP] = useState<P | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [gk, setGk] = useState(""), [gkRes, setGkRes] = useState<{ handle: string; key: string } | null>(null);
  const [f, setF] = useState(""), [wl, setWl] = useState(""), [ad, setAd] = useState(""), [rf, setRf] = useState(""), [rt, setRt] = useState(""), [batch, setBatch] = useState("");
  const [pay, setPay] = useState<{ referrers: { handle: string; address: string; payable?: boolean; owedUsd: number; earnedUsd: number; paidUsd: number }[]; totals: { totalOwedUsd: number } } | null>(null);
  const loadPay = useCallback(() => call("/api/admin/referrals").then((r) => (r.ok ? r.json() : null)).then((j) => j && !j.error && setPay(j)).catch(() => null), [call]);
  useEffect(() => { loadPay(); }, [loadPay]);
  const load = useCallback(() => call("/api/admin/programme").then((r) => r.json()).then((j: P) => (j.error ? setMsg(j.error) : setP(j))).catch(() => null), [call]);
  useEffect(() => { load(); }, [load]);
  const act = async (body: Record<string, unknown>, ok: (j: Record<string, unknown>) => string) => {
    setMsg("Working…");
    const j = await call("/api/admin/programme", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "network" }));
    setMsg(j.error ? (j.error === "taken" ? `@${(j.holder as { handle: string }).handle} is taken: ${(j.holder as { bot: boolean }).bot ? "a bot" : "a real account"} with ${(j.holder as { posts: number }).posts} posts. Tap "Take it" to move them to ${String(body.to)}_1.` : String(j.error)) : ok(j));
    if (!j.error) load();
    return j;
  };
  if (!p) return <div className="adm-card mt-4"><p className="muted text-sm">{msg ?? "Loading…"}</p><button className="btn mt-2" onClick={load}>Retry</button></div>;
  const owner = p.me.role === "owner";
  const seatMap = new Map(p.founders.filter((x) => x.seat != null).map((x) => [x.seat!, x]));
  const h = p.health, t = p.totals;
  const tabs: [Tab, string, string?][] = [["overview", "Overview"], ["founders", "Founders", `${p.seats.filled}`], ["waitlist", "Waitlist", p.waitlist.waiting ? `${p.waitlist.waiting}` : undefined], ...(owner ? [["payouts", "Payouts", (t.owed ?? 0) >= 0.01 ? usd(t.owed ?? 0) : undefined] as [Tab, string, string?]] : []), ["team", "Team"], ["tools", "Tools"]];
  const checks: [string, boolean, string][] = [
    ["Builder address", h.builder, h.builder ? "fees are being collected" : "not set: no fees, no earnings until it is"],
    ["Domain", !/vercel\.app|localhost/.test(h.appUrl), h.appUrl.replace(/^https?:\/\//, "")],
    ["Scheduled jobs", h.cronSecret, h.cronSecret ? "earnings daily, waitlist Mondays 9pm" : "CRON_SECRET missing"],
    ["Database", !Object.keys(p.errors).length, Object.keys(p.errors).length ? `${Object.keys(p.errors).length} section(s) failed to load` : "all queries OK"],
  ];
  const fn = m?.funnel;
  return (
    <div className="mt-3">
      <div className="adm-kpis">
        <div><small>Fees 7d</small><b className="mono">{m ? usd(m.estFees.week) : "…"}</b><span>{m ? usd(m.volume.real_week) : ""} real volume</span></div>
        <div><small>People</small><b className="mono">{t.people ?? m?.people.total ?? "…"}</b><span>{t.live ?? 0} trading real</span></div>
        <div><small>Trades today</small><b className="mono">{m?.trades.today ?? "…"}</b><span>{m?.trades.traders_today ?? 0} traders</span></div>
        <div><small>Founders</small><b className="mono">{p.seats.filled}<em>/{p.seats.total}</em></b><span>{Math.max(0, p.seats.wave - p.seats.filled)} open now</span></div>
        <div><small>Waitlist</small><b className="mono">{p.waitlist.waiting}</b><span>{p.waitlist.paused ? "paused" : `next ${new Date(p.waitlist.next).toLocaleDateString("en-GB", { weekday: "short" })} 9pm`}</span></div>
        <div><small>Owed</small><b className="mono">{usd(Math.max(0, t.owed ?? 0))}</b><span>to pay out</span></div>
      </div>

      <section className={`inv-card mt-3 live-switch ${p.live?.open ? "is-open" : ""}`}>
        <div className="flex items-center justify-between gap-2"><span className="eyebrow">Real-money trading</span><span className={`adm-st ${p.live?.open ? "ok" : "warn"}`}>{p.live?.open ? "OPEN" : "DEMO ONLY"}</span></div>
        <p className="when mt-1.5">{p.live?.open ? "Anyone with access can trade real money. Closing it moves everyone except staff back to demo." : "Everyone trades demo. Real-money buttons show Coming soon. You and admins can still test real trades."}</p>
        {owner
          ? <button className={`btn mt-3 ${p.live?.open ? "" : "brand"}`} style={{ padding: 12, fontSize: 14 }} onClick={() => confirm(p.live?.open ? "Close real-money trading? Everyone goes back to demo." : "Open real-money trading for everyone with access?") && act({ action: "live", open: !p.live?.open }, (j) => ((j.live as { open: boolean }).open ? "Real money is open" : "Real money is closed, demo only"))}>{p.live?.open ? "Close real money" : "Open real money"}</button>
          : <p className="when mt-2">Only the owner can open or close it.</p>}
      </section>

      <div className="adm-tabs" role="tablist">{tabs.map(([k, label, badge]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setMsg(null); }}>{label}{badge && <small>{badge}</small>}</button>)}</div>
      {msg && <div className="adm-msg mt-3">{msg}</div>}
      {Object.keys(p.errors).length > 0 && <div className="adm-msg bad mt-3">{Object.entries(p.errors).map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}</div>}

      <div className="mt-3 grid gap-3">
      {tab === "overview" && (
        <>
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">System status</span><button className="when underline" onClick={load}>refresh</button></div>
            <div className="adm-checks">{checks.map(([k, ok, d]) => <div key={k}><i className={ok ? "ok" : "bad"} /><b>{k}</b><span>{d}</span></div>)}</div>
          </section>
          {m && (
            <>
              <div className="adm-grid">{([
                ["Trades / trader / day", String(m.perTraderPerDay), "the revenue number"],
                ["Real volume today", usd(m.volume.real_today), `≈ ${usd(m.estFees.today)} fees`],
                ["Visitors today", String(m.events.visitors_today), `${m.events.visitors_week} this week`],
                ["New people", `+${m.people.today}`, `+${m.people.week} this week`],
                ["Fades / copies 7d", `${m.trades.fades_week} / ${m.trades.copies_week}`, `${m.events.quickfade_week} quick fades opened`],
                ["Phone alerts on", String(m.push.people), `${m.push.devices} devices`],
              ] as [string, string, string][]).map(([k, v, s2]) => <div key={k} className="adm-tile"><small>{k}</small><b className="mono">{v}</b><span>{s2}</span></div>)}</div>
              <section className="inv-card">
                <span className="eyebrow">Funnel · joined in the last 7 days</span>
                <div className="adm-funnel mt-2">
                  {([["Visited", m.events.visitors_week, m.events.visitors_week], ["Finished the intro", m.events.intro_week, m.events.visitors_week], ["Joined", fn!.cohort, m.events.visitors_week], ["Made a trade", fn!.traded, fn!.cohort], ["Got into a fade", fn!.battled, fn!.cohort], ["Came back the next day", fn!.returned, fn!.cohort]] as [string, number, number][]).map(([k, n, of]) => (
                    <div key={k} className="adm-step"><span>{k}</span><b className="mono">{n}</b><em>{pct(n, of)}</em><i style={{ width: of ? `${Math.min(100, (n / of) * 100)}%` : "0%" }} /></div>
                  ))}
                </div>
              </section>
              <section className="inv-card">
                <span className="eyebrow">Last 14 days</span>
                <table className="adm-table mt-2"><thead><tr><th>Day</th><th>Signups</th><th>Trades</th><th>Traders</th></tr></thead>
                  <tbody>{m.daily.map((d) => <tr key={d.day}><td>{d.day.slice(5)}</td><td className="mono">{d.signups}</td><td className="mono">{d.trades}</td><td className="mono">{d.traders}</td></tr>)}</tbody></table>
              </section>
            </>
          )}
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">Earnings paid out · this month</span></div>
            <div className="inv-split"><div><small>Invites</small><b className="mono">{usd(p.month.invite)}</b></div><div><small>2nd level</small><b className="mono">{usd(p.month.invite2)}</b></div><div><small>Copies &amp; fades</small><b className="mono">{usd(p.month.creator)}</b></div></div>
            <p className="when mt-2">Total {usd(p.month.paidOut)} earned by users this month, out of fees collected.</p>
          </section>

        </>
      )}

      {tab === "founders" && (
        <>
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">Founder seats</span><span className="when"><b style={{ color: "var(--text)" }}>{p.seats.filled}</b> filled · {Math.max(0, p.seats.wave - p.seats.filled)} open in wave 1 · {p.seats.total - p.seats.wave} held back</span></div>
            <div className="adm-seats">{Array.from({ length: p.seats.total }, (_, i) => i + 1).map((n) => <i key={n} title={seatMap.get(n)?.handle ?? `#${n}`} className={seatMap.has(n) ? "f" : n <= p.seats.wave ? "w" : ""} />)}</div>
            <div className="inv-input"><input value={f} onChange={(e) => setF(e.target.value)} placeholder="@handle to make a founder" autoCapitalize="none" /><button disabled={!f.trim()} onClick={() => act({ action: "addFounder", handle: f }, (j) => `@${j.handle} is Founder #${j.seat}`).then(() => setF(""))}>Add</button></div>
          </section>

          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">Founders</span><span className="when">sorted by fees brought in</span></div>
            {p.founders.length ? p.founders.map((x) => {
              const expired = x.status === "expired", secured = x.realTraders > 0, left = p.seats.graceDays - x.daysIn;
              return (
                <div key={x.handle} className="adm-row">
                  <span className="mono gold">{x.seat != null ? `#${x.seat}` : "–"}</span>
                  <Avatar handle={x.handle} url={x.avatarUrl} size={30} link={false} />
                  <div className="min-w-0 flex-1"><b className="block truncate text-[14px]">{x.handle}</b><span className="when">{x.invited} invited · {x.invited2} by them · {x.realTraders} trading real · {usd(x.feesIn)} fees · earned {usd(x.earned)}</span></div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`adm-st ${expired ? "bad" : secured || !p.live?.open ? "ok" : left <= 14 ? "warn" : "ok"}`}>{expired ? "EXPIRED" : secured ? "ACTIVE" : !p.live?.open ? "CLOCK PAUSED" : `${Math.max(0, left)}D LEFT`}</span>
                    <Link className="when underline" href={`/founder?handle=${x.handle}`}>dashboard</Link>
                    {!expired && <button className="when underline" onClick={() => confirm(`Remove @${x.handle} as a founder?`) && act({ action: "removeFounder", handle: x.handle }, () => `@${x.handle} removed`)}>remove</button>}
                  </div>
                </div>
              );
            }) : <p className="when mt-1">No founders yet. Add the first one above.</p>}
          </section>

        </>
      )}

      {tab === "waitlist" && (
        <>
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">Waitlist</span><span className="when"><b style={{ color: "var(--text)" }}>{p.waitlist.waiting}</b> waiting</span></div>
            <p className="mt-1 text-[14px]"><b>{p.waitlist.paused ? "Paused" : `Next release: ${new Date(p.waitlist.next).toLocaleString("en-GB", { weekday: "long", hour: "numeric", minute: "2-digit" })}`}</b><span className="when ml-1.5">{p.waitlist.batch} people · oldest first</span></p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="inv-input" style={{ marginTop: 0 }}><input value={batch} onChange={(e) => setBatch(e.target.value)} inputMode="numeric" placeholder={`Weekly: ${p.waitlist.batch}`} /><button disabled={!batch} onClick={() => act({ action: "waitlist", batch: Number(batch) }, () => `Weekly release set to ${batch}`).then(() => setBatch(""))}>Set</button></div>
              <button className="btn" onClick={() => act({ action: "waitlist", paused: !p.waitlist.paused }, () => (p.waitlist.paused ? "Weekly release resumed" : "Weekly release paused"))}>{p.waitlist.paused ? "Resume" : "Pause"}</button>
            </div>
            <div className="inv-input"><input value={wl} onChange={(e) => setWl(e.target.value)} placeholder="Let in now: a number or @handle" autoCapitalize="none" /><button disabled={!wl.trim()} onClick={() => { const n = Number(wl.trim()); act(Number.isFinite(n) && n > 0 ? { action: "letIn", count: n } : { action: "letIn", handle: wl }, (j) => (j.released != null ? `Let ${j.released} in` : `@${j.handle} let in`)).then(() => setWl("")); }}>Let in</button></div>
          </section>

          <section className="inv-card">
            <span className="eyebrow">Run now</span>
            <p className="when mt-1">Let the next batch of {p.waitlist.batch} in right now instead of waiting for Monday.</p>
            <button className="btn mt-2 w-full" onClick={() => confirm(`Let ${p.waitlist.batch} people in now?`) && act({ action: "releaseNow" }, (j) => `Let ${j.released} in`)}>Release a batch now</button>
          </section>
        </>
      )}

      {tab === "payouts" && owner && (
        <>
          {owner && (
            <section className="inv-card">
              <div className="flex items-center justify-between"><span className="eyebrow">Payouts</span><span className="when">owed in total <b style={{ color: "var(--text)" }}>{usd(pay?.totals.totalOwedUsd ?? 0)}</b></span></div>
              <p className="when mt-1">Each Monday: copy a wallet, send the USDC on Hyperliquid, then tap Paid to record it. They get an alert.</p>
              {(pay?.referrers ?? []).filter((x) => x.owedUsd >= 0.01).length ? (pay!.referrers.filter((x) => x.owedUsd >= 0.01).map((x) => (
                <div key={x.handle} className="adm-row">
                  <div className="min-w-0 flex-1"><b className="block truncate text-[14px]">@{x.handle}</b>{x.payable === false ? <span className="when red">no wallet yet: ask them to connect one</span> : <button className="when mono underline" onClick={() => navigator.clipboard?.writeText(x.address).then(() => setMsg(`Copied @${x.handle}'s wallet`))}>{x.address.slice(0, 6)}…{x.address.slice(-4)} · copy</button>}</div>
                  <b className="mono green">{usd(x.owedUsd)}</b>
                  {x.payable !== false && <button className="adm-paid" onClick={async () => {
                    const tx = prompt(`Sent ${usd(x.owedUsd)} to @${x.handle}? Paste the transaction hash (optional):`, "");
                    if (tx === null) return;
                    setMsg("Recording…");
                    const j = await call("/api/admin/referrals", { method: "POST", body: JSON.stringify({ handle: x.handle, amountUsd: Number(x.owedUsd.toFixed(2)), txHash: tx || undefined }) }).then((r) => r.json()).catch(() => ({ error: "network" }));
                    setMsg(j.error ? String(j.error) : `Recorded ${usd(x.owedUsd)} to @${x.handle}`); loadPay();
                  }}>Paid</button>}
                </div>
              ))) : <p className="when mt-2">Nobody is owed anything yet. Earnings start once the builder address is set and invited people trade real money.</p>}
            </section>
          )}

        </>
      )}

      {tab === "team" && (
        <>
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">Admins</span><span className="when">{owner ? "only you can change these" : "set by the owner"}</span></div>
            {p.staff.map((x) => (
              <div key={x.handle} className="adm-row"><b className="flex-1 text-[14px]">@{x.handle}</b><span className={`adm-st ${x.role === "owner" ? "warn" : "ok"}`}>{x.role.toUpperCase()}</span>
                {owner && x.role === "admin" && <button className="when underline" onClick={() => confirm(`Remove @${x.handle} as admin?`) && act({ action: "removeAdmin", handle: x.handle }, () => `@${x.handle} is no longer an admin`)}>remove</button>}</div>
            ))}
            {owner && <div className="inv-input"><input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="@handle to make an admin" autoCapitalize="none" /><button disabled={!ad.trim()} onClick={() => act({ action: "addAdmin", handle: ad }, (j) => `@${j.handle} is now an admin`).then(() => setAd(""))}>Add</button></div>}
          </section>

        </>
      )}

      {tab === "tools" && (
        <>
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">Preview the earnings page</span><span className="when">staff only</span></div>
            <p className="when mt-1">See the Invite page exactly as each tier sees it, with your own numbers.</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([["founder", "Founder"], ["regular", "Regular"], ["demo", "Demo"]] as const).map(([k, l]) => <Link key={k} href={`/invite?as=${k}`} className="btn" style={{ padding: 10, fontSize: 13 }}>{l}</Link>)}
            </div>
          </section>
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">Look up an account</span></div>
            <div className="inv-input"><input value={who} onChange={(e) => setWho(e.target.value)} placeholder="@handle" autoCapitalize="none" /><button disabled={!who.trim()} onClick={async () => { const j = await act({ action: "whois", handle: who }, (r) => (r.user ? `Found @${(r.user as { handle: string }).handle}` : "No account with that handle")); setWhoRes((j.user as Record<string, unknown>) ?? null); }}>Look up</button></div>
            {whoRes && <div className="adm-kv mt-2">{Object.entries(whoRes).filter(([, v]) => v !== undefined).map(([k, v]) => <div key={k}><span>{k}</span><b className="mono">{String(v)}</b></div>)}</div>}
          </section>
          {owner && (
            <section className="inv-card">
              <div className="flex items-center justify-between"><span className="eyebrow">Rename an account</span><span className="when">old links redirect</span></div>
              <div className="mt-2 grid grid-cols-2 gap-2"><div className="inv-input" style={{ marginTop: 0 }}><input value={rf} onChange={(e) => setRf(e.target.value)} placeholder="from @handle" autoCapitalize="none" /></div><div className="inv-input" style={{ marginTop: 0 }}><input value={rt} onChange={(e) => setRt(e.target.value)} placeholder="to @handle" autoCapitalize="none" /></div></div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="btn" disabled={!rf.trim() || !rt.trim()} onClick={() => act({ action: "rename", from: rf, to: rt }, (j) => `@${j.from} is now @${j.to}`)}>Rename</button>
                <button className="btn" disabled={!rf.trim() || !rt.trim()} onClick={() => confirm(`If @${rt} is taken, its holder becomes @${rt}_1. Go ahead?`) && act({ action: "rename", from: rf, to: rt, bump: true }, (j) => `@${j.from} is now @${j.to}${j.moved ? ` (the old holder is now @${(j.moved as { to: string }).to})` : ""}`)}>Take it</button>
              </div>
            </section>
          )}
          {owner && (
            <section className="inv-card">
              <div className="flex items-center justify-between"><span className="eyebrow">Recover a guest key</span></div>
              <p className="when mt-1">For someone who lost their guest key. Only give it to the account&rsquo;s owner: the key is the login.</p>
              <div className="inv-input"><input value={gk} onChange={(e) => setGk(e.target.value)} placeholder="@guest handle" autoCapitalize="none" /><button disabled={!gk.trim()} onClick={async () => { const j = await act({ action: "guestKey", handle: gk }, (r) => `Key for @${r.handle}`); setGkRes(j.key ? { handle: String(j.handle), key: String(j.key) } : null); }}>Get key</button></div>
              {gkRes && <div className="mt-2"><div className="mono break-all text-[12px]">{gkRes.key}</div><button className="chip mt-2" onClick={async () => { try { await navigator.clipboard.writeText(gkRes.key); setMsg(`Copied @${gkRes.handle}'s key`); } catch {} }}>Copy key</button></div>}
            </section>
          )}
          <section className="inv-card">
            <span className="eyebrow">Maintenance</span>
            <p className="when mt-1">{p.live?.open ? <>Founder seats with no real-money trader after {p.seats.graceDays} days are freed automatically every hour. Run it now if you want.</> : <>Paused while real money is closed: nobody can bring in a real trader yet, so no seat expires. The {p.seats.graceDays}-day clock starts when you open trading.</>}</p>
            <button className="btn mt-2 w-full" onClick={() => act({ action: "expireFounders" }, (j) => `${j.expired} idle seat(s) freed`)}>Free idle founder seats now</button>
          </section>
        </>
      )}
      </div>
    </div>
  );
}
