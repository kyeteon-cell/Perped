"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { Sheet } from "./Sheet";
import { Sparkline } from "./Sparkline";
import { CoinMark, ticker } from "./ui";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { demoLiqPx, fmtPct, fmtPrice, fmtUsd, pnlForPosition } from "@/lib/format";
import type { FeedRow } from "@/lib/feed";

const ManageTrade = dynamic(() => import("./ManageTrade").then((m) => m.ManageTrade), { ssr: false });

// Pages with their own bottom bar (comment box, trade ticket, search) don't get the pill on top of it.
const HIDE = [/^\/post\//, /^\/trade/, /^\/search/, /^\/onboarding/, /^\/admin/, /^\/c\//];

/** Live "3 open · +$42" pill above the nav whenever you have trades open; tap for all of them in a sheet. */
export function PositionsPill() {
  const { profile, authedFetch, refreshMe } = useSession();
  const path = usePathname() ?? "/";
  const { mids } = useMids();
  const key = profile ? `/api/posts?handle=${profile.handle}&kind=trade&status=open&limit=50` : null;
  const { data, mutate } = useSWR<{ posts: FeedRow[] }>(key, { refreshInterval: 30_000 });
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState<FeedRow["post"] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const rows = (data?.posts ?? []).filter((r) => r.post.kind === "trade" && r.post.status === "open");
  if (!profile || !rows.length || HIDE.some((r) => r.test(path))) return null;

  const live = rows.map(({ post }) => {
    const entry = Number(post.entryPx), size = Number(post.size), lev = post.leverage ?? 1;
    const px = Number(mids[post.coin ?? ""] ?? entry);
    const { pnl, pct } = pnlForPosition(post.side as "long" | "short", entry, px, size);
    return { post, px, pnl, roi: pct * lev, margin: Number(post.notionalUsd) / lev };
  });
  const total = live.reduce((a, x) => a + x.pnl, 0), margin = live.reduce((a, x) => a + x.margin, 0);
  const coins = [...new Set(live.map((x) => x.post.coin!))].slice(0, 3);
  const refresh = () => { mutate(); void Promise.resolve(refreshMe?.()).catch(() => null); };

  // Demo trades close right here at the live price; real ones go through Manage (they need your wallet).
  const quickClose = async (id: number, fraction: number) => {
    setBusy(id); setErr(null);
    const r = await authedFetch(`/api/posts/${id}/close`, { method: "POST", body: JSON.stringify({ fraction }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach Perped" };
    setBusy(null);
    if (!r?.ok) return setErr(j.error ?? "Couldn't close that trade");
    refresh();
  };

  return (
    <>
      <button type="button" className="pos-pill" onClick={() => setOpen(true)} aria-label={`${rows.length} open trades, ${fmtUsd(total, { sign: true })}`}>
        <span className="pos-stack">{coins.map((c) => <CoinMark key={c} coin={c} size="xs" />)}</span>
        <span>{rows.length} open</span>
        <b className={`mono ${total >= 0 ? "green" : "red"}`}>{fmtUsd(total, { sign: true })}</b>
        <span className="pos-go" aria-hidden>›</span>
      </button>

      {open && (
        <Sheet label="Your trades" onClose={() => setOpen(false)}>
          <div className="pos-sheet">
            <div className="pos-h"><b>Your trades</b><span>{profile.isDemo ? "Demo · " : ""}updates live</span></div>
            <div className="pos-tot">
              <div><small>Open P&amp;L</small><b className={`mono ${total >= 0 ? "green" : "red"}`}>{fmtUsd(total, { sign: true })}</b></div>
              <div><small>In margin</small><b className="mono">{fmtUsd(margin)}</b></div>
              {profile.isDemo && <div><small>Balance</small><b className="mono">{fmtUsd(Number(profile.demoBalance ?? 0))}</b></div>}
            </div>
            {err && <p className="pos-err">{err}</p>}
            {live.map(({ post, px, pnl, roi }) => {
              const side = post.side as "long" | "short", lev = post.leverage ?? 1;
              const liq = demoLiqPx(side, Number(post.entryPx), lev);
              return (
                <div key={post.id} className="pos-card">
                  <div className="pos-r1">
                    <CoinMark coin={post.coin!} size="sm" />
                    <div className="pos-mid">
                      <b>{ticker(post.coin!)} <span className={`lbl ${side}`}><i />{side === "long" ? "Long" : "Short"} {lev}×</span></b>
                      <span className="mono">{fmtPrice(Number(post.entryPx))} → {fmtPrice(px)}{post.paper && lev > 1 ? ` · liq ${fmtPrice(liq)}` : ""}</span>
                    </div>
                    <div className="pos-pnl"><b className={`mono ${pnl >= 0 ? "green" : "red"}`}>{fmtUsd(pnl, { sign: true })}</b><small className={`mono ${roi >= 0 ? "green" : "red"}`}>{fmtPct(roi, 1)}</small></div>
                  </div>
                  <div className="pos-spark"><Sparkline coin={post.coin!} up={pnl >= 0} wide /></div>
                  <div className="pos-acts">
                    <Link href={`/markets/${post.coin}`} onClick={() => setOpen(false)}>Chart</Link>
                    <button type="button" onClick={() => setManage(post)}>Stop / target</button>
                    {post.paper ? <>
                      <button type="button" disabled={busy === post.id} onClick={() => quickClose(post.id, 0.5)}>Close half</button>
                      <button type="button" disabled={busy === post.id} onClick={() => quickClose(post.id, 1)}>{busy === post.id ? "…" : "Close"}</button>
                    </> : <button type="button" onClick={() => setManage(post)}>Close</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </Sheet>
      )}
      {manage && <ManageTrade post={manage} mid={Number(mids[manage.coin ?? ""] ?? 0) || undefined} onChanged={refresh} onClose={() => setManage(null)} />}
    </>
  );
}
