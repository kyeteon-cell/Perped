"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { fmtPct, fmtPrice, fmtUsd, pnlForPosition } from "@/lib/format";
import { Avatar, CoinMark, Icon, I, ticker, SkeletonList } from "@/components/ui";
import type { Duel, Post } from "@/lib/schema";

type U = { id: string; handle: string; avatarUrl: string | null; isDemo: boolean };
type Res = { duel: Duel; challenger: U; opponent: U; challengerPost: Post | null; opponentPost: Post | null; role: "challenger" | "opponent" | "viewer"; error?: string };

/** One duel: who, what, the live score, and accept / decline for the person who was challenged. */
export default function DuelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, mutate } = useSWR<Res>(`/api/duels/${id}`, { refreshInterval: 15_000 });
  const { authedFetch, authenticated, login } = useSession();
  const { mids } = useMids();
  const [busy, setBusy] = useState(false);
  if (!data) return <SkeletonList n={2} />;
  if (data.error) return <p className="muted p-5 text-sm">Duel not found.</p>;
  const { duel: d, challenger, opponent, challengerPost: cp, opponentPost: op, role } = data;
  const mid = mids[d.coin] ?? 0;
  const oppSide = d.challengerSide === "long" ? "short" : "long";
  const live = (p: Post | null, side: "long" | "short") => (p && mid ? pnlForPosition(side, Number(p.entryPx), mid, Number(p.size)).pct * (p.leverage ?? 1) : null);
  const a = live(cp, d.challengerSide), b = live(op, oppSide);
  const left = Math.max(0, new Date(d.settlesAt).getTime() - Date.now());
  const leftTxt = left > 86_400_000 ? `${Math.round(left / 86_400_000)}d left` : left > 0 ? `${Math.max(1, Math.round(left / 3_600_000))}h left` : "settling";
  const decline = async () => { setBusy(true); await authedFetch("/api/duels", { method: "PATCH", body: JSON.stringify({ id: d.id, action: "decline" }) }); setBusy(false); mutate(); };

  const Side = ({ u, side, roi, post }: { u: U; side: "long" | "short"; roi: number | null; post: Post | null }) => (
    <div className="duelist">
      <Link href={`/u/${u.handle}`}><div className={`avring ${roi !== null && roi >= (roi === a ? (b ?? -Infinity) : (a ?? -Infinity)) ? "lead" : ""}`}><Avatar handle={u.handle} url={u.avatarUrl} size={56} link={false} /></div></Link>
      <div className="name mt-2">{u.handle}{u.isDemo && <span className="demo-tag ml-1">Demo</span>}</div>
      <span className={`lbl ${side} mt-1`}><i />{side === "long" ? "Long" : "Short"}</span>
      <div className={`mono mt-2 text-2xl font-bold ${roi === null ? "muted" : roi >= 0 ? "green" : "red"}`}>{roi === null ? (post ? "…" : "not in yet") : fmtPct(roi, 1)}</div>
      {post && <div className="when">in at {fmtPrice(post.entryPx)}</div>}
    </div>
  );

  return (
    <div data-tint="gold" className="fade-in">
      <header className="hairline flex items-center justify-between px-4 py-3"><Link href="/" className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link><div className="name">Duel</div><span className="w-9" /></header>
      <div className="post duel mx-4 mt-4">
        <div className="duel-head"><span className="lbl gold">⚔ {d.status === "pending" ? "Challenge" : d.status === "live" ? "Live" : d.status === "settled" ? "Settled" : "Declined"}</span><span className="when">{fmtUsd(Number(d.stakeUsd))} each · {d.status === "live" ? leftTxt : new Date(d.settlesAt).toLocaleDateString()}</span></div>
        <div className="mt-3 flex items-center gap-2.5"><CoinMark coin={d.coin} /><b className="text-xl">{ticker(d.coin, true)}</b><span className="mono muted ml-auto">{mid ? fmtPrice(mid) : "…"}</span></div>
        <div className="duel-body">
          <Side u={challenger} side={d.challengerSide} roi={a} post={cp} />
          <div className="duel-mid"><div className="vs">VS</div>{d.startPx && <div className="when">from {fmtPrice(d.startPx)}</div>}</div>
          <Side u={opponent} side={oppSide} roi={b} post={op} />
        </div>
        {d.status === "settled" && <p className="say text-center"><b>{d.winnerId === challenger.id ? challenger.handle : opponent.handle}</b> won. {d.startPx && d.endPx ? `${fmtPrice(d.startPx)} → ${fmtPrice(d.endPx)}` : ""}</p>}
        <p className="when mt-3 text-center">Stakes are each trader&apos;s own position. Nothing is pooled, nobody holds anything.</p>
      </div>

      {d.status === "pending" && role === "opponent" && (
        <div className="mx-4 mt-4 grid grid-cols-2 gap-2.5">
          <button className="btn" onClick={decline} disabled={busy}>Decline</button>
          <button className="btn brand" onClick={() => (authenticated ? router.push(`/trade?duel=${d.id}`) : login())}>Accept · go {oppSide}</button>
        </div>
      )}
      {d.status === "pending" && role === "challenger" && !cp && (
        <div className="mx-4 mt-4"><button className="btn brand" onClick={() => router.push(`/trade?duel=${d.id}`)}>Open your {d.challengerSide} on {ticker(d.coin)}</button><p className="when mt-2 text-center">Your side of the duel is your own trade. Place it so the duel can start when {opponent.handle} accepts.</p></div>
      )}
      {d.status === "pending" && role === "challenger" && cp && <p className="muted mx-4 mt-4 text-center text-sm">Waiting for {opponent.handle} to accept.</p>}
      {d.status === "pending" && role === "viewer" && <p className="muted mx-4 mt-4 text-center text-sm">{challenger.handle} challenged {opponent.handle}. Waiting for an answer.</p>}
    </div>
  );
}
