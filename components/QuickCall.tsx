"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { fmtPct, fmtPrice } from "@/lib/format";
import { CoinMark } from "./ui";
import type { QuickState } from "@/app/api/quick/route";

const COINS = ["BTC", "ETH", "SOL"] as const;

function Countdown({ to }: { to: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, new Date(to).getTime() - Date.now());
  const m = Math.floor(left / 60_000), s = Math.floor((left % 60_000) / 1000);
  return <span className="mono">{m}:{String(s).padStart(2, "0")}</span>;
}

/**
 * The front door: "Where's BTC in an hour?" Two taps and you're in a call against everyone else —
 * no sign-up (a guest account is made on the spot), no leverage, no ticket. The call is a real post
 * that settles against the price it was made at, and counts towards streaks and the leaderboard.
 */
export function QuickCall({ mids }: { mids: Record<string, number> }) {
  const { authenticated, profile, startGuest, refreshMe, authedFetch, isGuest } = useSession();
  const [coin, setCoin] = useState<(typeof COINS)[number]>("BTC");
  const [busy, setBusy] = useState<"long" | "short" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = `/api/quick?coin=${coin}`;
  const { data, mutate } = useSWR<QuickState>(key, async () => (await authedFetch(key)).json(), { refreshInterval: 20_000 });
  const mid = mids[coin] ?? data?.mid ?? 0;

  const pick = async (side: "long" | "short") => {
    setBusy(side); setErr(null);
    try {
      if (!authenticated) { await startGuest(); await refreshMe(); }
      const r = await authedFetch("/api/quick", { method: "POST", body: JSON.stringify({ coin, side }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't lock it in");
      mutate(j, { revalidate: false });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const total = (data?.higher ?? 0) + (data?.lower ?? 0);
  const pctHigher = total ? Math.round(((data?.higher ?? 0) / total) * 100) : 50;
  const mine = data?.mine ?? null;
  const live = mine && mine.fromPx && mid ? ((mid - mine.fromPx) / mine.fromPx) * 100 : 0;
  const winning = mine ? (mine.side === "long" ? live > 0 : live < 0) : false;

  return (
    <section className="qc">
      <div className="flex items-center justify-between">
        <span className="eyebrow">One-hour call</span>
        <div className="flex gap-1">{COINS.map((c) => <button key={c} className={`chip ${c === coin ? "on" : ""}`} style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setCoin(c)}>{c}</button>)}</div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <CoinMark coin={coin} />
        <div>
          <div className="text-[17px] font-extrabold tracking-tight">Where&rsquo;s {coin} in an hour?</div>
          <div className="mono when">now {mid ? fmtPrice(mid) : "…"}{total ? ` · ${total} in` : ""}</div>
        </div>
      </div>

      {mine ? (
        <div className="qc-locked mt-3">
          <div className="flex items-center justify-between">
            <div><b className={mine.side === "long" ? "green" : "red"}>{mine.side === "long" ? "Higher" : "Lower"}</b> from <span className="mono">{fmtPrice(mine.fromPx)}</span></div>
            <div className="when">settles in <Countdown to={mine.deadline} /></div>
          </div>
          <div className={`mono mt-1 text-[22px] font-bold ${winning ? "green" : "red"}`}>{fmtPct(live, 2)} <span className="text-[12px] font-semibold">{winning ? "you're winning" : "you're losing"}</span></div>
          <div className="mt-2 flex gap-2"><Link href={`/post/${mine.postId}`} className="chip">See the call</Link><Link href={`/c/${mine.postId}`} className="chip">Challenge a friend</Link></div>
        </div>
      ) : (
        <div className="qc-btns mt-3">
          <button className="qc-btn up" disabled={!!busy || !mid} onClick={() => pick("long")}>{busy === "long" ? "…" : "▲ Higher"}</button>
          <button className="qc-btn dn" disabled={!!busy || !mid} onClick={() => pick("short")}>{busy === "short" ? "…" : "▼ Lower"}</button>
        </div>
      )}

      <div className="qc-split mt-3"><i style={{ width: `${pctHigher}%` }} /></div>
      <div className="mt-1 flex justify-between text-[11px]"><span className="green font-bold">{pctHigher}% higher</span><span className="red font-bold">{100 - pctHigher}% lower</span></div>
      {err && <p className="red mt-2 text-xs">{err}</p>}
      {!authenticated && <p className="faint mt-2 text-[11px]">No sign-up. Tapping makes you a demo account on the spot — {isGuest ? "" : "practice money, "}real prices.</p>}
      {authenticated && profile?.isDemo && !mine && <p className="faint mt-2 text-[11px]">Counts toward your streak and the leaderboard.</p>}
    </section>
  );
}
