"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { Sheet } from "./Sheet";
import { MiniHp, type Fighter } from "./BattleArena";
import { Roll } from "./Roll";
import { ArenaIntro } from "./ArenaIntro";
import { toMarkers, useMarketTraders } from "./MarketTape";
import type { ChartMarker } from "./PriceChart";
import { Avatar, CoinMark, ticker } from "./ui";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { demoLiqPx, fmtPct, fmtPrice, fmtUsd, pnlForPosition, tradeRoiPct } from "@/lib/format";
import type { FeedRow } from "@/lib/feed";

const PriceChart = dynamic(() => import("./PriceChart").then((m) => m.PriceChart), { ssr: false, loading: () => <div className="pos-chart-load" /> });
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
  type Leg = { id: number; side: string; entryPx: string; exitPx: string | null; size: string; leverage: number | null; status: string; realizedPnl: string | null; meta: unknown; coin: string; slPx?: string | null; tpPx?: string | null; createdAt?: string };
  type Fade = { battleId: number; iFade: boolean; opp: string; oppAvatar: string | null; fader: Leg; target: Leg };
  const { data: fd, mutate: mutateF } = useSWR<{ fades: Fade[] }>(profile ? "/api/me/fades" : null, async (u: string) => (await authedFetch(u)).json(), { refreshInterval: 30_000 });
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"positions" | "arena">("positions");
  const router = useRouter();
  // Close the sheet first, then navigate (navigating from inside a closing sheet could be swallowed).
  const go = (href: string) => { setOpen(false); setTimeout(() => router.push(href), 0); };
  const [chartFor, setChartFor] = useState<number | null>(null);
  const [manage, setManage] = useState<FeedRow["post"] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const rows = (data?.posts ?? []).filter((r) => r.post.kind === "trade" && r.post.status === "open");
  // Live fades, scored at live prices (banked legs use their banked result): ahead or behind, by how much.
  const fades = (fd?.fades ?? []).map((f) => {
    const mine = f.iFade ? f.fader : f.target, theirs = f.iFade ? f.target : f.fader;
    const roi = (l: Leg) => tradeRoiPct(l, Number(mids[l.coin] ?? 0) || undefined);
    const gap = roi(mine) - roi(theirs);
    return { ...f, myPostId: mine.id, gap, ahead: gap > 0 };
  });
  const wins = fades.filter((f) => f.ahead).length, losses = fades.length - wins;
  const unbeaten = fades.length > 0 && losses === 0;
  // Moments worth marking: you overtake (stamp once) and your opponent gets stopped or liquidated (KO + a short buzz).
  // The first load only records state, so reopening the app doesn't replay old moments.
  const seen = useRef<Map<number, { ahead: boolean; ko: boolean }> | null>(null);
  const [stamps, setStamps] = useState<Record<number, number>>({});
  const koOf = (f: Fade) => { const t = f.iFade ? f.target : f.fader; const r = (t.meta as { closeReason?: string } | null)?.closeReason; return t.status !== "open" && (r === "liquidation" || r === "sl"); };
  const fadeSig = fades.map((f) => `${f.battleId}:${f.ahead ? 1 : 0}:${koOf(f) ? 1 : 0}`).join(",");
  useEffect(() => {
    if (!fd) return;
    const first = !seen.current; const prev = seen.current ?? new Map(); const next = new Map<number, { ahead: boolean; ko: boolean }>();
    let buzz = false; const fresh: Record<number, number> = {};
    for (const f of fades) {
      const ko = koOf(f), p = prev.get(f.battleId);
      next.set(f.battleId, { ahead: f.ahead, ko });
      if (first || !p) continue;
      if (f.ahead && !p.ahead) fresh[f.battleId] = Date.now();
      if (ko && !p.ko) buzz = true;
    }
    seen.current = next;
    if (Object.keys(fresh).length) setStamps((s0) => ({ ...s0, ...fresh }));
    if (buzz) { try { navigator.vibrate?.([30, 40, 60]); } catch {} }
  }, [fadeSig, !!fd]); // eslint-disable-line react-hooks/exhaustive-deps
  // A trade opened or closed anywhere in the app changes this list: refresh the fades with it, so the
  // arena never shows a leg as still running after you've closed it.
  const openSig = rows.map((r) => `${r.post.id}:${r.post.size}`).join(",");
  useEffect(() => { if (profile) void mutateF(); }, [openSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { void mutate(); void mutateF(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!profile || (!rows.length && !fades.length) || HIDE.some((r) => r.test(path))) return null;

  const live = rows.map(({ post }) => {
    const entry = Number(post.entryPx), size = Number(post.size), lev = post.leverage ?? 1;
    const px = Number(mids[post.coin ?? ""] ?? entry);
    const { pnl, pct } = pnlForPosition(post.side as "long" | "short", entry, px, size);
    return { post, px, pnl, roi: pct * lev, margin: Number(post.notionalUsd) / lev };
  });
  const total = live.reduce((a, x) => a + x.pnl, 0), margin = live.reduce((a, x) => a + x.margin, 0);
  const coins = [...new Set(live.map((x) => x.post.coin!))].slice(0, 3);
  const refresh = () => { mutate(); mutateF(); void Promise.resolve(refreshMe?.()).catch(() => null); };

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
      {/* A full-width rail centres the pill with flexbox, so nothing (animations, width changes) can push it off centre. */}
      <div className="pos-rail">
      <button type="button" className={`pos-pill ${unbeaten ? "gold" : ""}`} onClick={() => { setTab(rows.length ? "positions" : "arena"); setChartFor(rows[0]?.post.id ?? null); setOpen(true); }} aria-label={`${rows.length} open trades, ${fmtUsd(total, { sign: true })}`}>
        {unbeaten && <span className="pos-dot" aria-hidden />}
        <span className="pos-stack">{coins.map((c) => <CoinMark key={c} coin={c} size="xs" />)}</span>
        {rows.length > 0 && <><span>{rows.length} open</span><b className={`mono ${total >= 0 ? "green" : "red"}`}><Roll v={total} fmt={(x) => fmtUsd(x, { sign: true })} /></b></>}
        {fades.length > 0 && <span className={rows.length ? "pos-wl" : "pos-wl solo"}>{unbeaten ? "Unbeaten" : "Fades"} <b className="mono">{wins}–{losses}</b></span>}
        <span className="pos-go" aria-hidden>›</span>
      </button>
      </div>

      {open && (
        <Sheet label="Your trades" onClose={() => setOpen(false)}>
          <div className="pos-sheet">
            <div className="pos-h"><b>Your trades</b><span>{profile.isDemo ? "Demo · " : ""}updates live</span></div>
            <div className="pos-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "positions"} className={tab === "positions" ? "on" : ""} onClick={() => setTab("positions")}>Positions <span className="mono">{rows.length}</span></button>
              <button type="button" role="tab" aria-selected={tab === "arena"} className={tab === "arena" ? "on" : ""} onClick={() => setTab("arena")}>Live arena <span className="mono">{wins}–{losses}</span></button>
            </div>
            {tab === "arena" && <ArenaIntro />}
            {tab === "arena" ? (
              fades.length ? <>
                {unbeaten ? (
                  <div className="pos-unb">
                    <small>Unbeaten</small><b className="mono">{wins}–0</b><p>Leading every fade you&apos;re in</p>
                    <span className="pos-pips" aria-hidden>{fades.slice(0, 8).map((f) => <i key={f.battleId} />)}</span>
                  </div>
                ) : <p className="pos-sub">{wins} ahead · {losses} behind · scored at live prices</p>}
                {[...fades].sort((a, b) => b.gap - a.gap).map((f) => {
                  const mine = f.iFade ? f.fader : f.target, theirs = f.iFade ? f.target : f.fader;
                  const mark = Number(mids[mine.coin] ?? 0) || Number(mine.entryPx);
                  const me = fighter(mine, profile.handle, profile.avatarUrl ?? null, mark), them = fighter(theirs, f.opp, f.oppAvatar, mark);
                  const side = (x: Fighter, leg: Leg, right?: boolean) => (
                    <div className={`fc-f ${right ? "r" : ""} ${(x === me) === f.ahead ? "lead" : ""}`}>
                      <span className={`fc-av ${x.side}`}><Avatar handle={x.handle} url={x.avatarUrl} size={34} link={false} /></span>
                      <div className="min-w-0">
                        <div className="fc-name"><span className="truncate">{x === me ? "You" : x.handle}</span></div>
                        <div className={`fc-pos ${x.side}`}>{x.side === "long" ? "Long" : "Short"} {x.lev}×{leg.status !== "open" ? <span className="pos-banked"> · banked</span> : null}</div>
                        <div className={`mono fc-roi ${x.roi >= 0 ? "green" : "red"}`}>{fmtPct(x.roi, 1)}</div>
                      </div>
                    </div>
                  );
                  return (
                    <button key={f.battleId} type="button" className={`pos-fcard ${f.ahead ? "lead" : ""}`} onClick={() => go(`/battle/${f.battleId}`)}>
                      <div className="fc-top">
                        <span className="fc-tag">Fade · {ticker(mine.coin)}</span>
                        <span className={`pos-lead ${f.ahead ? "up" : ""}`}>{f.ahead ? "You lead" : "You trail"} by <RollNum v={Math.abs(f.gap)} signed={f.gap} /></span>
                      </div>
                      <div className="fc-hp"><MiniHp f={me} live={mark} big /><span>HP</span><MiniHp f={them} live={mark} big right /></div>
                      <div className="fc-row">{side(me, mine)}<span className="fc-vs">vs</span>{side(them, theirs, true)}</div>
                      <div className={`pos-tug ${f.ahead ? "up" : ""}`}><i style={{ width: `${Math.max(6, Math.min(94, 50 + f.gap * 2))}%` }} /><u /></div>
                      <div className="pos-fwatch">{f.iFade ? `You faded @${f.opp}` : `@${f.opp} faded you`} · watch the fight ›</div>
                      {stamps[f.battleId] && Date.now() - stamps[f.battleId] < 5000 && <span key={stamps[f.battleId]} className="pos-stamp">Took the lead</span>}
                      {koOf(f) && <span className="pos-ko"><b>KO</b><small>@{f.opp} got {(theirs.meta as { closeReason?: string } | null)?.closeReason === "liquidation" ? "liquidated" : "stopped out"}</small></span>}
                    </button>
                  );
                })}
              </> : <p className="pos-sub" style={{ padding: "20px 0", textAlign: "center" }}>No live fades. Find a trade to fade on the home feed.</p>
            ) : <>
            <div className="pos-tot">
              <div><small>Open P&amp;L</small><b className={`mono ${total >= 0 ? "green" : "red"}`}><Roll v={total} fmt={(x) => fmtUsd(x, { sign: true })} /></b></div>
              <div><small>In margin</small><b className="mono">{fmtUsd(margin)}</b></div>
              {profile.isDemo && <div><small>Balance</small><b className="mono">{fmtUsd(Number(profile.demoBalance ?? 0))}</b></div>}
            </div>
            {err && <p className="pos-err">{err}</p>}
            {live.map(({ post, px, pnl, roi }) => {
              const side = post.side as "long" | "short", lev = post.leverage ?? 1;
              const liq = demoLiqPx(side, Number(post.entryPx), lev);
              return (
                <div key={post.id} className={`pos-card ${post.paper && lev > 1 && Math.abs(px - liq) / Math.abs(Number(post.entryPx) - liq) < 0.3 ? "liq-near" : ""}`}>
                  <div className="pos-r1">
                    <CoinMark coin={post.coin!} size="sm" />
                    <div className="pos-mid">
                      <b>{ticker(post.coin!)} <span className={`lbl ${side}`}><i />{side === "long" ? "Long" : "Short"} {lev}×</span></b>
                      <span className="mono">{fmtPrice(Number(post.entryPx))} → {fmtPrice(px)}{post.paper && lev > 1 ? ` · liq ${fmtPrice(liq)}` : ""}</span>
                    </div>
                    <div className="pos-pnl"><b className={`mono ${pnl >= 0 ? "green" : "red"}`}>{fmtUsd(pnl, { sign: true })}</b><small className={`mono ${roi >= 0 ? "green" : "red"}`}>{fmtPct(roi, 1)}</small></div>
                  </div>
                  {chartFor === post.id && <PosChart post={post} liq={post.paper && lev > 1 ? liq : null} onGo={go} />}
                  <div className="pos-acts">
                    <button type="button" className={chartFor === post.id ? "on" : ""} onClick={() => setChartFor(chartFor === post.id ? null : post.id)}>{chartFor === post.id ? "Hide chart" : "Chart"}</button>
                    <button type="button" onClick={() => setManage(post)}>Stop / target</button>
                    {post.paper ? <>
                      <button type="button" disabled={busy === post.id} onClick={() => quickClose(post.id, 0.5)}>Close half</button>
                      <button type="button" disabled={busy === post.id} onClick={() => quickClose(post.id, 1)}>{busy === post.id ? "…" : "Close"}</button>
                    </> : <button type="button" onClick={() => setManage(post)}>Close</button>}
                  </div>
                </div>
              );
            })}
            {!live.length && <p className="pos-sub" style={{ padding: "20px 0", textAlign: "center" }}>No open positions.</p>}
            </>}
          </div>
        </Sheet>
      )}
      {manage && <ManageTrade post={manage} mid={Number(mids[manage.coin ?? ""] ?? 0) || undefined} onChanged={refresh} onClose={() => setManage(null)} />}
    </>
  );
}

/** A fade leg as a fighter (live ROI from the shared scorer, banked once closed). */
function fighter(l: { side: string; entryPx: string; leverage: number | null; slPx?: string | null; tpPx?: string | null; createdAt?: string; status: string; coin: string } & Parameters<typeof tradeRoiPct>[0], handle: string, avatarUrl: string | null, mark: number): Fighter {
  return {
    handle, avatarUrl, side: l.side === "short" ? "short" : "long", lev: l.leverage ?? 1, entry: Number(l.entryPx),
    sl: l.slPx ? Number(l.slPx) : null, tp: l.tpPx ? Number(l.tpPx) : null, openedAt: l.createdAt ?? null,
    roi: tradeRoiPct(l, mark || undefined), closed: l.status !== "open",
  };
}

/** Full chart for one open position, inline: candles or line (same switch as the market page), your entry,
 *  liquidation and stop/target as lines, and pins where everyone else in this market got in. */
function PosChart({ post, liq, onGo }: { post: FeedRow["post"]; liq: number | null; onGo: (href: string) => void }) {
  const coin = post.coin!;
  const { mids } = useMids();
  const { traders } = useMarketTraders(coin);
  const { profile } = useSession();
  const markers = useMemo<ChartMarker[]>(() => {
    const ms = toMarkers(traders);
    if (!ms.some((m) => m.id === String(post.id))) ms.push({ id: String(post.id), t: new Date(post.createdAt).getTime(), side: post.side as "long" | "short", label: `You · ${post.side} ${post.leverage ?? 1}× at ${post.entryPx}`, price: Number(post.entryPx), avatarUrl: profile?.avatarUrl ?? null, handle: profile?.handle, href: `/post/${post.id}` });
    return ms;
  }, [traders, post, profile?.avatarUrl, profile?.handle]);
  const guides = [
    { price: Number(post.entryPx), label: "Your entry" },
    ...(liq ? [{ price: liq, label: "Liq" }] : []),
    ...(post.tpPx ? [{ price: Number(post.tpPx), label: "Target" }] : []),
    ...(post.slPx ? [{ price: Number(post.slPx), label: "Stop" }] : []),
  ];
  return (
    <div className="pos-chart">
      <PriceChart coin={coin} livePx={Number(mids[coin] ?? 0) || undefined} markers={markers} guides={guides} height={230} />
      <p className="pos-chart-note">Faces mark where traders in {ticker(coin)} got in. <button type="button" onClick={() => onGo(`/markets/${coin}`)}>Full market ›</button></p>
    </div>
  );
}

/** A number that rolls to its new value, with a brief flash of how far it moved. */
function RollNum({ v, signed }: { v: number; signed: number }) {
  const [shown, setShown] = useState(v);
  const [delta, setDelta] = useState<{ d: number; k: number } | null>(null);
  const from = useRef(v), raf = useRef(0), lastSigned = useRef(signed);
  useEffect(() => {
    const start = from.current, end = v, t0 = performance.now();
    const d = signed - lastSigned.current; lastSigned.current = signed;
    if (Math.abs(d) >= 0.1) setDelta({ d, k: t0 });
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || Math.abs(end - start) < 0.05) { from.current = end; setShown(end); return; }
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - k, 3);
      const x = start + (end - start) * e; from.current = x; setShown(x);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <b className="mono">{shown.toFixed(1)}%</b>
      {delta && <span key={delta.k} className={`pos-delta mono ${delta.d > 0 ? "green" : "red"}`}>{delta.d > 0 ? "▲" : "▼"}{Math.abs(delta.d).toFixed(1)}</span>}
    </>
  );
}
