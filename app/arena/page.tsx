"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { fmtPct, fmtUsd, pnlForPosition, timeAgo } from "@/lib/format";
import { Avatar, CoinMark, RankChip, RankEmblem, SkeletonList, ticker } from "@/components/ui";
import { ChallengeSheet } from "@/components/ChallengeSheet";
import { Sheet } from "@/components/Sheet";
import { rankFor } from "@/lib/rank";
import type { ArenaBattle, ArenaRes } from "@/app/api/arena/route";
import { FollowButton, useFollowing } from "@/components/FollowButton";
import type { ReactNode } from "react";

type Leg = ArenaBattle["faderLeg"];
const liqPx = (l: Leg) => (l.leverage > 1 ? (l.side === "long" ? l.entryPx * (1 - 1 / l.leverage) : l.entryPx * (1 + 1 / l.leverage)) : null);
const liqDist = (l: Leg, mid: number) => { const q = liqPx(l); return q && mid ? Math.abs((mid - q) / mid) * 100 : 100; };
const hpOf = (l: Leg, mid: number) => { const q = liqPx(l); if (!q || !mid) return 1; const h = l.side === "long" ? (mid - q) / (l.entryPx - q) : (q - mid) / (q - l.entryPx); return Math.max(0, Math.min(1, h)); };
type Tab = "all" | "high" | "following" | "blood";
/** Everything the tabs need about one battle, at the live price. */
function readBattle(b: ArenaBattle, mid: number) {
  const settled = b.status === "settled";
  const a = settled ? b.faderRoi ?? 0 : roiOf(b.faderLeg, mid), t = settled ? b.targetRoi ?? 0 : roiOf(b.targetLeg, mid);
  const dA = liqDist(b.faderLeg, mid), dT = liqDist(b.targetLeg, mid);
  const maxLev = Math.max(b.faderLeg.leverage, b.targetLeg.leverage);
  const notional = Math.max(b.faderLeg.size * b.faderLeg.entryPx, b.targetLeg.size * b.targetLeg.entryPx);
  const minLiq = Math.min(dA, dT), closer = dA <= dT ? b.fader : b.target;
  const hpMin = Math.min(hpOf(b.faderLeg, mid), hpOf(b.targetLeg, mid));
  const worst = Math.min(a, t), loser = a <= t ? b.fader : b.target, winner = a <= t ? b.target : b.fader, gap = Math.abs(a - t);
  const high = maxLev >= 20 || notional >= 5000 || minLiq <= 10;
  const heat = Math.min(5, 1 + (maxLev >= 10 ? 1 : 0) + (maxLev >= 20 ? 1 : 0) + (maxLev >= 40 ? 1 : 0) + (minLiq < 5 ? 1 : 0));
  const blood = worst <= -30 || hpMin <= 0.3 || gap >= 40;
  const risk = (maxLev * Math.max(1, notional / 100)) / (minLiq + 0.5);
  return { a, t, maxLev, minLiq, closer, worst, loser, winner, gap, high, heat, blood, risk };
}

const roiOf = (l: ArenaBattle["faderLeg"], mid: number) => {
  const mark = l.status === "open" ? mid || l.entryPx : l.exitPx ?? l.entryPx;
  return pnlForPosition(l.side, l.entryPx, mark, l.size).pct * l.leverage;
};

function BattleRow({ b, mid, badge }: { b: ArenaBattle; mid: number; badge?: ReactNode }) {
  const settled = b.status === "settled";
  const a = settled ? b.faderRoi ?? 0 : roiOf(b.faderLeg, mid), t = settled ? b.targetRoi ?? 0 : roiOf(b.targetLeg, mid);
  const total = Math.abs(a) + Math.abs(t) || 1;
  const share = Math.max(8, Math.min(92, 50 + ((a - t) / total) * 50));
  const aWin = settled ? b.winnerId === b.fader.id : a > t, tWin = settled ? b.winnerId === b.target.id : t > a;
  return (
    <Link href={`/battle/${b.faderPostId}`} className="arow">
      <div className="flex items-center justify-between gap-2">
        <div className={`aside ${aWin ? "lead" : ""}`}><Avatar handle={b.fader.handle} url={b.fader.avatarUrl} size={34} link={false} /><div className="min-w-0"><div className="truncate text-[13px] font-bold">{b.fader.handle}</div><div className={`mono text-[13px] font-bold ${a >= 0 ? "green" : "red"}`}>{fmtPct(a, 1)}</div></div></div>
        <div className="text-center"><CoinMark coin={b.coin} size="xs" /><div className="when text-[10px]">{settled ? timeAgo(b.settledAt ?? b.createdAt) : "LIVE"}</div></div>
        <div className={`aside r ${tWin ? "lead" : ""}`}><div className="min-w-0 text-right"><div className="truncate text-[13px] font-bold">{b.target.handle}</div><div className={`mono text-[13px] font-bold ${t >= 0 ? "green" : "red"}`}>{fmtPct(t, 1)}</div></div><Avatar handle={b.target.handle} url={b.target.avatarUrl} size={34} link={false} /></div>
      </div>
      <div className="tug mt-2" style={{ height: 6 }}><i style={{ width: `${share}%` }} /></div>
      {badge && <div className="abadge">{badge}</div>}
    </Link>
  );
}

/** Pick someone to call out: rivals and top traders first, or search by handle. */
function CallOut({ onPick, onClose, rivals }: { onPick: (h: string) => void; onClose: () => void; rivals: string[] }) {
  const { profile } = useSession();
  const [q, setQ] = useState("");
  const { data } = useSWR<{ users: { handle: string; avatarUrl: string | null; xp: number }[] }>(`/api/users?q=${encodeURIComponent(q)}`);
  const list = (data?.users ?? []).filter((u) => u.handle !== profile?.handle);
  return (
    <Sheet label="Call someone out" onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="text-lg font-extrabold" data-sheet-handle>Call someone out</div>
        <p className="muted text-sm">Pick a trader. You choose the coin, your side and the clock; they take the other side.</p>
        <input className="field mt-3" placeholder="Search a handle" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {!q && rivals.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{rivals.map((h) => <button key={h} className="chip" onClick={() => onPick(h)}>Rematch {h}</button>)}</div>}
        <div className="mt-2 flex flex-col">
          {list.map((u) => (
            <button key={u.handle} className="lb" style={{ width: "100%", textAlign: "left", background: "none", border: 0 }} onClick={() => onPick(u.handle)}>
              <Avatar handle={u.handle} url={u.avatarUrl} size={36} link={false} />
              <div className="min-w-0 flex-1"><div className="name">{u.handle}<RankChip xp={u.xp} compact /></div><div className="when">{rankFor(u.xp).title} · {u.xp.toLocaleString()} XP</div></div>
              <span className="chip on">⚔ Challenge</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** /arena — the PvP hub. */
export default function ArenaPage() {
  const { authenticated, login, profile, authedFetch } = useSession();
  const { mids } = useMids();
  const { data } = useSWR<ArenaRes>("/api/arena", async () => (await authedFetch("/api/arena")).json(), { refreshInterval: 20_000 });
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const me = data?.me;
  const lvl = rankFor(profile?.xp ?? 0);
  const callOut = () => (authenticated ? setPicking(true) : login());

  return (
    <div className="fade-in pb-8" data-tint="gold">
      <header className="lb-hero" style={{ backgroundImage: "url(/api/share-bg/hero-fightnight)" }}>
        <h1 className="h1" style={{ color: "#fff" }}>Arena</h1>
        <div className="text-[12px]" style={{ color: "rgba(255,255,255,.85)" }}>Fade someone and it&rsquo;s a battle. Call them out and it&rsquo;s a duel. Winner takes the XP.</div>
        <button className="arena-cta mt-3" onClick={callOut}>⚔ Call someone out</button>
      </header>

      {!data && <SkeletonList n={3} card={false} />}

      {me && (
        <section className="block">
          <div className="flex items-center gap-3">
            <RankEmblem level={lvl.level} size={52} />
            <div className="flex-1">
              <div className="eyebrow">Your record</div>
              <div className="mono text-[24px] font-bold"><span className="green">{me.won}</span><span className="muted"> – </span><span className="red">{me.lost}</span>{me.drawn ? <span className="muted text-[15px]"> · {me.drawn} drawn</span> : null}</div>
            </div>
            <div className="text-right"><div className="text-[22px] font-extrabold">{me.streak > 0 ? `🔥 ${me.streak}` : "—"}</div><div className="when text-[11px]">streak · best {me.best}</div></div>
          </div>
        </section>
      )}

      {me && me.challenges.length > 0 && (
        <section className="block">
          <div className="eyebrow" style={{ color: "var(--red)" }}>You&rsquo;ve been called out</div>
          {me.challenges.map((c) => (
            <Link key={c.id} href={`/duels/${c.id}`} className="lb">
              <Avatar handle={c.from.handle} url={c.from.avatarUrl} size={40} link={false} />
              <div className="min-w-0 flex-1"><div className="name">{c.from.handle}</div><div className="when">{c.side} {ticker(c.coin)} · {fmtUsd(c.stakeUsd)} each · {c.hours}h</div></div>
              <span className="chip on">Answer</span>
            </Link>
          ))}
        </section>
      )}

      {data && <LiveTabs data={data} mids={mids} me={profile?.handle ?? null} />}

      {me && me.rivals.length > 0 && (
        <section className="block">
          <div className="eyebrow">Your rivals</div>
          {me.rivals.map((r) => (
            <div key={r.user.id} className="lb">
              <Avatar handle={r.user.handle} url={r.user.avatarUrl} size={40} />
              <div className="min-w-0 flex-1"><Link href={`/rivalry/${profile?.handle}/${r.user.handle}`} className="name">{r.user.handle}<RankChip xp={r.user.xp} compact /></Link><Link href={`/rivalry/${profile?.handle}/${r.user.handle}`} className="mono when block"><span className="green">{r.won}W</span> · <span className="red">{r.lost}L</span> · see the series →</Link></div>
              <button className="chip on" onClick={() => setTarget(r.user.handle)}>Rematch</button>
            </div>
          ))}
        </section>
      )}

      {data && data.streaks.length > 0 && (
        <section className="block">
          <div className="eyebrow">Hot streaks</div>
          <div className="hstrip mt-2" style={{ margin: "8px -20px 0", padding: "0 20px 4px" }}>
            {data.streaks.map((s) => (
              <div key={s.user.id} className="hcard text-center" style={{ width: 120 }}>
                <div className="flex justify-center"><Avatar handle={s.user.handle} url={s.user.avatarUrl} size={44} /></div>
                <div className="name mt-1.5 truncate text-[13px]">{s.user.handle}</div>
                <div className="text-[18px] font-extrabold">🔥 {s.streak}</div>
                {profile?.handle !== s.user.handle && <button className="chip mt-1.5 w-full justify-center" style={{ fontSize: 11, padding: "5px 8px" }} onClick={() => (authenticated ? setTarget(s.user.handle) : login())}>Break it</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {data && data.recent.length > 0 && (
        <section className="block">
          <div className="eyebrow">Recent results</div>
          <div className="mt-2 flex flex-col gap-2">{data.recent.map((b) => <BattleRow key={b.id} b={b} mid={mids[b.coin] ?? 0} />)}</div>
        </section>
      )}

      <div className="px-5 py-2 text-center"><Link href="/how-it-works#battles" className="when underline">How battles and duels are scored →</Link></div>

      {picking && <CallOut rivals={(me?.rivals ?? []).map((r) => r.user.handle)} onClose={() => setPicking(false)} onPick={(h) => { setPicking(false); setTarget(h); }} />}
      {target && <ChallengeSheet handle={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

/** Live battles split four ways: All · High stakes · Following · Bloodbath. */
function LiveTabs({ data, mids, me }: { data: ArenaRes; mids: Record<string, number>; me: string | null }) {
  const [tab, setTab] = useState<Tab>("all");
  const { set: follow } = useFollowing();
  const rivals = new Set((data.me?.rivals ?? []).map((r) => r.user.handle));
  const rows = data.live.map((b) => ({ b, r: readBattle(b, mids[b.coin] ?? 0) }));
  const mine = (b: ArenaBattle) => !!me && (b.fader.handle === me || b.target.handle === me);
  const followed = (b: ArenaBattle) => follow.has(b.fader.handle) || follow.has(b.target.handle) || rivals.has(b.fader.handle) || rivals.has(b.target.handle);
  const high = rows.filter((x) => x.r.high).sort((x, y) => y.r.risk - x.r.risk);
  const fol = rows.filter((x) => mine(x.b) || followed(x.b)).sort((x, y) => Number(mine(y.b)) - Number(mine(x.b)) || +new Date(y.b.createdAt) - +new Date(x.b.createdAt));
  const blood = rows.filter((x) => x.r.blood).sort((x, y) => y.r.gap - x.r.gap);
  const rekt = (data.rekt ?? []).map((b) => ({ b, r: readBattle(b, mids[b.coin] ?? 0) }));
  const tabs: { k: Tab; label: string; n: number }[] = [
    { k: "all", label: "All", n: rows.length },
    { k: "high", label: "🔥 High stakes", n: high.length },
    { k: "following", label: "👥 Following", n: fol.length },
    { k: "blood", label: "💀 Bloodbath", n: blood.length + rekt.length },
  ];
  const flames = (n: number) => "🔥".repeat(n);
  const tag = (b: ArenaBattle) => mine(b) ? "your battle" : rivals.has(b.fader.handle) ? `your rival ${b.fader.handle}` : rivals.has(b.target.handle) ? `your rival ${b.target.handle}` : follow.has(b.fader.handle) ? `you follow ${b.fader.handle}` : follow.has(b.target.handle) ? `you follow ${b.target.handle}` : "";
  const list = tab === "all" ? rows : tab === "high" ? high : tab === "following" ? fol : blood;
  return (
    <section className="block">
      <div className="flex items-center justify-between"><span className="eyebrow flex items-center gap-2"><i className="livedot" />Live battles</span><span className="when">{rows.length} live</span></div>
      <div className="seg mt-3">
        {tabs.map((t) => <button key={t.k} className={`chip ${tab === t.k ? "on" : ""}`} onClick={() => setTab(t.k)}>{t.label}<span className="atab-n">{t.n}</span></button>)}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {tab === "blood" && rekt.map(({ b, r }) => (
          <BattleRow key={`rekt${b.id}`} b={b} mid={mids[b.coin] ?? 0} badge={<><span className="rekt">REKT</span><b>{r.loser.handle}</b> got liquidated by <b>{r.winner.handle}</b></>} />
        ))}
        {list.map(({ b, r }) => (
          <BattleRow key={b.id} b={b} mid={mids[b.coin] ?? 0} badge={
            tab === "high" ? <><span>{flames(r.heat)}</span><b className="mono">{b.faderLeg.leverage}× vs {b.targetLeg.leverage}×</b>{r.minLiq < 50 && <span className="ab-warn">{r.closer.handle} liq in {r.minLiq.toFixed(1)}%</span>}</>
            : tab === "blood" ? <><span>💀</span><b>{r.loser.handle}</b><b className="mono red">{fmtPct(r.worst, 0)}</b>{r.minLiq < 50 && <span className="ab-warn">liq in {r.minLiq.toFixed(1)}%</span>}<span className="ml-auto muted">{r.winner.handle} 👑</span></>
            : tab === "following" && tag(b) ? <span className="ab-tag">{tag(b)}</span>
            : undefined
          } />
        ))}
        {!list.length && !(tab === "blood" && rekt.length) && (
          tab === "following" ? (
            <div className="aempty">
              <p className="muted text-sm">Follow traders to fill this tab. Their battles show up here the moment they fade or get faded.</p>
              <div className="mt-2 flex flex-col gap-2">{data.streaks.slice(0, 3).map((s) => (
                <div key={s.user.id} className="flex items-center gap-2.5"><Avatar handle={s.user.handle} url={s.user.avatarUrl} size={30} /><span className="flex-1 truncate text-[14px] font-bold">{s.user.handle}<span className="when ml-1.5">🔥 {s.streak} streak</span></span><FollowButton handle={s.user.handle} compact /></div>
              ))}</div>
            </div>
          ) : <p className="muted text-sm">{tab === "high" ? "No high-stakes battles right now. Nobody's above 20× or near liquidation." : tab === "blood" ? "No bloodbaths right now. Everyone's still standing." : "No battles running. Fade a trade in the feed to start one."}</p>
        )}
      </div>
    </section>
  );
}
