"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { Avatar, RankEmblem } from "@/components/ui";

type Person = { handle: string; avatarUrl: string | null; isDemo: boolean; xp: number; rank: string; joinedAt: string; invited: number; trades: number; trades7: number; lastActive: string | null; earned: number };
type Data = {
  error?: string;
  viewer: { staff: boolean; own: boolean };
  user: { handle: string; avatarUrl: string | null; xp: number; rank: string; rankLevel: number };
  founder: null | { seat: number | null; since: string | null; status: string; secured: boolean; l1Pct: number; l2Pct: number; graceDays: number; clock: "secured" | "paused" | "running"; graceLeft: number };
  live: { open: boolean };
  link: string;
  network: { l1: number; l1Live: number; l2: number; joined7: number; active7: number; trades7: number; volume7: number; realVolume7: number };
  earnings: { total: number; paid: number; owed: number; invite: number; invite2: number; creator: number };
  daily: { day: string; joined: number; trades: number }[];
  people: Person[];
  secondLevel: { handle: string; via: string; trades: number }[];
};

const usd = (n: number) => `$${n >= 1e6 ? (n / 1e6).toFixed(1) + "m" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : n.toFixed(n < 10 ? 2 : 0)}`;
const ago = (d: string | null) => {
  if (!d) return "never";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86_400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86_400)}d ago`;
};

/** /founder[?handle=x] → a founder's own dashboard, in the same style as the admin control panel. Staff can open anyone's. */
export default function FounderDashboard() {
  const { profile, authenticated, login } = useSession();
  const [handle, setHandle] = useState<string | null | undefined>(undefined);
  const [find, setFind] = useState("");
  const [tab, setTab] = useState<"people" | "second">("people");
  const [copied, setCopied] = useState(false);
  useEffect(() => { try { setHandle(new URLSearchParams(window.location.search).get("handle")); } catch { setHandle(null); } }, []);
  const key = profile && handle !== undefined ? `/api/founder${handle ? `?handle=${encodeURIComponent(handle)}` : ""}` : null;
  const { data, mutate } = useSWR<Data>(key, { refreshInterval: 60_000 });
  const staff = profile?.role === "admin" || profile?.role === "owner";
  const go = (h: string | null) => { setHandle(h); try { const u = new URL(window.location.href); if (h) u.searchParams.set("handle", h); else u.searchParams.delete("handle"); window.history.replaceState(null, "", u); } catch {} };

  if (!authenticated) return <main className="adm-page px-4 pt-6"><h1 className="text-xl font-extrabold">Founder dashboard</h1><p className="muted mt-2 text-sm">Sign in to see your network.</p><button className="btn ink mt-3" onClick={login}>Sign in</button></main>;
  if (!data) return <main className="adm-page px-4 pt-6"><p className="muted">Loading…</p></main>;
  if (data.error === "not_founder") return (
    <main className="adm-page px-4 pt-6">
      <h1 className="text-xl font-extrabold">Founder dashboard</h1>
      <p className="muted mt-2 text-sm">This is for Perped founders: hand-picked traders who get a bigger share of what their network trades. Your invite link and earnings are on the Invite page.</p>
      <Link href="/invite" className="btn brand mt-4" style={{ padding: 13, fontSize: 15 }}>Go to Invite &amp; earn</Link>
    </main>
  );
  if (data.error) return <main className="adm-page px-4 pt-6"><p className="red text-sm">{data.error}</p>{staff && <button className="btn mt-3" onClick={() => go(null)}>Back to mine</button>}</main>;

  const f = data.founder, nw = data.network, e = data.earnings;
  const maxDay = Math.max(1, ...data.daily.map((d) => d.trades));
  const maxJoin = Math.max(1, ...data.daily.map((d) => d.joined));
  const copy = async () => { try { await navigator.clipboard.writeText(data.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const share = async () => { try { await navigator.share?.({ title: "Perped", text: "Trade in public on Perped. Join with my code:", url: data.link }); } catch {} };

  return (
    <main className="adm-page px-4 pb-28 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar handle={data.user.handle} url={data.user.avatarUrl} size={44} link={false} />
          <div className="min-w-0"><h1 className="truncate text-xl font-extrabold">{data.viewer.own ? "Your network" : `@${data.user.handle}`}</h1><p className="when">Founder dashboard · updated live</p></div>
        </div>
        <span className="adm-role">{f?.seat != null ? `FOUNDER #${f.seat}` : "NOT A FOUNDER"}</span>
      </div>

      {staff && (
        <div className="inv-input">
          <input value={find} onChange={(ev) => setFind(ev.target.value)} placeholder="Open a founder: @handle" autoCapitalize="none" />
          <button disabled={!find.trim()} onClick={() => { go(find.trim().replace(/^@/, "")); setFind(""); }}>Open</button>
          {!data.viewer.own && <button onClick={() => go(null)}>Mine</button>}
        </div>
      )}

      <div className="adm-kpis mt-3">
        <div><small>Invited</small><b className="mono">{nw.l1}</b><span>+{nw.joined7} this week</span></div>
        <div><small>Their invites</small><b className="mono">{nw.l2}</b><span>2nd level</span></div>
        <div><small>Active 7d</small><b className="mono">{nw.active7}</b><span>of {nw.l1} traded</span></div>
        <div><small>Trades 7d</small><b className="mono">{nw.trades7}</b><span>{usd(nw.volume7)} volume</span></div>
        <div><small>Earned</small><b className="mono">{usd(e.total)}</b><span>{usd(e.paid)} paid</span></div>
        <div><small>Owed</small><b className="mono">{usd(e.owed)}</b><span>paid Mondays</span></div>
      </div>

      {f && (
        <section className="inv-card mt-3">
          <div className="flex items-center justify-between gap-2"><span className="eyebrow">Your seat</span><span className={`adm-st ${f.clock === "secured" ? "ok" : f.clock === "paused" ? "ok" : f.graceLeft <= 14 ? "warn" : "ok"}`}>{f.clock === "secured" ? "SECURED" : f.clock === "paused" ? "CLOCK PAUSED" : `${f.graceLeft}D LEFT`}</span></div>
          <p className="when mt-1.5">
            {f.clock === "secured" ? "Someone in your network trades real money, so the seat is yours." :
              f.clock === "paused" ? `Real money isn't open yet, so your ${f.graceDays}-day clock hasn't started. Use the time to grow your network on demo: everyone you bring in now is already yours when trading opens.` :
              `Bring in one trader who trades real money within ${f.graceDays} days or the seat goes back to the pool.`}
          </p>
          <div className="inv-split">
            <div><small>Your invites</small><b className="mono">{f.l1Pct}%</b><span>of their fees</span></div>
            <div><small>Their invites</small><b className="mono">{f.l2Pct}%</b><span>of their fees</span></div>
            <div><small>Trading real</small><b className="mono">{nw.l1Live}</b><span>{data.live.open ? "of your invites" : "opens soon"}</span></div>
          </div>
        </section>
      )}

      <section className="inv-card">
        <div className="flex items-center justify-between"><span className="eyebrow">Invite link</span><span className="when">uncapped · discount forever</span></div>
        <div className="mono mt-2 break-all text-[13px]">{data.link}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn brand" style={{ padding: 12, fontSize: 14 }} onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
          <button className="btn" style={{ padding: 12, fontSize: 14 }} onClick={share}>Share</button>
        </div>
      </section>

      <section className="inv-card">
        <div className="flex items-center justify-between"><span className="eyebrow">Last 14 days</span><span className="when"><i className="fd-key t" />trades <i className="fd-key j" />joined</span></div>
        <div className="fd-bars mt-3">
          {data.daily.map((d) => (
            <div key={d.day} title={`${d.day}: ${d.trades} trades, ${d.joined} joined`}>
              <i className="t" style={{ height: `${(d.trades / maxDay) * 100}%` }} />
              <i className="j" style={{ height: `${(d.joined / maxJoin) * 40}%` }} />
              <span>{new Date(d.day).getDate()}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="adm-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "people"} className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>Your invites<small>{nw.l1}</small></button>
        <button role="tab" aria-selected={tab === "second"} className={tab === "second" ? "on" : ""} onClick={() => setTab("second")}>Their invites<small>{nw.l2}</small></button>
      </div>

      {tab === "people" && (
        <section className="inv-card">
          {data.people.length ? data.people.map((p) => (
            <div key={p.handle} className="adm-row">
              <Avatar handle={p.handle} url={p.avatarUrl} size={34} />
              <div className="min-w-0 flex-1">
                <Link href={`/u/${p.handle}`} className="block truncate text-[14px] font-bold">@{p.handle}</Link>
                <span className="when block truncate">{p.rank} · {p.trades7} trades this week · {p.trades} total{p.invited ? ` · brought ${p.invited}` : ""}</span>
                <span className="when block">joined {ago(p.joinedAt)} · active {ago(p.lastActive)}</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`adm-st ${p.isDemo ? "warn" : "ok"}`}>{p.isDemo ? "DEMO" : "REAL"}</span>
                {p.earned > 0 && <b className="mono green text-[12px]">{usd(p.earned)}</b>}
              </div>
            </div>
          )) : <p className="when">Nobody yet. Share your link: everyone who joins with it is in your network for good.</p>}
        </section>
      )}

      {tab === "second" && (
        <section className="inv-card">
          {data.secondLevel.length ? data.secondLevel.map((p) => (
            <div key={p.handle} className="adm-row">
              <Avatar handle={p.handle} size={30} />
              <div className="min-w-0 flex-1"><Link href={`/u/${p.handle}`} className="block truncate text-[14px] font-bold">@{p.handle}</Link><span className="when">via @{p.via}</span></div>
              <span className="mono text-[13px]">{p.trades} trades</span>
            </div>
          )) : <p className="when">When the people you invited bring in their own friends, they show up here. You earn {f?.l2Pct ?? 0}% on those too.</p>}
        </section>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px]"><RankEmblem level={data.user.rankLevel} size={22} />{data.user.rank} · {data.user.xp.toLocaleString()} XP</span>
        <button className="when underline" onClick={() => mutate()}>refresh</button>
      </div>
      <Link href="/invite" className="srow mt-2" style={{ color: "var(--brand)" }}><span><b>Rates &amp; payouts</b><span className="when ml-1.5">full rules on the Invite page</span></span><span>→</span></Link>
    </main>
  );
}
