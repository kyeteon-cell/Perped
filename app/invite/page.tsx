"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Avatar, SkeletonList } from "@/components/ui";
import { Glyph } from "@/components/Glyph";
import { useSession } from "@/lib/hooks/useSession";
import { fmtUsd } from "@/lib/format";

type Src = { total: number; week: number };
type InviteRes = {
  handle: string; link: string; canGoLive: boolean; onWaitlist: boolean; nextRelease: string; invitedBy: string | null; canRedeem: boolean;
  founder: null | { seat: number; wave: number; seats: number; since: string; l1Pct: number; l1LaterPct: number; l1TopPct: number; l1Ends: string | null; l2Pct: number; graceDays: number; graceLeft: number; secured: boolean };
  rates: { invitePct: number; baseInvitePct: number; topInvitePct: number; topThreshold: number; activeInvites: number; creatorPct: number; creatorBasePct: number; creatorRankedPct: number; creatorRankTitle: string; xpToRanked: number };
  counts: { joined: number; live: number };
  earnings: { owed: number; total: number; paid: number; week: number; invite: Src; invite2: Src; creator: Src };
  people: { handle: string; avatarUrl: string | null; isDemo: boolean; invited: number; volume: number; earned: number }[];
  people2: { handle: string; avatarUrl: string | null; via: string; volume: number; earned: number }[];
  creator: { day: string; handle: string; fills: number; volume: number; earned: number }[];
};

const money = (n: number) => (n > 0 && n < 1 ? `$${n.toFixed(2)}` : fmtUsd(n));
const vol = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
const nextMonday = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long" });

/** /invite — your link, your rates, what you've earned and from whom. Founders see their seat and the two-level tree. */
export default function InvitePage() {
  const { authenticated, login, authedFetch } = useSession();
  const { data, mutate } = useSWR<InviteRes>(authenticated ? "/api/invite" : null, (u: string) => authedFetch(u).then((r) => r.json()), { refreshInterval: 60_000 });
  const [toast, setToast] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 1500); };
  const copy = async () => { try { await navigator.clipboard.writeText(data!.link); flash("Link copied"); } catch {} };
  const share = async () => { try { if (navigator.share) await navigator.share({ title: "Perped", text: "Trade and fade on Perped. My invite gets you lower fees forever:", url: data!.link }); else await copy(); } catch {} };
  const tweet = () => window.open(`https://x.com/intent/post?text=${encodeURIComponent(`Trade, fade, and pay less on @perped_. My invite gets you lower fees forever:\n${data!.link}`)}`, "_blank");
  const redeem = async () => {
    setErr(null);
    const r = await authedFetch("/api/invite", { method: "POST", body: JSON.stringify({ code }) }).then((x) => x.json()).catch(() => ({ error: "Try again" }));
    if (r.ok) { flash(`Joined with ${r.invitedBy}'s code`); mutate(); } else setErr(r.error);
  };

  if (!authenticated) return (
    <main className="px-4 pb-10 pt-4">
      <section className="inv-hero"><small>Perped is invite only</small><h2>Got a code? You&rsquo;re in.</h2><p>Practise free with demo money now. Real trading opens with an invite code, or when the waitlist lets you in.</p></section>
      <button className="btn brand mt-4 w-full" style={{ padding: 15 }} onClick={login}>Sign in to join</button>
    </main>
  );
  if (!data) return <SkeletonList n={3} />;
  const f = data.founder, e = data.earnings, r = data.rates;
  const toTop = Math.max(0, r.topThreshold - r.activeInvites);

  return (
    <main className="pb-12">
      <header className="flex items-center justify-between px-4 py-3"><h1 className="text-xl font-bold">Invite</h1><Link href="/how-it-works#earn" className="when underline">How earning works</Link></header>
      <div className="px-4">
        <section className={`inv-hero ${f ? "" : "reg"}`}>
          {f ? <span className="fbadge"><Glyph n="crown" />FOUNDER #{f.seat}</span> : <small>Invite friends</small>}
          <h2>{f ? "Half of every fee your people pay." : "Your friends trade cheaper. You get paid."}</h2>
          <p>{f ? `Seat #${f.seat} of the Founding ${f.wave}. Only ${f.seats} founder seats will ever exist. Invite as many people as you want.` : "Perped is invite only. Your link gets anyone in, and there's no limit."}</p>
          <div className="inv-code"><span className="mono">{data.link.replace(/^https?:\/\//, "")}</span><button onClick={copy}>Copy</button></div>
          <div className="inv-share"><button onClick={tweet}>Post on X</button><button onClick={share}>Share</button></div>
        </section>

        {data.canRedeem && (
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">Have a code?</span>{data.onWaitlist && <span className="when">on the waitlist · next release {nextMonday(data.nextRelease)} 9pm</span>}</div>
            <p className="when mt-1">{data.canGoLive ? "Add one before your first real trade and your fees drop to the invite rate forever." : "Real trading needs an invite code, or a spot from the waitlist. A code also cuts your fees forever."}</p>
            <div className="inv-input"><input value={code} onChange={(x) => setCode(x.target.value)} placeholder="Their handle" autoCapitalize="none" /><button onClick={redeem} disabled={!code.trim()}>Apply</button></div>
            {err && <p className="red mt-1 text-[12px]">{err}</p>}
          </section>
        )}

        <section className="inv-card">
          <div className="flex items-center justify-between"><span className="eyebrow">Your earnings</span><span className="when">paid weekly in USDC</span></div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div><div className="mono green text-[32px] font-extrabold leading-none">{money(e.owed)}</div><div className="when mt-1">to be paid Monday</div></div>
          </div>
          <div className="inv-split"><div><small>From invites</small><b className="mono">{money(e.invite.week + e.invite2.week)}</b><span>this week</span></div><div><small>Your trades</small><b className="mono">{money(e.creator.week)}</b><span>this week</span></div><div><small>All time</small><b className="mono">{money(e.total)}</b><span>{money(e.paid)} paid</span></div></div>
        </section>

        <section className="inv-card">
          <div className="flex items-center justify-between"><span className="eyebrow">{f ? "Your founder rates" : "Your rates"}</span>{f && <span className="when">locked in</span>}</div>
          <div className="inv-rates">
            <div><b className={`mono ${f ? "gold" : "green"}`}>{r.invitePct}%</b><div><strong>Everyone you invite</strong><span>{f ? `of their fees · ${f.l1LaterPct}% for life after month 12` : r.invitePct < r.topInvitePct ? `of their fees · ${r.topInvitePct}% at ${r.topThreshold} active friends` : "of their fees, top rate"}</span></div></div>
            {f && <div><b className="mono">{f.l2Pct}%</b><div><strong>Everyone they invite</strong><span>of their fees, on top of what your invitee earns</span></div></div>}
            <div><b className={`mono ${f ? "gold" : "green"}`}>{r.creatorPct}%</b><div><strong>Your trades &amp; calls</strong><span>{f ? "of the fees on every copy, fade or call trade, from anyone" : r.creatorPct < r.creatorRankedPct ? `when someone copies, fades or trades your call · ${r.creatorRankedPct}% at ${r.creatorRankTitle}` : "when someone copies, fades or trades your call"}</span></div></div>
          </div>
          {f?.l1Ends && f.l1Pct === f.l1TopPct && <div className="mt-3"><div className="flex justify-between when"><span>{f.l1TopPct}% rate</span><span>until {new Date(f.l1Ends).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></div><div className="xpbar mt-1.5" style={{ height: 6 }}><i className="lv7" style={{ width: `${Math.min(100, Math.max(2, ((Date.now() - new Date(f.since).getTime()) / (new Date(f.l1Ends).getTime() - new Date(f.since).getTime())) * 100))}%` }} /></div></div>}
          {!f && r.invitePct < r.topInvitePct && <div className="mt-3"><div className="xpbar" style={{ height: 6 }}><i className="lv5" style={{ width: `${Math.round((r.activeInvites / r.topThreshold) * 100)}%` }} /></div><div className="flex justify-between when mt-1"><span>{r.activeInvites} active</span><span>{toTop} more to {r.topInvitePct}%</span></div></div>}
          {!f && r.creatorPct < r.creatorRankedPct && <p className="when mt-2">{r.xpToRanked.toLocaleString()} XP to {r.creatorRankTitle} and {r.creatorRankedPct}% on your trades. Win fades to get there.</p>}
        </section>

        {f && (
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">Your seat</span><span className={`when ${f.secured ? "green" : ""}`}>{f.secured ? "secured" : `${f.graceLeft} days to secure it`}</span></div>
            <p className="when mt-1">{f.secured ? "Someone you invited trades real money, so the seat is yours." : `Bring in one trader who trades real money within ${f.graceDays} days of getting the seat, or it goes back to the pool and you move to regular rates.`}</p>
          </section>
        )}

        <section className="inv-card">
          <div className="flex items-center justify-between"><span className="eyebrow">Your trades &amp; calls</span><span className="when">{money(e.creator.total)} all time</span></div>
          {data.creator.length ? <div className="mt-1">{data.creator.map((c, i) => (
            <div key={i} className="inv-erow"><span className="k">{c.fills} fill{c.fills === 1 ? "" : "s"}</span><span className="t"><b>{c.handle}</b> <span className="muted">traded off your post · {vol(c.volume)}</span></span><span className="mono green">+{money(c.earned)}</span></div>
          ))}</div> : <p className="when mt-1">When someone copies or fades one of your trades, or trades your call, you earn {r.creatorPct}% of the fee. It shows up here the next day.</p>}
        </section>

        <section className="inv-card">
          <div className="flex items-center justify-between"><span className="eyebrow">Your people</span><span className="when"><b style={{ color: "var(--text)" }}>{data.counts.joined}</b> joined · <b style={{ color: "var(--text)" }}>{data.counts.live}</b> trading real{f ? ` · ${data.people2.length} by them` : ""}</span></div>
          {data.people.length ? <div className="inv-tree">{data.people.map((p) => (
            <div key={p.handle}>
              <Link href={`/u/${p.handle}`} className="inv-node"><Avatar handle={p.handle} url={p.avatarUrl} size={30} link={false} /><div className="min-w-0 flex-1"><b className="truncate">{p.handle}</b><span>{p.isDemo ? "practising on demo" : `${vol(p.volume)} volume`}{p.invited ? ` · invited ${p.invited}` : ""}</span></div><span className="mono green">{p.earned ? `+${money(p.earned)}` : ""}</span></Link>
              {f && data.people2.some((q) => q.via === p.handle) && <div className="inv-kids">{data.people2.filter((q) => q.via === p.handle).slice(0, 5).map((q) => (
                <Link key={q.handle} href={`/u/${q.handle}`} className="inv-node"><Avatar handle={q.handle} url={q.avatarUrl} size={26} link={false} /><div className="min-w-0 flex-1"><b className="truncate">{q.handle}</b><span>{vol(q.volume)} volume</span></div><span className="mono green">{q.earned ? `+${money(q.earned)}` : ""}</span></Link>
              ))}</div>}
            </div>
          ))}</div> : <p className="when mt-1">Nobody yet. Post your link: everyone who joins with it is yours for life.</p>}
        </section>

        <p className="faint mt-3 px-1 text-[11.5px] leading-relaxed">Earnings are counted daily from the fees Perped actually collects and paid weekly in USDC to your Perped wallet. They start when someone trades with real money; demo doesn&rsquo;t count. Your friends pay the invite rate forever. Copies and fades count when held 2+ minutes and never on your own trades. {data.invitedBy ? `You joined with ${data.invitedBy}'s code.` : ""} <Link href="/how-it-works#earn" className="underline">Full rules</Link></p>
      </div>
      {toast && <div className="inv-toast">{toast}</div>}
    </main>
  );
}
