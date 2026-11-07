"use client";


import { tt } from "@/lib/i18n";
import { EarningsCalc } from "@/components/EarningsCalc";
import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Avatar, SkeletonList } from "@/components/ui";
import { Glyph } from "@/components/Glyph";
import { useSession } from "@/lib/hooks/useSession";
import { fmtUsd } from "@/lib/format";
import { openComingSoon } from "@/lib/hooks/useLive";
import { CoinMark, ticker } from "@/components/ui";

type Src = { total: number; week: number };
type Est = {
  total: number; week: number;
  sources: { copy: Src; fade: Src; call: Src; invite: Src; invite2: Src };
  best: { id: number; coin: string; side: string; leverage: number; copies: number; fades: number; calls: number; earned: number; at: string }[];
  people: { handle: string; avatarUrl: string | null; fills: number; volume: number; earned: number }[];
  recent: { day: string; handle: string; how: "copy" | "fade" | "call"; volume: number; earned: number }[];
};
type InviteRes = {
  mode: "real" | "demo"; staff: boolean; as: string | null; est: Est; daily: { day: string; earned: number }[];
  handle: string; link: string; canGoLive: boolean; onWaitlist: boolean; nextRelease: string; invitedBy: string | null; canRedeem: boolean;
  founder: null | { seat: number; wave: number; seats: number; since: string; l1Pct: number; l1TopPct: number; l1Ends: string | null; l2Pct: number; graceDays: number; graceLeft: number; gracePaused?: boolean; secured: boolean };
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
  // Staff preview from Admin → Tools: /invite?as=founder|regular|demo (the server ignores it for everyone else).
  const [as, setAs] = useState<string | null>(null);
  // Read ?as= before the first fetch, so staff previews don't load the real view first and then flash.
  const [asRead, setAsRead] = useState(false);
  useEffect(() => { try { setAs(new URLSearchParams(window.location.search).get("as")); } catch {} setAsRead(true); }, []);
  const { data, mutate } = useSWR<InviteRes>(authenticated && asRead ? `/api/invite${as ? `?as=${as}` : ""}` : null, (u: string) => authedFetch(u).then((r) => r.json()), { refreshInterval: 60_000 });
  const [toast, setToast] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 1500); };
  const copy = async () => { try { await navigator.clipboard.writeText(data!.link); flash(tt("Link copied")); } catch {} };
  const share = async () => { try { if (navigator.share) await navigator.share({ title: tt("Perped"), text: tt("Trade and fade on Perped. My invite gets you lower fees forever:"), url: data!.link }); else await copy(); } catch {} };
  const tweet = () => window.open(`https://x.com/intent/post?text=${encodeURIComponent(`Trade, fade, and pay less on @perped_. My invite gets you lower fees forever:\n${data!.link}`)}`, "_blank");
  const redeem = async () => {
    setErr(null);
    const r = await authedFetch("/api/invite", { method: "POST", body: JSON.stringify({ code }) }).then((x) => x.json()).catch(() => ({ error: "Try again" }));
    if (r.ok) { flash(`Joined with ${r.invitedBy}'s code`); mutate(); } else setErr(r.error);
  };

  if (!authenticated) return (
    <main className="px-4 pb-10 pt-4">
      <section className="inv-hero"><small>{tt("Perped is invite only")}</small><h2>{tt("Got a code? You’re in.")}</h2><p>{tt("Practise free with demo money now. Real trading opens with an invite code, or when the waitlist lets you in.")}</p></section>
      <button className="btn brand mt-4 w-full" style={{ padding: 15 }} onClick={login}>{tt("Sign in to join")}</button>
    </main>
  );
  if (!data) return <SkeletonList n={3} />;
  // Signed in but no profile yet (or the API answered with an error): finish setup first.
  if ((data as { error?: string }).error || !data.earnings) return (
    <main className="px-4 pb-10 pt-4"><section className="inv-hero"><small>{tt("Almost there")}</small><h2>{tt("Pick a handle first.")}</h2><p>{tt("Your invite page appears once your profile is set up.")}</p></section>
      <Link href="/onboarding" className="btn brand mt-4 w-full" style={{ padding: 15, display: "block", textAlign: "center" }}>{tt("Finish setup")}</Link></main>
  );
  const f = data.founder, e = data.earnings, r = data.rates, demo = data.mode === "demo", est = data.est;
  // Demo shows "would've earned" from demo trades; real shows what's actually been earned.
  const headline = demo ? est.week : e.owed;
  const wk = demo ? { inv: est.sources.invite.week + est.sources.invite2.week, cr: est.sources.copy.week + est.sources.fade.week + est.sources.call.week, all: est.total }
    : { inv: e.invite.week + e.invite2.week, cr: e.creator.week, all: e.total };
  const maxDay = Math.max(0.01, ...data.daily.map((d) => d.earned));
  const srcRows: { k: string; label: string; s: Src }[] = [
    { k: "copy", label: tt("Copies of your trades"), s: est.sources.copy },
    { k: "fade", label: tt("Fades of your trades"), s: est.sources.fade },
    { k: "call", label: tt("Trades on your calls"), s: est.sources.call },
    { k: "invite", label: tt("People you invited"), s: est.sources.invite },
    ...(f ? [{ k: "invite2", label: tt("People they invited"), s: est.sources.invite2 }] : []),
  ];
  const srcMax = Math.max(0.01, ...srcRows.map((x) => x.s.total));
  const brag = async () => {
    const text = demo ? `I'd have made ${money(est.week)} this week on @perped_ just from people copying and fading my trades. Real money opens soon:` : `Made ${money(e.week)} this week on @perped_ from people copying and fading my trades:`;
    try { if (navigator.share) await navigator.share({ title: tt("Perped"), text, url: data.link }); else window.open(`https://x.com/intent/post?text=${encodeURIComponent(`${text}\n${data.link}`)}`, "_blank"); } catch {}
  };
  const toTop = Math.max(0, r.topThreshold - r.activeInvites);

  return (
    <main className="pb-12">
      <header className="flex items-center justify-between px-4 py-3"><h1 className="text-xl font-bold">{tt("Invite")}</h1><Link href="/how-it-works#earn" className="when underline">{tt("How earning works")}</Link></header>
      <div className="px-4">
        {data.staff && as && (
          <div className="inv-preview"><span>{tt("Previewing as")}{" "}<b>{as}</b></span><Link href="/invite" onClick={() => setAs(null)}>{tt("Back to mine")}</Link></div>
        )}
        <section className={`inv-hero ${f ? "" : "reg"}`}>
          {f ? <span className="fbadge"><Glyph n="crown" />{tt("FOUNDER #")}{f.seat}</span> : <small>{tt("Invite friends")}</small>}
          <h2>{f ? tt("Half of every fee your people pay.") : tt("Your friends trade cheaper. You get paid.")}</h2>
          <p>{f ? `Seat #${f.seat} of the Founding ${f.wave}. Only ${f.seats} founder seats will ever exist. Invite as many people as you want.` : tt("Perped is invite only. Your link gets anyone in, and there's no limit.")}</p>
          <div className="inv-code"><span className="mono">{data.link.replace(/^https?:\/\//, "")}</span><button onClick={copy}>{tt("Copy")}</button></div>
          <div className="inv-share"><button onClick={tweet}>{tt("Post on X")}</button><button onClick={share}>{tt("Share")}</button></div>
        </section>
        <EarningsCalc sharePct={r.invitePct} />

        {data.canRedeem && (
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">{tt("Have a code?")}</span>{data.onWaitlist && <span className="when">{tt("on the waitlist · next release")}{" "}{nextMonday(data.nextRelease)} 9pm</span>}</div>
            <p className="when mt-1">{data.canGoLive ? tt("Add one before your first real trade and your fees drop to the invite rate forever.") : tt("Real trading needs an invite code, or a spot from the waitlist. A code also cuts your fees forever.")}</p>
            <div className="inv-input"><input value={code} onChange={(x) => setCode(x.target.value)} placeholder={tt("Their handle")} autoCapitalize="none" /><button onClick={redeem} disabled={!code.trim()}>{tt("Apply")}</button></div>
            {err && <p className="red mt-1 text-[12px]">{err}</p>}
          </section>
        )}

        <section className={`inv-card ${demo ? "would" : ""}`}>
          <div className="flex items-center justify-between"><span className="eyebrow">{demo ? tt("Would've earned") : tt("Your earnings")}</span><span className={demo ? "inv-est" : "when"}>{demo ? tt("practice estimate") : tt("paid weekly in USDC")}</span></div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div><div className={`mono text-[32px] font-extrabold leading-none ${demo ? "" : "green"}`}>{money(headline)}</div><div className="when mt-1">{demo ? tt("this week, if your demo trades were real") : tt("to be paid Monday")}</div></div>
            <button className="inv-brag" onClick={brag}>{tt("Share")}</button>
          </div>
          <div className="inv-split"><div><small>{tt("From invites")}</small><b className="mono">{money(wk.inv)}</b><span>{tt("this week")}</span></div><div><small>{tt("Your trades")}</small><b className="mono">{money(wk.cr)}</b><span>{tt("this week")}</span></div><div><small>{tt("All time")}</small><b className="mono">{money(wk.all)}</b><span>{demo ? tt("on demo") : `${money(e.paid)} paid`}</span></div></div>
          <div className="inv-days" aria-label={tt("Last 14 days")}>
            {data.daily.map((d) => <div key={d.day} title={`${d.day}: ${money(d.earned)}`}><i style={{ height: `${Math.max(d.earned > 0 ? 6 : 2, (d.earned / maxDay) * 100)}%` }} /><span>{Number(d.day.slice(8))}</span></div>)}
          </div>
          {demo && <button className="btn brand mt-3 w-full" style={{ padding: 12, fontSize: 14 }} onClick={() => openComingSoon()}>{tt("Make it real: get early access")}</button>}
        </section>

        <section className={`inv-card ${demo ? "would" : ""}`}>
          <div className="flex items-center justify-between"><span className="eyebrow">{tt("Where it comes from")}</span><span className="when">{demo ? tt("all time on demo") : tt("all time, estimated split")}</span></div>
          <div className="inv-srcs">{srcRows.map((x) => (
            <div key={x.k}><div className="flex items-center justify-between gap-2"><span className="text-[13px] font-bold">{x.label}</span><span className="mono text-[13px] font-extrabold">{money(x.s.total)}<span className="when ml-1.5">{money(x.s.week)} wk</span></span></div><div className="inv-bar"><i className={x.k} style={{ width: `${(x.s.total / srcMax) * 100}%` }} /></div></div>
          ))}</div>
        </section>

        <section className="inv-card">
          <div className="flex items-center justify-between"><span className="eyebrow">{f ? tt("Your founder rates") : tt("Your rates")}</span>{f && <span className="when">{tt("locked in")}</span>}</div>
          <div className="inv-rates">
            <div><b className={`mono ${f ? "gold" : "green"}`}>{r.invitePct}%</b><div><strong>{tt("Everyone you invite")}</strong><span>{f ? tt("of their fees, for life") : r.invitePct < r.topInvitePct ? `of their fees · ${r.topInvitePct}% at ${r.topThreshold} active friends` : tt("of their fees, top rate")}</span></div></div>
            {f && <div><b className="mono">{f.l2Pct}%</b><div><strong>{tt("Everyone they invite")}</strong><span>{tt("of their fees, on top of what your invitee earns")}</span></div></div>}
            <div><b className={`mono ${f ? "gold" : "green"}`}>{r.creatorPct}%</b><div><strong>{tt("Your trades & calls")}</strong><span>{f ? tt("of the fees on every copy, fade or call trade, from anyone") : r.creatorPct < r.creatorRankedPct ? `when someone copies, fades or trades your call · ${r.creatorRankedPct}% at ${r.creatorRankTitle}` : tt("when someone copies, fades or trades your call")}</span></div></div>
          </div>
          {f?.l1Ends && f.l1Pct === f.l1TopPct && <div className="mt-3"><div className="flex justify-between when"><span>{f.l1TopPct}{tt("% rate")}</span><span>until {new Date(f.l1Ends).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></div><div className="xpbar mt-1.5" style={{ height: 6 }}><i className="lv7" style={{ width: `${Math.min(100, Math.max(2, ((Date.now() - new Date(f.since).getTime()) / (new Date(f.l1Ends).getTime() - new Date(f.since).getTime())) * 100))}%` }} /></div></div>}
          {!f && r.invitePct < r.topInvitePct && <div className="mt-3"><div className="xpbar" style={{ height: 6 }}><i className="lv5" style={{ width: `${Math.round((r.activeInvites / r.topThreshold) * 100)}%` }} /></div><div className="flex justify-between when mt-1"><span>{r.activeInvites} active</span><span>{toTop}{" "}{tt("more to")}{" "}{r.topInvitePct}%</span></div></div>}
          {!f && r.creatorPct < r.creatorRankedPct && <p className="when mt-2">{r.xpToRanked.toLocaleString()}{" "}{tt("XP to")}{" "}{r.creatorRankTitle} and {r.creatorRankedPct}{tt("% on your trades. Win fades to get there.")}</p>}
        </section>

        {f && (
          <section className="inv-card">
            <div className="flex items-center justify-between"><span className="eyebrow">{tt("Your seat")}</span><span className={`when ${f.secured ? "green" : ""}`}>{f.secured ? "secured" : f.gracePaused ? tt("clock paused") : `${f.graceLeft} days to secure it`}</span></div>
            <p className="when mt-1">{f.secured ? tt("Someone you invited trades real money, so the seat is yours.") : f.gracePaused ? `Your ${f.graceDays}-day clock hasn't started: it starts when real-money trading opens. Until then, build your network on demo.` : `Bring in one trader who trades real money within ${f.graceDays} days of getting the seat, or it goes back to the pool and you move to regular rates.`}</p>
            <Link href="/founder" className="btn brand mt-3 w-full" style={{ padding: 12, fontSize: 14 }}>{tt("Open your founder dashboard")}</Link>
          </section>
        )}

        <section className={`inv-card ${demo ? "would" : ""}`}>
          <div className="flex items-center justify-between"><span className="eyebrow">{tt("Your best trades")}</span><span className="when">most {demo ? tt("would've ") : ""}earned</span></div>
          {est.best.length ? <div className="mt-1">{est.best.map((b) => (
            <Link key={b.id} href={`/post/${b.id}`} className="inv-erow"><CoinMark coin={b.coin} size="xs" /><span className="t"><b>{ticker(b.coin)} {b.side} {b.leverage}×</b> <span className="muted">{[b.copies && `copied ${b.copies}×`, b.fades && `faded ${b.fades}×`, b.calls && `${b.calls} on your call`].filter(Boolean).join(" · ")}</span></span><span className={`mono ${demo ? "" : "green"}`}>+{money(b.earned)}</span></Link>
          ))}</div> : <p className="when mt-1">{tt("When people copy or fade your trades, the ones that")}{" "}{demo ? tt("would've ") : ""}{tt("earned you the most show up here.")}</p>}
        </section>

        <section className={`inv-card ${demo ? "would" : ""}`}>
          <div className="flex items-center justify-between"><span className="eyebrow">{tt("Who")}{" "}{demo ? tt("would've paid") : tt("made you money")}</span><span className="when">{tt("by your share of their fees")}</span></div>
          {est.people.length ? <div className="mt-1">{est.people.map((p) => (
            <Link key={p.handle} href={`/u/${p.handle}`} className="inv-erow"><Avatar handle={p.handle} url={p.avatarUrl} size={26} link={false} /><span className="t"><b>{p.handle}</b> <span className="muted">{p.fills} trade{p.fills === 1 ? "" : "s"}{" "}{tt("off yours ·")}{" "}{vol(p.volume)}</span></span><span className={`mono ${demo ? "" : "green"}`}>+{money(p.earned)}</span></Link>
          ))}</div> : <p className="when mt-1">{tt("Nobody has traded off your posts yet. Post your trades and calls: every copy and fade earns you")}{" "}{r.creatorPct}{tt("% of the fee.")}</p>}
        </section>

        <section className={`inv-card ${demo ? "would" : ""}`}>
          <div className="flex items-center justify-between"><span className="eyebrow">{tt("Latest")}</span><span className="when">{money(demo ? est.sources.copy.total + est.sources.fade.total + est.sources.call.total : e.creator.total)}{" "}{tt("all time")}</span></div>
          {demo ? (est.recent.length ? <div className="mt-1">{est.recent.map((c, i) => (
            <div key={i} className="inv-erow"><span className="k">{c.how}</span><span className="t"><b>{c.handle}</b> <span className="muted">{c.how === "copy" ? "copied" : c.how === "fade" ? "faded" : tt("traded your call")} · {vol(c.volume)}</span></span><span className="mono">+{money(c.earned)}</span></div>
          ))}</div> : <p className="when mt-1">{tt("When someone copies or fades your demo trades, what you would’ve earned shows up here.")}</p>)
          : data.creator.length ? <div className="mt-1">{data.creator.map((c, i) => (
            <div key={i} className="inv-erow"><span className="k">{c.fills} fill{c.fills === 1 ? "" : "s"}</span><span className="t"><b>{c.handle}</b> <span className="muted">{tt("traded off your post ·")}{" "}{vol(c.volume)}</span></span><span className="mono green">+{money(c.earned)}</span></div>
          ))}</div> : <p className="when mt-1">{tt("When someone copies or fades one of your trades, or trades your call, you earn")}{" "}{r.creatorPct}{tt("% of the fee. It shows up here the next day.")}</p>}
        </section>

        <section className="inv-card">
          <div className="flex items-center justify-between"><span className="eyebrow">{tt("Your people")}</span><span className="when"><b style={{ color: "var(--text)" }}>{data.counts.joined}</b>{" "}{tt("joined ·")}{" "}<b style={{ color: "var(--text)" }}>{data.counts.live}</b>{" "}{tt("trading real")}{f ? ` · ${data.people2.length} by them` : ""}</span></div>
          {data.people.length ? <div className="inv-tree">{data.people.map((p) => (
            <div key={p.handle}>
              <Link href={`/u/${p.handle}`} className="inv-node"><Avatar handle={p.handle} url={p.avatarUrl} size={30} link={false} /><div className="min-w-0 flex-1"><b className="truncate">{p.handle}</b><span>{p.isDemo ? tt("practising on demo") : `${vol(p.volume)} volume`}{p.invited ? ` · invited ${p.invited}` : ""}</span></div><span className="mono green">{p.earned ? `+${money(p.earned)}` : ""}</span></Link>
              {f && data.people2.some((q) => q.via === p.handle) && <div className="inv-kids">{data.people2.filter((q) => q.via === p.handle).slice(0, 5).map((q) => (
                <Link key={q.handle} href={`/u/${q.handle}`} className="inv-node"><Avatar handle={q.handle} url={q.avatarUrl} size={26} link={false} /><div className="min-w-0 flex-1"><b className="truncate">{q.handle}</b><span>{vol(q.volume)} volume</span></div><span className="mono green">{q.earned ? `+${money(q.earned)}` : ""}</span></Link>
              ))}</div>}
            </div>
          ))}</div> : <p className="when mt-1">{tt("Nobody yet. Post your link: everyone who joins with it is yours for life.")}</p>}
        </section>

        <p className="faint mt-3 px-1 text-[11.5px] leading-relaxed">{demo ? tt("Would've earned is a practice estimate: the same rules as real payouts, worked out from demo trades at the standard fee. Nothing here is paid. ") : ""}Earnings are counted daily from the fees Perped actually collects and paid weekly in USDC to your Perped wallet. They start when someone trades with real money; demo doesn&rsquo;t count. Your friends pay the invite rate forever. Copies and fades count when held 2+ minutes and never on your own trades. {data.invitedBy ? `You joined with ${data.invitedBy}'s code.` : ""} <Link href="/how-it-works#earn" className="underline">{tt("Full rules")}</Link></p>
      </div>
      {toast && <div className="inv-toast">{toast}</div>}
    </main>
  );
}
