"use client";


import { tt } from "@/lib/i18n";
import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { FeedPost } from "@/components/FeedPost";
import { Avatar, Badges, Icon, I, LoadFail, SkeletonList } from "@/components/ui";
import { CrewEmblem } from "@/components/CrewBoard";
import { EarningsCalc } from "@/components/EarningsCalc";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { siteOrigin } from "@/lib/config";
import { fmtPct, fmtUsd } from "@/lib/format";
import type { CrewCard, CrewMember } from "@/lib/crews";
import type { FeedRow } from "@/lib/feed";

type Res = {
  crew: CrewCard & { rank: number | null; telegram: { title: string | null } | null; tgMembers: boolean };
  members: CrewMember[];
  viewer: { member: boolean; isOwner: boolean; otherCrew: { slug: string; name: string; isOwner: boolean } | null };
  owner: { invitePct: number } | null;
  telegram: { available: boolean; bot: string | null };
  error?: string;
};

/** /crew/:slug — a crew: who's in it, how they're trading, this week's war record, and the way in. */
export default function CrewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data, mutate, error } = useSWR<Res>(`/api/crews/${slug}`, { refreshInterval: 30_000 });
  const { authenticated, login, startGuest, profile, authedFetch } = useSession();
  const { mids } = useMids();
  const [tab, setTab] = useState<"members" | "trades">("members");
  const { data: feed, mutate: mutateFeed } = useSWR<{ posts: FeedRow[] }>(tab === "trades" ? `/api/posts?crew=${slug}&kind=trade&limit=30` : null);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null), [copied, setCopied] = useState(false);

  if (error || data?.error) return <LoadFail gone what="this crew" />;
  if (!data) return <SkeletonList n={4} />;
  const { crew, viewer } = data;
  const link = `${siteOrigin()}/crew/${crew.slug}?ref=${crew.owner.handle}`;

  const join = async () => {
    if (!authenticated && !profile) {
      try { localStorage.setItem("perped:crew", crew.slug); localStorage.setItem("perped:ref", crew.owner.handle); } catch {}
      return startGuest ? startGuest() : login();
    }
    setBusy(true); setMsg(null);
    const r = await authedFetch(`/api/crews/${crew.slug}/join`, { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Try again" }));
    setBusy(false);
    if (r.error) setMsg(r.error); else { setMsg(r.credited ? `You're in. @${crew.owner.handle} brought you in, so your fees drop to the invite rate.` : "You're in."); mutate(); }
  };
  const leave = async () => { await authedFetch(`/api/crews/${crew.slug}/join`, { method: "DELETE" }); mutate(); };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const share = async () => { try { await navigator.share?.({ title: crew.name, text: `Join ${crew.name} on Perped`, url: link }); } catch { copy(); } };

  return (
    <div className="fade-in pb-10" data-tint="gold">
      <header className="flex items-center justify-between px-4 py-3"><Link href="/crews" className="iconbtn" aria-label={tt("All crews")}><Icon d={I.back} /></Link><div className="name">{tt("Crew")}</div><button className="iconbtn" aria-label={tt("Share crew")} onClick={share}><Icon d={I.share} /></button></header>
      <div className="px-4">
        <section className="crew-hero">
          <div className="crew-hero-top">
            <CrewEmblem tag={crew.tag} size={64} />
            <div className="min-w-0 flex-1">
              <h1>{crew.name}</h1>
              <Link href={`/u/${crew.owner.handle}`} className="crew-by"><Avatar handle={crew.owner.handle} url={crew.owner.avatarUrl} size={20} link={false} />{tt("Run by @")}{crew.owner.handle}<Badges u={crew.owner} /></Link>
            </div>
          </div>
          {crew.bio && <p className="crew-bio">{crew.bio}</p>}
          <div className="crew-kpis">
            <div><small>{tt("Members")}</small><b className="mono">{crew.members}</b></div>
            <div><small>{tt("War rank")}</small><b className="mono">{crew.rank ? `#${crew.rank}` : "—"}</b></div>
            <div><small>{tt("Fades this week")}</small><b className="mono">{crew.wins}–{crew.losses}</b></div>
            <div><small>{tt("7-day PnL")}</small><b className={`mono ${crew.pnl7d > 0 ? "green" : crew.pnl7d < 0 ? "red" : ""}`}>{fmtUsd(crew.pnl7d, { sign: true, compact: true })}</b></div>
          </div>
          {viewer.isOwner ? (
            <div className="inv-code"><span className="mono">{link.replace(/^https?:\/\//, "")}</span><button onClick={copy}>{copied ? tt("Copied") : tt("Copy")}</button></div>
          ) : viewer.member ? (
            <div className="crew-in"><span>{tt("You’re in this crew")}</span><button onClick={leave}>{tt("Leave")}</button></div>
          ) : (
            <button className="crew-join" disabled={busy || !!viewer.otherCrew?.isOwner} onClick={join}>{busy ? tt("Joining…") : viewer.otherCrew ? `Switch to ${crew.name}` : `Join ${crew.name}`}</button>
          )}
          {viewer.otherCrew && !viewer.member && <p className="crew-note">{viewer.otherCrew.isOwner ? `You run ${viewer.otherCrew.name}, so you can't join another crew.` : `You'll leave ${viewer.otherCrew.name}.`}</p>}
          {msg && <p className="crew-note">{msg}</p>}
        </section>

        {viewer.isOwner && <OwnerTools data={data} onChanged={mutate} />}
      </div>

      <div className="pf-pillbar mt-4"><div className="pf-pills" role="tablist">
        {([["members", tt("Members")], ["trades", tt("Trades")]] as const).map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}><span className="pf-pl">{l}</span>{t === "members" && <small className="mono">{crew.members}</small>}</button>)}
      </div></div>

      {tab === "members" && data.members.map((m, i) => (
        <Link key={m.handle} href={`/u/${m.handle}`} className="lb">
          <span className="rank">{i + 1}</span>
          <Avatar handle={m.handle} url={m.avatarUrl} size={44} link={false} xp={m.xp} />
          <div className="min-w-0 flex-1">
            <div className="nrow name"><span className="truncate">{m.handle}</span><Badges u={m} />{m.isOwner && <span className="crew-you">{tt("Owner")}</span>}{m.isDemo && <span className="lbl done" style={{ padding: "1px 6px", fontSize: 10 }}>{tt("Demo")}</span>}</div>
            <div className="when truncate">{m.closedTrades}{" "}{tt("trades ·")}{" "}{fmtPct(m.winRate, 0)}{" "}{tt("win · fades this week")}{" "}{m.weekWins}–{m.weekLosses}</div>
          </div>
          <div className={`mono text-[16px] font-bold ${m.pnl30d > 0 ? "green" : m.pnl30d < 0 ? "red" : ""}`}>{fmtUsd(m.pnl30d, { sign: true, compact: true })}<div className="when text-right font-normal">30d</div></div>
        </Link>
      ))}
      {tab === "trades" && (!feed ? <SkeletonList n={3} /> : feed.posts.length ? feed.posts.map((item) => <FeedPost key={item.post.id} item={item} mid={item.post.coin ? mids[item.post.coin] : undefined} onChanged={mutateFeed} />) : <p className="muted p-5 text-sm">{tt("No trades from this crew yet.")}</p>)}
    </div>
  );
}

/** Owner-only: Telegram hookup and the earnings estimate. */
function OwnerTools({ data, onChanged }: { data: Res; onChanged: () => void }) {
  const { authedFetch } = useSession();
  const { crew } = data;
  const [code, setCode] = useState<string | null>(null), [err, setErr] = useState<string | null>(null);
  const connect = async () => {
    setErr(null);
    const r = await authedFetch(`/api/crews/${crew.slug}/telegram`, { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Try again" }));
    if (r.code) setCode(r.code); else setErr(r.error ?? "Couldn't make a code");
  };
  const unlink = async () => { await authedFetch(`/api/crews/${crew.slug}/telegram`, { method: "DELETE" }); setCode(null); onChanged(); };
  const toggleMembers = async () => { await authedFetch(`/api/crews/${crew.slug}`, { method: "PATCH", body: JSON.stringify({ tgMembers: !crew.tgMembers }) }); onChanged(); };
  return (
    <>
      <section className="inv-card">
        <div className="flex items-center justify-between gap-2"><span className="eyebrow">{tt("Telegram")}</span><span className={`adm-st ${crew.telegram ? "ok" : ""}`}>{crew.telegram ? `Posting to ${crew.telegram.title ?? "your group"}` : tt("Not connected")}</span></div>
        {!data.telegram.available ? (
          <p className="when mt-1.5">{tt("The Perped bot is being switched on. Once it’s live you’ll connect your group here, and every trade and call you make posts there with Copy and Fade buttons.")}</p>
        ) : crew.telegram ? (
          <>
            <p className="when mt-1.5">{tt("Your trades, closes and calls post to the group with Copy and Fade buttons. Anyone who taps through joins your crew on your link.")}</p>
            <div className="srow" style={{ paddingLeft: 0, paddingRight: 0 }}><span>{tt("Also post members’ trades")}</span><button className={`chip ${crew.tgMembers ? "on" : ""}`} onClick={toggleMembers}>{crew.tgMembers ? tt("On") : tt("Off")}</button></div>
            <button className="chip" onClick={unlink}>{tt("Disconnect")}</button>
          </>
        ) : code ? (
          <ol className="crew-steps">
            <li>{tt("Add")}{" "}{data.telegram.bot ? <a href={`https://t.me/${data.telegram.bot}?startgroup=link`} target="_blank" rel="noreferrer" className="underline">@{data.telegram.bot}</a> : tt("the Perped bot")}{" "}{tt("to your group or channel.")}</li>
            <li>{tt("Send this message there:")}{" "}<b className="mono">/link {code}</b></li>
            <li>{tt("Come back here: it shows as connected.")}</li>
          </ol>
        ) : (
          <>
            <p className="when mt-1.5">{tt("Post your trades and calls straight into your Telegram group, with Copy and Fade buttons that bring people into your crew.")}</p>
            <button className="btn ink mt-3 w-full" style={{ padding: 12 }} onClick={connect}>{tt("Connect Telegram")}</button>
          </>
        )}
        {err && <p className="red mt-2 text-sm">{err}</p>}
      </section>
      {data.owner && <EarningsCalc sharePct={data.owner.invitePct} title={tt("What your crew could earn you")} />}
    </>
  );
}
