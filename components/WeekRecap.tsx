"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { siteOrigin } from "@/lib/config";
import { fmtPct, fmtUsd } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";

type Recap = { start: string; end: string; fades: { w: number; l: number; d: number }; trades: { n: number; wins: number; pnl: number }; best: { id: number; coin: string; side: string; lev: number; roi: number } | null; xp: number };

/** Home, Monday and Tuesday (or from the weekly alert): your last week in one card, with a share. */
export function WeekRecap() {
  const { profile } = useSession();
  const [show, setShow] = useState(false);
  const [wk, setWk] = useState("");
  useEffect(() => {
    const day = new Date().getUTCDay();
    let forced = false;
    try { forced = new URLSearchParams(window.location.search).get("recap") === "1"; } catch {}
    setShow(forced || day === 1 || day === 2);
  }, []);
  const { data } = useSWR<{ recap: Recap | null }>(profile && show ? "/api/me/recap" : null, { revalidateOnFocus: false });
  const r = data?.recap;
  useEffect(() => { if (r) setWk(r.start.slice(0, 10)); }, [r]);
  const [gone, setGone] = useState(false);
  useEffect(() => { if (wk) try { setGone(localStorage.getItem("perped:recap-hide") === wk); } catch {} }, [wk]);
  if (!profile || !show || !r || gone) return null;
  const hide = () => { setGone(true); try { localStorage.setItem("perped:recap-hide", wk); } catch {} };
  const range = `${new Date(r.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(new Date(r.end).getTime() - 1).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  const fights = r.fades.w + r.fades.l + r.fades.d;
  const share = async () => {
    const text = `My week on Perped: ${fights ? `${r.fades.w}–${r.fades.l} in fades, ` : ""}${fmtUsd(r.trades.pnl, { sign: true })}${r.best ? `, best trade ${r.best.coin} ${fmtPct(r.best.roi, 1)}` : ""}. Fade me:`;
    const url = `${siteOrigin()}/u/${profile.handle}?ref=${profile.handle}`;
    try { if (navigator.share) await navigator.share({ text, url }); else await navigator.clipboard.writeText(`${text} ${url}`); } catch {}
  };
  return (
    <section className="wkr">
      <div className="wkr-top"><span className="wkr-tag">Your week</span><span className="when">{range}</span><button type="button" className="wkr-x" aria-label="Hide" onClick={hide}>×</button></div>
      <div className="wkr-grid">
        <div><small>Fades</small><b className="mono">{fights ? `${r.fades.w}–${r.fades.l}` : "—"}</b></div>
        <div><small>P&amp;L</small><b className={`mono ${r.trades.pnl >= 0 ? "green" : "red"}`}>{fmtUsd(r.trades.pnl, { sign: true })}</b></div>
        <div><small>XP</small><b className="mono">{r.xp >= 0 ? "+" : ""}{r.xp}</b></div>
      </div>
      {r.best && <Link href={`/post/${r.best.id}`} className="wkr-best">Best trade · {r.best.coin} {r.best.side} {r.best.lev}× <b className={`mono ${r.best.roi >= 0 ? "green" : "red"}`}>{fmtPct(r.best.roi, 1)}</b></Link>}
      <div className="wkr-acts"><button type="button" onClick={share}>Share my week</button><Link href="/leaderboard">This week&apos;s board →</Link></div>
    </section>
  );
}
