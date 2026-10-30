"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useMids } from "@/lib/hooks/useMids";
import { useSession } from "@/lib/hooks/useSession";
import { fmtPct, fmtPrice, fmtUsd, pnlForPosition, timeAgo } from "@/lib/format";
import { Avatar, CoinMark, Icon, I, ticker, SkeletonList } from "@/components/ui";
import type { Post, Stats } from "@/lib/schema";

type U = { id: string; handle: string; avatarUrl: string | null; verified: boolean; isDemo: boolean; bio: string | null };
type Res = {
  fade: Post; target: Post; fader: { user: U; stats: Stats | null }; targetUser: { user: U; stats: Stats | null };
  history: { id: number; userId: string; coin: string; pnl: string | null; closedAt: string | null; side: "long" | "short"; leverage: number | null; entryPx: string; exitPx: string | null }[];
  record: { fader: number; target: number }; camps: { copied: number; faded: number }; error?: string;
};

function roi(p: Post, mid: number) {
  const entry = Number(p.entryPx); const mark = p.status === "open" ? (mid || entry) : Number(p.exitPx ?? entry);
  const { pnl, pct } = pnlForPosition(p.side!, entry, mark, Number(p.size));
  return { pnl, roi: pct * (p.leverage ?? 1) };
}

/** /battle/:id — a fade as a head-to-head: live score, the two positions, trader vs trader stats, and their history. */
export default function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useSWR<Res>(`/api/battle/${id}`, { refreshInterval: 15_000 });
  const { mids } = useMids();
  const { profile } = useSession();
  if (!data) return <SkeletonList n={2} />;
  if (data.error) return <p className="muted p-5 text-sm">That isn&apos;t a fade.</p>;
  const { fade, target, fader, targetUser: tu, history, record, camps } = data;
  const coin = fade.coin!; const mid = mids[coin] ?? 0;
  const a = roi(fade, mid), b = roi(target, mid);
  const live = fade.status === "open" && target.status === "open";
  const faderLeads = a.roi > b.roi;
  const share = Math.max(8, Math.min(92, 50 + ((a.roi - b.roi) / (Math.abs(a.roi) + Math.abs(b.roi) || 1)) * 50));
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
      <Link href={`/u/${u.handle}`}><div className={`avring ${(left ? faderLeads : !faderLeads) && live ? "lead" : live ? "losing" : ""}`}><Avatar handle={u.handle} url={u.avatarUrl} size={64} /></div></Link>
      <div className="name mt-2 truncate">{u.handle}{u.verified && <span className="vbadge">✓</span>}</div>
      <div className="mt-1">{u.isDemo ? <span className="demo-tag">Demo</span> : <span className="real-tag">Real</span>}</div>
      <span className={`lbl ${p.side} mt-2`}><i />{p.side === "long" ? "Long" : "Short"} {p.leverage}×</span>
      <div className={`mono mt-2 text-[30px] font-bold leading-none ${r.roi >= 0 ? "green" : "red"}`}>{fmtPct(r.roi, 1)}</div>
      <div className={`mono text-[13px] ${r.pnl >= 0 ? "green" : "red"}`}>{fmtUsd(r.pnl, { sign: true })}</div>
      <div className="when mt-1">in at {fmtPrice(p.entryPx)}{p.status === "closed" ? ` · out ${fmtPrice(p.exitPx)}` : ""}</div>
    </div>
  );

  return (
    <div className="fade-in pb-8" data-tint="violet">
      <header className="hairline flex items-center justify-between px-4 py-3"><Link href="/" className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link><div className="name">Battle</div><span className="w-9" /></header>

      <section className="battle photo mx-4 mt-4" style={{ backgroundImage: "url(/api/share-bg/hero-fightnight)" }}>
        <div className="flex items-center justify-between"><span className="pc-tag violet">{live ? "● Live fade" : "Settled fade"} · {timeAgo(fade.createdAt)} ago</span><Link href={`/markets/${coin}`} className="flex items-center gap-1.5 text-sm"><CoinMark coin={coin} size="sm" /><b>{ticker(coin, true)}</b><span className="mono muted">{mid ? fmtPrice(mid) : ""}</span></Link></div>
        <div className="bgrid mt-4">
          <Side u={fader.user} p={fade} r={a} left />
          <div className="bmid"><div className="vs">VS</div><div className="when text-[11px] mt-1">{fader.user.handle} faded</div></div>
          <Side u={tu.user} p={target} r={b} left={false} />
        </div>
        <div className="tug mt-5" style={{ height: 10 }}><i style={{ width: `${share}%` }} /></div>
        <div className="when mt-2 text-center">{live ? `${faderLeads ? fader.user.handle : tu.user.handle} is ahead by ${fmtPct(Math.abs(a.roi - b.roi), 1)}` : `${a.roi > b.roi ? fader.user.handle : tu.user.handle} took it · ${fmtPct(Math.abs(a.roi - b.roi), 1)} gap`}</div>
        {live && profile && profile.id !== fader.user.id && profile.id !== tu.user.id && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Link href={`/trade?copy=${fade.id}`} className="btn" style={{ padding: 11, fontSize: 13 }}>Side with {fader.user.handle}</Link>
            <Link href={`/trade?copy=${target.id}`} className="btn" style={{ padding: 11, fontSize: 13 }}>Side with {tu.user.handle}</Link>
          </div>
        )}
      </section>

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
