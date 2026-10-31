"use client";

import Link from "next/link";
import { use, useState } from "react";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { fmtPct, fmtUsd, timeAgo } from "@/lib/format";
import { Avatar, CoinMark, RankChip, SkeletonList, ticker } from "@/components/ui";
import { ChallengeSheet } from "@/components/ChallengeSheet";
import type { PairRes } from "@/app/api/rivalries/pair/route";

/** /rivalry/:a/:b — the series between two traders: scoreboard, runs, money, every fight, rematch and mute. */
export default function RivalryPage({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = use(params);
  const { authedFetch, authenticated, login, profile } = useSession();
  const key = `/api/rivalries/pair?a=${a}&b=${b}`;
  const { data, mutate } = useSWR<PairRes & { error?: string }>(key, async () => (await authedFetch(key)).json(), { refreshInterval: 30_000 });
  const [challenge, setChallenge] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!data) return <SkeletonList n={3} />;
  if (data.error) return <p className="muted p-5 text-sm">No rivalry between those two.</p>;
  const { a: A, b: B } = data;
  const lead = data.aWins === data.bWins ? null : data.aWins > data.bWins ? A.handle : B.handle;
  const me = data.viewer.isA ? A : data.viewer.isB ? B : null;
  const them = data.viewer.isA ? B : data.viewer.isB ? A : null;
  const total = data.aWins + data.bWins || 1;
  const act = async (action: "call" | "mute" | "unmute", handle: string) => {
    if (!authenticated) return login();
    await authedFetch("/api/rivalries", { method: "POST", body: JSON.stringify({ handle, action }) });
    mutate();
  };
  const share = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/rivalry/${A.handle}/${B.handle}${profile ? `?ref=${profile.handle}` : ""}` : "";
    const text = `${A.handle} vs ${B.handle} on Perped · ${data.aWins}–${data.bWins}${lead ? `, ${lead} leads` : ""}`;
    try { if (navigator.share) await navigator.share({ text, url }); else { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } } catch {}
  };

  return (
    <div className="fade-in pb-10" data-tint="red">
      <section className="battle photo" style={{ backgroundImage: "url(/api/share-bg/hero-fightnight)" }}>
        <div className="flex items-center justify-between"><Link href="/arena" className="when" style={{ color: "rgba(255,255,255,.8)" }}>← Arena</Link><button className="when" style={{ color: "rgba(255,255,255,.8)" }} onClick={share}>{copied ? "Link copied" : "Share"}</button></div>
        <div className="mt-3 text-center text-[11px] font-extrabold uppercase tracking-[.14em]" style={{ color: "rgba(255,255,255,.75)" }}>{data.active ? "Rivalry" : `${data.fights} fight${data.fights === 1 ? "" : "s"} · rivals at 3`}{data.calledBy ? ` · called out by ${data.calledBy}` : ""}</div>
        <div className="riv-board mt-3">
          {[A, B].map((u, i) => (
            <Link key={u.id} href={`/u/${u.handle}`} className={`riv-side ${lead === u.handle ? "lead" : ""}`}>
              <div className="relative">{lead === u.handle && <span className="riv-crown">👑</span>}<Avatar handle={u.handle} url={u.avatarUrl} size={68} link={false} /></div>
              <div className="mt-2 font-extrabold" style={{ color: "#fff" }}>{u.handle}</div>
              <RankChip xp={u.xp} />
              <div className="mono mt-2 text-[44px] font-bold leading-none" style={{ color: "#fff" }}>{i === 0 ? data.aWins : data.bWins}</div>
            </Link>
          ))}
        </div>
        <div className="tug neutral mt-4" style={{ height: 8 }}><i style={{ width: `${(data.aWins / total) * 100}%` }} /></div>
        <div className="mt-2 text-center text-[13px]" style={{ color: "rgba(255,255,255,.85)" }}>{lead ? `${lead} leads ${Math.max(data.aWins, data.bWins)}–${Math.min(data.aWins, data.bWins)}` : data.fights ? "All square" : "No fights yet"}{data.draws ? ` · ${data.draws} drawn` : ""}</div>
        {me && them && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn brand" style={{ padding: 11, fontSize: 13 }} onClick={() => setChallenge(them.handle)}>⚔ Rematch</button>
            {data.active
              ? <button className="btn" style={{ padding: 11, fontSize: 13 }} onClick={() => act(data.viewer.muted ? "unmute" : "mute", them.handle)}>{data.viewer.muted ? "Unmute alerts" : "Mute alerts"}</button>
              : <button className="btn" style={{ padding: 11, fontSize: 13 }} onClick={() => act("call", them.handle)}>Call them out</button>}
          </div>
        )}
      </section>

      <section className="block">
        <div className="grid grid-cols-3 gap-2">
          <div className="stat"><small>Current run</small><div className="v">{data.runHolder ? `${data.runHolder} ×${data.runLen}` : "—"}</div></div>
          <div className="stat"><small>Longest run</small><div className="v">{data.bestRunHolder ? `${data.bestRunHolder} ×${data.bestRun}` : "—"}</div></div>
          <div className="stat"><small>Fights</small><div className="v mono">{data.fights}</div></div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="stat"><small>{A.handle} made</small><div className={`v mono ${data.pnlA >= 0 ? "green" : "red"}`}>{fmtUsd(data.pnlA, { sign: true })}</div></div>
          <div className="stat"><small>{B.handle} made</small><div className={`v mono ${data.pnlB >= 0 ? "green" : "red"}`}>{fmtUsd(data.pnlB, { sign: true })}</div></div>
        </div>
        <p className="faint mt-2 text-[11px]">P&amp;L across the battles between them. Duels are scored on direction, not size.</p>
      </section>

      <section className="block">
        <div className="eyebrow">Every fight</div>
        {data.history.length === 0 && <p className="muted mt-2 text-sm">Nothing yet. Fade one of their trades or send a duel to start the series.</p>}
        <div className="mt-2 flex flex-col">
          {data.history.map((f) => (
            <Link key={`${f.kind}-${f.id}`} href={f.href} className="riv-row">
              <CoinMark coin={f.coin} size="xs" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold">{f.winner ? `${f.winner} won` : "Draw"} <span className="when font-normal">· {f.kind} · {ticker(f.coin)}</span></div>
                {f.roiA != null && <div className="mono when text-[12px]">{A.handle} {fmtPct(f.roiA, 1)} · {B.handle} {fmtPct(f.roiB ?? 0, 1)}</div>}
              </div>
              <span className="when text-[11px]">{timeAgo(f.at)}</span>
            </Link>
          ))}
        </div>
      </section>

      {challenge && <ChallengeSheet handle={challenge} onClose={() => setChallenge(null)} />}
    </div>
  );
}
