"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { FeedRow } from "@/lib/feed";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { fmtPct, fmtPrice, fmtStake, fmtUsd, pnlForPosition } from "@/lib/format";
import { closePosition, makeExchangeClient, setPositionTpSl } from "@/lib/hl-exchange";
import { demoLiqPx } from "@/lib/trades";
import { CoinMark, ticker } from "./ui";

/**
 * Everything you can do to an open trade of yours, in one sheet: close some or all of it, set or move
 * take-profit / stop-loss (with one-tap presets in ROI terms), or add to it. Demo trades settle here at the
 * live price; real trades go to Hyperliquid first and the post is updated once the fill comes back.
 */
export function ManageTrade({ post, mid, onChanged, onClose }: { post: FeedRow["post"]; mid?: number; onChanged?: () => void; onClose: () => void }) {
  const { walletClient, address, fee, authedFetch } = useSession();
  const { markets } = useMarkets();
  const side = post.side as "long" | "short", lev = post.leverage ?? 1, entry = Number(post.entryPx), size = Number(post.size);
  const px = mid ?? entry;
  const { pnl, pct } = pnlForPosition(side, entry, px, size);
  const roi = pct * lev;
  const margin = Number(post.notionalUsd) / lev;
  const [tp, setTp] = useState(post.tpPx ? String(Number(post.tpPx)) : "");
  const [sl, setSl] = useState(post.slPx ? String(Number(post.slPx)) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const liq = demoLiqPx(side, entry, lev);

  // ROI preset → price. +20% ROI at 40× is a 0.5% move.
  const pxForRoi = (r: number) => entry * (1 + (r / 100 / lev) * (side === "long" ? 1 : -1));
  const roiAt = (p: number) => ((p - entry) / entry) * (side === "long" ? 1 : -1) * lev * 100;
  const dec = px >= 1000 ? 1 : px >= 10 ? 2 : 4;

  const fail = (m: string) => { setErr(m); setBusy(null); };
  const asset = markets.find((m) => m.name === post.coin);

  const close = async (fraction: number) => {
    setBusy(`close${fraction}`); setErr(null);
    let exitPx = px;
    if (!post.paper) {
      if (!walletClient || !asset || !mid) return fail("Wallet or market not ready");
      const res = await closePosition(makeExchangeClient(walletClient), asset, (side === "long" ? 1 : -1) * size * fraction, mid, fee.tenthsBps);
      if (!res.ok) return fail(res.error ?? "Close failed on Hyperliquid");
      exitPx = res.avgPx ?? mid;
    }
    const r = await authedFetch(`/api/posts/${post.id}/close`, { method: "POST", body: JSON.stringify({ exitPx, fraction, reason: "manual" }) });
    const j = await r.json();
    if (!r.ok) return fail(j.error ?? "Couldn't record the close");
    setBusy(null); onChanged?.();
    if (fraction >= 1) onClose(); else setDone(`Closed ${Math.round(fraction * 100)}% at ${fmtPrice(exitPx)}`);
  };

  const saveTpSl = async () => {
    setBusy("tpsl"); setErr(null);
    const tpN = tp ? Number(tp) : null, slN = sl ? Number(sl) : null;
    if (tpN && (side === "long" ? tpN <= entry : tpN >= entry)) return fail(`Take profit must be ${side === "long" ? "above" : "below"} ${fmtPrice(entry)}`);
    if (slN && (side === "long" ? slN >= entry : slN <= entry)) return fail(`Stop loss must be ${side === "long" ? "below" : "above"} ${fmtPrice(entry)}`);
    if (!post.paper) {
      if (!walletClient || !asset || !address) return fail("Wallet or market not ready");
      const res = await setPositionTpSl(makeExchangeClient(walletClient), address, asset, side, size, tpN, slN);
      if (!res.ok) return fail(res.error ?? "Hyperliquid rejected the orders");
    }
    const r = await authedFetch(`/api/posts/${post.id}`, { method: "PATCH", body: JSON.stringify({ tpPx: tpN, slPx: slN }) });
    const j = await r.json();
    if (!r.ok) return fail(j.error ?? "Couldn't save");
    setBusy(null); setDone(tpN || slN ? "Exits set" : "Exits cleared"); onChanged?.();
  };

  const Preset = ({ r, set }: { r: number; set: (v: string) => void }) => <button className="chip" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => set(pxForRoi(r).toFixed(dec))}>{r > 0 ? "+" : ""}{r}%</button>;

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Manage trade">
        <div className="grab" />
        <div className="px-5 pb-6">
          <div className="flex items-center gap-3">
            <CoinMark coin={post.coin!} />
            <div className="flex-1">
              <div className="text-lg font-extrabold">{ticker(post.coin!, true)} <span className={`lbl ${side}`} style={{ padding: "2px 8px", fontSize: 11 }}><i />{side === "long" ? "Long" : "Short"} {lev}×</span></div>
              <div className="mono when">{fmtStake(margin)} margin · in at {fmtPrice(entry)} · now {fmtPrice(px)}</div>
            </div>
            <div className="text-right"><div className={`mono text-xl font-bold ${roi >= 0 ? "green" : "red"}`}>{fmtPct(roi, 1)}</div><div className={`mono text-[12px] ${pnl >= 0 ? "green" : "red"}`}>{fmtUsd(pnl, { sign: true })}</div></div>
          </div>
          {post.paper && <p className="faint mt-2 text-[11px]">Demo · liquidates at {fmtPrice(liq)} · exits trigger within a few minutes of the price printing.</p>}

          <div className="mt-5 flex items-center justify-between"><span className="font-bold">Close</span><span className="when">at market</span></div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[0.25, 0.5, 0.75, 1].map((f) => <button key={f} className={`btn ${f === 1 ? "short" : "ghostline"}`} style={{ padding: "11px 6px", fontSize: 14 }} disabled={!!busy} onClick={() => close(f)}>{busy === `close${f}` ? "…" : f === 1 ? "Close all" : `${f * 100}%`}</button>)}
          </div>

          <div className="mt-5 flex items-center justify-between"><span className="font-bold">Take profit · Stop loss</span>{(post.tpPx || post.slPx) && <button className="when" onClick={() => { setTp(""); setSl(""); }}>clear</button>}</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <div className="eyebrow mb-1.5">Take profit</div>
              <input type="number" inputMode="decimal" className="field mono" value={tp} onChange={(e) => setTp(e.target.value)} placeholder={pxForRoi(50).toFixed(dec)} />
              <div className="mt-1.5 flex flex-wrap gap-1">{[25, 50, 100].map((r) => <Preset key={r} r={r} set={setTp} />)}</div>
              {tp && Number(tp) > 0 && <div className={`mt-1.5 text-[12px] font-semibold ${roiAt(Number(tp)) >= 0 ? "green" : "red"}`}>{fmtPct(roiAt(Number(tp)), 0)} · {fmtUsd((margin * roiAt(Number(tp))) / 100, { sign: true })}</div>}
            </div>
            <div>
              <div className="eyebrow mb-1.5">Stop loss</div>
              <input type="number" inputMode="decimal" className="field mono" value={sl} onChange={(e) => setSl(e.target.value)} placeholder={pxForRoi(-30).toFixed(dec)} />
              <div className="mt-1.5 flex flex-wrap gap-1">{[-10, -25, -50].map((r) => <Preset key={r} r={r} set={setSl} />)}</div>
              {sl && Number(sl) > 0 && <div className={`mt-1.5 text-[12px] font-semibold ${roiAt(Number(sl)) >= 0 ? "green" : "red"}`}>{fmtPct(roiAt(Number(sl)), 0)} · {fmtUsd((margin * roiAt(Number(sl))) / 100, { sign: true })}</div>}
            </div>
          </div>
          <button className="btn ink mt-3" style={{ padding: 12 }} disabled={!!busy} onClick={saveTpSl}>{busy === "tpsl" ? "Saving…" : "Save exits"}</button>

          <div className="mt-5 flex items-center justify-between"><span className="font-bold">Add to it</span><span className="when">same side, {lev}×</span></div>
          <Link href={`/trade?coin=${post.coin}&side=${side}&lev=${lev}&add=${post.id}`} className="btn ghostline mt-2" style={{ padding: 12 }} onClick={onClose}>Add margin · open the ticket</Link>

          {err && <p className="red mt-3 text-center text-xs">{err}</p>}
          {done && !err && <p className="green mt-3 text-center text-xs">{done}</p>}
        </div>
      </div>
    </>,
    document.body,
  );
}
