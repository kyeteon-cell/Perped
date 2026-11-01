"use client";

import { Glyph } from "@/components/Glyph";
import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useMids } from "@/lib/hooks/useMids";
import { useSession } from "@/lib/hooks/useSession";
import { ManageTrade } from "@/components/ManageTrade";
import { ChallengeSheet } from "@/components/ChallengeSheet";
import { fmtPct, fmtPrice, fmtUsd, pnlForPosition, timeAgo } from "@/lib/format";
import { Avatar, Badges, CoinMark, Icon, I, ticker, SkeletonList, RankChip, RankEmblem } from "@/components/ui";
import { rankFor } from "@/lib/rank";
import { BattleArena, type Fighter } from "@/components/BattleArena";
import { RevengeButton } from "@/components/Bloodbath";
import { isFightNight } from "@/lib/fightnight";
import { QuickTrade, legItem } from "@/components/QuickTrade";
import { Tug } from "@/components/Tug";
import { BattleShare } from "@/components/BattleShare";
import type { Post, Stats } from "@/lib/schema";

type U = { id: string; handle: string; avatarUrl: string | null; verified: boolean; isDemo: boolean; bio: string | null; xp?: number; role?: string | null; founderSeat?: number | null; founderStatus?: string | null };
type Res = {
  fade: Post; target: Post; fader: { user: U; stats: Stats | null }; targetUser: { user: U; stats: Stats | null };
  history: { id: number; userId: string; coin: string; pnl: string | null; closedAt: string | null; side: "long" | "short"; leverage: number | null; entryPx: string; exitPx: string | null }[];
  record: { fader: number; target: number }; camps: { copied: number; faded: number }; error?: string;
  battle: { id: number; status: "open" | "settled"; winnerId: string | null; faderRoi: string | null; targetRoi: string | null; reason: string | null; xpFader: number | null; xpTarget: number | null; settledAt: string | null } | null;
  nemesis?: { fights: number; faderWins: number; targetWins: number; draws: number; meeting: number } | null;
};

function roi(p: Post, mid: number) {
  const entry = Number(p.entryPx); const mark = p.status === "open" ? (mid || entry) : Number(p.exitPx ?? entry);
  const { pnl, pct } = pnlForPosition(p.side!, entry, mark, Number(p.size));
  return { pnl, roi: pct * (p.leverage ?? 1) };
}

/** /battle/:id — a fade as a head-to-head: live score, the two positions, trader vs trader stats, and their history. */
export default function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, mutate } = useSWR<Res>(`/api/battle/${id}`, { refreshInterval: 15_000 });
  const [manage, setManage] = useState<Res["fade"] | null>(null);
  const [rematch, setRematch] = useState<string | null>(null);
  const [sideWith, setSide] = useState<null | { p: Post; u: U }>(null);
  const [shared, setShared] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const shareWin = async (opp: string) => {
    const url = window.location.href, text = `I just perped @${opp} on Perped`;
    try {
      if (navigator.share) { await navigator.share({ title: "Perped", text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`); setShared("Link copied ✓");
    } catch { /* cancelled */ }
  };
  const [pinOverride, setPinOverride] = useState<boolean | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const { mids } = useMids();
  const { profile, authedFetch } = useSession();
  if (!data) return <SkeletonList n={2} />;
  if (data.error) return <p className="muted p-5 text-sm">That isn&apos;t a fade.</p>;
  const { fade, target, fader, targetUser: tu, history, record, camps, battle, nemesis } = data;
  const myPost = profile ? (profile.id === fader.user.id ? fade : profile.id === tu.user.id ? target : null) : null;
  const pinnedWin = pinOverride ?? !!myPost?.pinned;
  const pinWin = async () => {
    if (!myPost) return;
    setPinBusy(true); setPinOverride(!pinnedWin);
    const r = await authedFetch(`/api/posts/${myPost.id}/pin`, { method: "POST" });
    if (r.ok) { const j = await r.json(); setPinOverride(!!j.pinned); } else setPinOverride(null);
    setPinBusy(false);
  };
  const coin = fade.coin!; const mid = mids[coin] ?? 0;
  const a = roi(fade, mid), b = roi(target, mid);
  const live = fade.status === "open" && target.status === "open";
  // Bank and chase: one side closed, the other still in, battle not settled yet.
  const chasing = !live && battle?.status !== "settled" && (fade.status === "open" || target.status === "open");
  const fBanked = fade.status === "closed";
  const faderLeads = a.roi > b.roi;
  const share = Math.max(8, Math.min(92, 50 + ((a.roi - b.roi) / (Math.abs(a.roi) + Math.abs(b.roi) || 1)) * 50));
  const fighter = (u: U, p: Post, r: { roi: number }): Fighter => ({
    handle: u.handle, avatarUrl: u.avatarUrl, side: p.side as "long" | "short", lev: p.leverage ?? 1, entry: Number(p.entryPx),
    tp: p.tpPx ? Number(p.tpPx) : null, sl: p.slPx ? Number(p.slPx) : null, openedAt: p.createdAt,
    margin: p.notionalUsd ? Number(p.notionalUsd) / (p.leverage ?? 1) : null, roi: r.roi,
  });
  const fs = fader.stats, ts = tu.stats;
  const n = (v: unknown) => Number(v ?? 0);
  const rows: { k: string; a: string; b: string; win: -1 | 0 | 1; }[] = [
    { k: "Win rate", a: `${Math.round(n(fs?.winRate))}%`, b: `${Math.round(n(ts?.winRate))}%`, win: Math.sign(n(fs?.winRate) - n(ts?.winRate)) as -1 | 0 | 1 },
    { k: "30d P&L", a: fmtUsd(n(fs?.realizedPnl30d), { sign: true, compact: true }), b: fmtUsd(n(ts?.realizedPnl30d), { sign: true, compact: true }), win: Math.sign(n(fs?.realizedPnl30d) - n(ts?.realizedPnl30d)) as -1 | 0 | 1 },
    { k: "All time", a: fmtUsd(n(fs?.realizedPnlAll), { sign: true, compact: true }), b: fmtUsd(n(ts?.realizedPnlAll), { sign: true, compact: true }), win: Math.sign(n(fs?.realizedPnlAll) - n(ts?.realizedPnlAll)) as -1 | 0 | 1 },
    { k: "Trades", a: String(fs?.closedTrades ?? 0), b: String(ts?.closedTrades ?? 0), win: 0 },
    { k: "Calls hit", a: fs?.callsResolved ? `${Math.round((fs.callsHit / fs.callsResolved) * 100)}%` : "—", b: ts?.callsResolved ? `${Math.round((ts.callsHit / ts.callsResolved) * 100)}%` : "—", win: Math.sign((fs?.callsResolved ? fs.callsHit / fs.callsResolved : 0) - (ts?.callsResolved ? ts.callsHit / ts.callsResolved : 0)) as -1 | 0 | 1 },
    { k: "Copied · faded", a: `${fs?.copiedCount ?? 0} · ${fs?.fadedCount ?? 0}`, b: `${ts?.copiedCount ?? 0} · ${ts?.fadedCount ?? 0}`, win: Math.sign(n(fs?.copiedCount) - n(fs?.fadedCount) - (n(ts?.copiedCount) - n(ts?.fadedCount))) as -1 | 0 | 1 },
    { k: "Liquidations", a: String(fs?.liquidations ?? 0), b: String(ts?.liquidations ?? 0), win: Math.sign(n(ts?.liquidations) - n(fs?.liquidations)) as -1 | 0 | 1 },
  ];

  const Side = ({ u, p, r, left }: { u: U; p: Post; r: { pnl: number; roi: number }; left: boolean }) => (
    <div className={`bside ${left ? "l" : "r"}`}>
      <Link href={`/u/${u.handle}`}><div className={`avring ${(left ? faderLeads : !faderLeads) && (live || chasing) ? "lead" : live || chasing ? "losing" : ""}`}><Avatar handle={u.handle} url={u.avatarUrl} size={64} link={false} /></div></Link>
      <div className="name mt-2 truncate">{u.handle}{u.verified && <span className="vbadge">✓</span>}<Badges u={u} /></div>
      <div className="mt-1 flex items-center justify-center gap-1.5"><RankChip xp={u.xp} compact size={20} />{u.isDemo ? <span className="demo-tag">Demo</span> : <span className="real-tag">Real</span>}</div>
      <span className={`lbl ${p.side} mt-2`}><i />{p.side === "long" ? "Long" : "Short"} {p.leverage}×</span>
      <div className={`mono mt-2 text-[30px] font-bold leading-none ${r.roi >= 0 ? "green" : "red"}`}>{fmtPct(r.roi, 1)}</div>
      <div className={`mono text-[13px] ${r.pnl >= 0 ? "green" : "red"}`}>{fmtUsd(r.pnl, { sign: true })}</div>
      <div className="when mt-1">in at {fmtPrice(p.entryPx)}{p.status === "closed" ? ` · out ${fmtPrice(p.exitPx)}` : ""}</div>
    </div>
  );

  return (
    <div className="fade-in pb-8" data-tint="violet">
      <header className="hairline flex items-center justify-between px-4 py-3"><Link href="/" className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link><div className="name">{nemesis ? "Vendetta" : "Fade"}</div><button className="iconbtn" aria-label="Share this fade" onClick={() => setSharing(true)}><Icon d={I.share} /></button></header>
      {sharing && (() => {
        const fBank = fade.status === "closed", bank = fBank ? a.roi : b.roi, now = fBank ? b.roi : a.roi;
        const banker = fBank ? fader.user.handle : tu.user.handle, chaser = fBank ? tu.user.handle : fader.user.handle;
        const settledBox = battle?.status === "settled";
        const winnerHandle = battle?.winnerId ? (battle.winnerId === fader.user.id ? fader.user.handle : tu.user.handle) : null;
        const f = (u: U, p: Post, r: { roi: number; pnl: number }, lead: boolean) => ({ handle: u.handle, avatarUrl: u.avatarUrl, demo: u.isDemo, side: p.side as "long" | "short", lev: p.leverage ?? 1, roi: settledBox ? Number(p === fade ? battle!.faderRoi : battle!.targetRoi) : r.roi, pnl: r.pnl, entry: Number(p.entryPx), exit: p.status === "closed" && p.exitPx ? Number(p.exitPx) : null, lead });
        const aLead = settledBox ? battle!.winnerId === fader.user.id : faderLeads, bLead = settledBox ? battle!.winnerId === tu.user.id : !faderLeads && a.roi !== b.roi;
        return <BattleShare onClose={() => setSharing(false)} data={{
          coin, price: mid || Number(fade.entryPx), status: live ? "LIVE FADE" : chasing ? "CHASE ON" : "SETTLED", age: `${timeAgo(fade.createdAt)} ago`, faderHandle: fader.user.handle,
          a: f(fader.user, fade, a, aLead), b: f(tu.user, target, b, bLead),
          box: chasing ? { title: "Bank and chase", headline: `${banker} banked`, headlineValue: { text: fmtPct(bank, 1), good: bank >= 0 }, line: `${chaser} needs better than ${fmtPct(bank, 1)} · now ${fmtPct(now, 1)} · ${now > bank ? "on course to win" : "behind"}` }
            : settledBox ? { title: "Verdict", headline: winnerHandle ? `${winnerHandle} perped ${winnerHandle === fader.user.handle ? tu.user.handle : fader.user.handle}` : "Too close to call", line: `${fader.user.handle} ${fmtPct(Number(battle!.faderRoi), 1)} · ${tu.user.handle} ${fmtPct(Number(battle!.targetRoi), 1)}` }
            : null,
          gap: Math.abs(a.roi - b.roi), leaderHandle: (aLead ? fader.user : tu.user).handle, share, url: window.location.href.split("?")[0],
        }} />;
      })()}
      {shared && <div className="share-toast">{shared}</div>}
      {live && isFightNight(fade.createdAt) && <div className="fn-banner"><span className="gl"><Glyph n="glove" />Fight Night fade · winner earns 2× XP</span></div>}
      {nemesis && (
        <div className="nem-banner">
          <span className="nem-tag gl"><Glyph n="skull" />Vendetta</span>
          <span>Meeting #{nemesis.meeting} · {fader.user.handle} <b>{nemesis.faderWins}–{nemesis.targetWins}</b> {tu.user.handle}{nemesis.draws ? ` · ${nemesis.draws} drawn` : ""}</span>
        </div>
      )}

      <section className="battle photo mx-4 mt-4" style={{ backgroundImage: "url(/api/share-bg/hero-fightnight)" }}>
        <div className="flex items-center justify-between"><span className="pc-tag violet">{live ? "● Live fade" : chasing ? "● Chase on" : "Settled fade"} · {timeAgo(fade.createdAt)} ago</span><Link href={`/markets/${coin}`} className="flex items-center gap-1.5 text-sm"><CoinMark coin={coin} size="sm" /><b>{ticker(coin, true)}</b><span className="mono muted">{mid ? fmtPrice(mid) : ""}</span></Link></div>
        <div className="bgrid mt-4">
          {Side({ u: fader.user, p: fade, r: a, left: true })}
          <div className="bmid"><div className="vs">VS</div><div className="when text-[11px] mt-1">{fader.user.handle} faded</div></div>
          {Side({ u: tu.user, p: target, r: b, left: false })}
        </div>
        {chasing && (() => {
          const banker = fBanked ? fader.user : tu.user, chaser = fBanked ? tu.user : fader.user;
          const bank = fBanked ? a.roi : b.roi, now = fBanked ? b.roi : a.roi, ahead = now > bank;
          return (
            <div className={`chase mt-4 ${ahead ? "ahead" : ""}`}>
              <div className="eyebrow gl"><Glyph n="bank" />Bank and chase</div>
              <div className="mt-1 text-[16px] font-extrabold">{banker.handle} banked <span className={`mono ${bank >= 0 ? "green" : "red"}`}>{fmtPct(bank, 1)}</span></div>
              <div className="mt-0.5 text-[13px]">{chaser.handle} needs better than <b className="mono">{fmtPct(bank, 1)}</b> when they close · now <b className={`mono ${now >= 0 ? "green" : "red"}`}>{fmtPct(now, 1)}</b> · {ahead ? "on course to win" : "behind"}</div>
            </div>
          );
        })()}
        {battle?.status === "settled" && (
          <div className="verdict mt-4">
            <div className="flex items-center justify-between"><div className="eyebrow">{battle.winnerId ? "Verdict" : "Draw"}</div>{battle.winnerId && <RankEmblem level={rankFor((battle.winnerId === fader.user.id ? fader.user.xp : tu.user.xp) ?? 0).level} size={40} />}</div>
            <div className="mt-1 text-[17px] font-extrabold">{battle.winnerId ? `${battle.winnerId === fader.user.id ? fader.user.handle : tu.user.handle} perped ${battle.winnerId === fader.user.id ? tu.user.handle : fader.user.handle}` : "Too close to call"}</div>
            <div className="mono when mt-1">{fader.user.handle} {fmtPct(Number(battle.faderRoi), 1)} · {tu.user.handle} {fmtPct(Number(battle.targetRoi), 1)}{battle.reason === "liquidation" ? " · decided by liquidation" : battle.reason === "timeout" ? " · marked at the live price after 7 days" : ""}</div>
            <div className="mt-2 flex gap-2 text-[12px]"><span className="chip">{fader.user.handle} {(battle.xpFader ?? 0) >= 0 ? "+" : ""}{battle.xpFader ?? 0} XP</span><span className="chip">{tu.user.handle} {(battle.xpTarget ?? 0) >= 0 ? "+" : ""}{battle.xpTarget ?? 0} XP</span></div>
          </div>
        )}
        {battle?.status === "settled" && profile && battle.winnerId === profile.id && myPost && (
          <button className={`pinwin ${pinnedWin ? "on" : ""}`} onClick={pinWin} disabled={pinBusy}><span className="gl"><Glyph n="pin" />{pinnedWin ? "Pinned" : "Pin this win"}</span></button>
        )}
        {battle?.status === "settled" && profile && myPost && (() => {
          const opp = profile.id === fader.user.id ? tu.user.handle : fader.user.handle;
          return (
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              <RevengeButton handle={opp} label={<span className="gl"><Glyph n={battle.winnerId === profile.id ? "bolt" : "drop"} />{battle.winnerId === profile.id ? "Run it back" : "Revenge"}</span>} className="btn short runback" />
              <button className="btn" style={{ padding: 11, fontSize: 13 }} onClick={() => setRematch(opp)}><span className="gl"><Glyph n="swords" />Duel {opp}</span></button>
            </div>
          );
        })()}
        {battle?.status === "settled" && profile && battle.winnerId === profile.id && (
          <button className="btn ghost mt-2" style={{ padding: 10, fontSize: 13 }} onClick={() => shareWin(profile.id === fader.user.id ? tu.user.handle : fader.user.handle)}>{shared ?? <span className="gl"><Glyph n="megaphone" />Share: I just perped {profile.id === fader.user.id ? tu.user.handle : fader.user.handle}</span>}</button>
        )}
        <Tug share={share} left={fade.side as "long" | "short"} right={target.side as "long" | "short"} height={10} className="mt-5" />
        {(live || chasing) && <div className="bgap"><span className="bgap-n mono">{fmtPct(Math.abs(a.roi - b.roi), 1).replace(/^[+−-]/, "")}</span><span className="bgap-l">{faderLeads ? fader.user.handle : tu.user.handle} ahead</span></div>}
        <div className="when mt-2 text-center">{live || chasing ? "the gap between their ROIs, live" : `${a.roi > b.roi ? fader.user.handle : tu.user.handle} took it · ${fmtPct(Math.abs(a.roi - b.roi), 1)} gap`}</div>
        {live && profile && (profile.id === fader.user.id || profile.id === tu.user.id) && (
          <button className="btn ink mt-4" style={{ padding: 11, fontSize: 13 }} onClick={() => setManage(profile.id === fader.user.id ? fade : target)}>Manage trade</button>
        )}
        {rematch && <ChallengeSheet handle={rematch} onClose={() => setRematch(null)} />}
        {manage && <ManageTrade post={manage} mid={mid || undefined} onChanged={() => mutate()} onClose={() => setManage(null)} />}
        {live && profile && profile.id !== fader.user.id && profile.id !== tu.user.id && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {/* Spectators: back the leader to finish it, or the trailer for a comeback. */}
            {(() => { const lead = faderLeads ? { p: fade, u: fader.user } : { p: target, u: tu.user }, trail = faderLeads ? { p: target, u: tu.user } : { p: fade, u: fader.user }; return (<>
              <button className="bb-finish bbtn" onClick={() => setSide(lead)}><span className="gl"><Glyph n="dagger" />Finish them</span><small>back {lead.u.handle}</small></button>
              <button className="bb-save bbtn" onClick={() => setSide(trail)}><span className="gl"><Glyph n="buoy" />Save them</span><small>back {trail.u.handle}</small></button>
            </>); })()}
          </div>
        )}
        {sideWith && <QuickTrade item={legItem({ id: sideWith.p.id, coin: sideWith.p.coin!, side: sideWith.p.side as "long" | "short", leverage: sideWith.p.leverage ?? 1 }, { handle: sideWith.u.handle, avatarUrl: sideWith.u.avatarUrl })} mode="copy" lock title="Side with" onClose={() => setSide(null)} />}
      </section>

      {(live || mid > 0) && <BattleArena coin={coin} live={mid || Number(fade.exitPx ?? fade.entryPx)} a={fighter(fader.user, fade, a)} b={fighter(tu.user, target, b)} />}

      <div className="px-5 py-2 text-right"><Link href="/how-it-works#battles" className="when underline">How a fade is won →</Link></div>

      <section className="block">
        <div className="flex items-center justify-between"><span className="eyebrow">Head to head</span><span className="when">{record.fader + record.target ? `record ${record.fader}–${record.target}` : "first meeting"}</span></div>
        <div className="h2h mt-3">
          {rows.map((r) => (
            <div key={r.k} className="h2h-row">
              <span className={`mono ${r.win > 0 ? "win" : ""}`}>{r.a}</span>
              <span className="k">{r.k}</span>
              <span className={`mono ${r.win < 0 ? "win" : ""}`}>{r.b}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="flex items-center justify-between"><span className="eyebrow">This trade</span><span className="when">{camps.copied} copied · {camps.faded} faded</span></div>
        <div className="split mt-3"><i style={{ width: `${(camps.copied / Math.max(1, camps.copied + camps.faded)) * 100}%` }} /></div>
        <div className="mt-1.5 flex justify-between text-[12px]"><span className="green font-bold">with {tu.user.handle}</span><span className="red font-bold">against</span></div>
        {target.body && <p className="say">&ldquo;{target.body}&rdquo; <span className="muted">— {tu.user.handle}</span></p>}
        {fade.body && <p className="say">&ldquo;{fade.body}&rdquo; <span className="muted">— {fader.user.handle}</span></p>}
        <div className="mt-3 flex gap-2"><Link href={`/post/${fade.id}`} className="chip">Fader&apos;s thread</Link><Link href={`/post/${target.id}`} className="chip">Original thread</Link></div>
      </section>

      {history.length > 0 && (
        <section className="block">
          <div className="eyebrow">Previous rounds</div>
          <div className="mt-3 flex flex-col gap-2">
            {history.map((h) => {
              const isFader = h.userId === fader.user.id; const pnl = Number(h.pnl ?? 0);
              const winner = (isFader ? pnl > 0 : pnl < 0) ? fader.user.handle : tu.user.handle;
              return (
                <Link key={h.id} href={`/battle/${h.id}`} className="flex items-center gap-2.5 text-[13px]">
                  <CoinMark coin={h.coin} size="sm" /><span className="w-12 font-bold">{ticker(h.coin)}</span>
                  <span className="muted flex-1 truncate">{isFader ? fader.user.handle : tu.user.handle} faded · {h.side} {h.leverage}×</span>
                  <span className="font-bold">{winner} won</span>
                  <span className="when">{h.closedAt ? timeAgo(h.closedAt) : ""}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
