"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "./ui";

type Founder = { handle: string; avatarUrl: string | null; seat: number | null; since: string | null; status: string | null; invited: number; invited2: number; realTraders: number; feesIn: number; earned: number; daysIn: number };
type P = {
  me: { role: "owner" | "admin"; handle: string | null };
  seats: { total: number; wave: number; filled: number; graceDays: number };
  founders: Founder[];
  staff: { handle: string; role: string }[];
  waitlist: { waiting: number; batch: number; paused: boolean; next: string; lastRelease?: string };
  month: { paidOut: number; invite: number; invite2: number; creator: number };
  error?: string;
};
const usd = (n: number) => `$${n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : n.toFixed(n < 10 ? 2 : 0)}`;

/** Admin: founder seats, the waitlist, admins (owner only), renames (owner only). */
export function AdminProgramme({ call }: { call: (url: string, init?: RequestInit) => Promise<Response> }) {
  const [p, setP] = useState<P | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState(""), [wl, setWl] = useState(""), [ad, setAd] = useState(""), [rf, setRf] = useState(""), [rt, setRt] = useState(""), [batch, setBatch] = useState("");
  const [pay, setPay] = useState<{ referrers: { handle: string; address: string; owedUsd: number; earnedUsd: number; paidUsd: number }[]; totals: { totalOwedUsd: number } } | null>(null);
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
  if (!p) return <p className="muted mt-3 text-sm">{msg ?? "Loading programme…"}</p>;
  const owner = p.me.role === "owner";
  const seatMap = new Map(p.founders.filter((x) => x.seat != null).map((x) => [x.seat!, x]));
  return (
    <div className="mt-4 grid gap-3">
      {msg && <div className="adm-msg">{msg}</div>}

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
                <span className={`adm-st ${expired ? "bad" : secured ? "ok" : left <= 14 ? "warn" : "ok"}`}>{expired ? "EXPIRED" : secured ? "ACTIVE" : `${Math.max(0, left)}D LEFT`}</span>
                {!expired && <button className="when underline" onClick={() => confirm(`Remove @${x.handle} as a founder?`) && act({ action: "removeFounder", handle: x.handle }, () => `@${x.handle} removed`)}>remove</button>}
              </div>
            </div>
          );
        }) : <p className="when mt-1">No founders yet. Add the first one above.</p>}
      </section>

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
        <div className="flex items-center justify-between"><span className="eyebrow">Earnings paid out · this month</span></div>
        <div className="inv-split"><div><small>Invites</small><b className="mono">{usd(p.month.invite)}</b></div><div><small>2nd level</small><b className="mono">{usd(p.month.invite2)}</b></div><div><small>Copies &amp; fades</small><b className="mono">{usd(p.month.creator)}</b></div></div>
        <p className="when mt-2">Total {usd(p.month.paidOut)} earned by users this month, out of fees collected.</p>
      </section>

      {owner && (
        <section className="inv-card">
          <div className="flex items-center justify-between"><span className="eyebrow">Payouts</span><span className="when">owed in total <b style={{ color: "var(--text)" }}>{usd(pay?.totals.totalOwedUsd ?? 0)}</b></span></div>
          <p className="when mt-1">Each Monday: copy a wallet, send the USDC on Hyperliquid, then tap Paid to record it. They get an alert.</p>
          {(pay?.referrers ?? []).filter((x) => x.owedUsd >= 0.01).length ? (pay!.referrers.filter((x) => x.owedUsd >= 0.01).map((x) => (
            <div key={x.handle} className="adm-row">
              <div className="min-w-0 flex-1"><b className="block truncate text-[14px]">@{x.handle}</b><button className="when mono underline" onClick={() => navigator.clipboard?.writeText(x.address).then(() => setMsg(`Copied @${x.handle}'s wallet`))}>{x.address.slice(0, 6)}…{x.address.slice(-4)} · copy</button></div>
              <b className="mono green">{usd(x.owedUsd)}</b>
              <button className="adm-paid" onClick={async () => {
                const tx = prompt(`Sent ${usd(x.owedUsd)} to @${x.handle}? Paste the transaction hash (optional):`, "");
                if (tx === null) return;
                setMsg("Recording…");
                const j = await call("/api/admin/referrals", { method: "POST", body: JSON.stringify({ handle: x.handle, amountUsd: Number(x.owedUsd.toFixed(2)), txHash: tx || undefined }) }).then((r) => r.json()).catch(() => ({ error: "network" }));
                setMsg(j.error ? String(j.error) : `Recorded ${usd(x.owedUsd)} to @${x.handle}`); loadPay();
              }}>Paid</button>
            </div>
          ))) : <p className="when mt-2">Nobody is owed anything yet. Earnings start once the builder address is set and invited people trade real money.</p>}
        </section>
      )}

      <section className="inv-card">
        <div className="flex items-center justify-between"><span className="eyebrow">Admins</span><span className="when">{owner ? "only you can change these" : "set by the owner"}</span></div>
        {p.staff.map((x) => (
          <div key={x.handle} className="adm-row"><b className="flex-1 text-[14px]">@{x.handle}</b><span className={`adm-st ${x.role === "owner" ? "warn" : "ok"}`}>{x.role.toUpperCase()}</span>
            {owner && x.role === "admin" && <button className="when underline" onClick={() => confirm(`Remove @${x.handle} as admin?`) && act({ action: "removeAdmin", handle: x.handle }, () => `@${x.handle} is no longer an admin`)}>remove</button>}</div>
        ))}
        {owner && <div className="inv-input"><input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="@handle to make an admin" autoCapitalize="none" /><button disabled={!ad.trim()} onClick={() => act({ action: "addAdmin", handle: ad }, (j) => `@${j.handle} is now an admin`).then(() => setAd(""))}>Add</button></div>}
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
    </div>
  );
}
