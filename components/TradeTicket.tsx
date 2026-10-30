"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets, type Market } from "@/lib/hooks/useMarkets";
import { useMids } from "@/lib/hooks/useMids";
import { makeExchangeClient, placeMarketOrder, approveBuilderFee } from "@/lib/hl-exchange";
import { getMaxBuilderFee } from "@/lib/hl-info";
import { fmtUsd, roundSize, fmtSize, fmtPct } from "@/lib/format";
import { BUILDER_ADDRESS, BUILDER_CONFIGURED, BUILDER_FEE_TENTHS_BPS, BUILDER_MAX_FEE_RATE, MAX_LEVERAGE, MAX_POSITION_USD } from "@/lib/config";
import { CoinMark } from "./ui";

const QUICK = [25, 50, 100, 250];

export type Seed = {
  coin: string;
  side?: "long" | "short";
  leverage?: number;
  copiedFromId?: number;
  fadedFromId?: number;
  backsCallId?: number;
  handle?: string;
  /** Stats of the current user for guardrails (closed trade count). */
  closedTrades?: number;
};

/** The trade ticket: market or limit, leverage, TP/SL, builder-fee approval, copy and fade modes. */
export function TradeTicket({ seed, compact = false }: { seed: Seed; compact?: boolean }) {
  const router = useRouter();
  const { authenticated, login, walletClient, address, profile, authedFetch } = useSession();
  const { markets } = useMarkets();
  const { mids } = useMids();

  const isFade = !!seed.fadedFromId;
  const [coin, setCoin] = useState(seed.coin);
  const [side, setSide] = useState<"long" | "short">(seed.side ?? "long");
  const [usd, setUsd] = useState(50);
  const fadeCap = isFade && (seed.closedTrades ?? 0) < 10 ? 2 : MAX_LEVERAGE;
  const [lev, setLev] = useState(Math.min(seed.leverage ?? profile?.defaultLeverage ?? 2, fadeCap));
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPx, setLimitPx] = useState("");
  const [tpslOn, setTpslOn] = useState(isFade);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");

  const market: Market | undefined = useMemo(() => markets.find((m) => m.name === coin), [markets, coin]);
  const mid = mids[coin] ?? market?.mid ?? 0;
  const maxLev = Math.min(fadeCap, market?.maxLeverage ?? MAX_LEVERAGE);
  useEffect(() => { if (lev > maxLev) setLev(maxLev); }, [maxLev, lev]);
  useEffect(() => {
    if (!address || !BUILDER_CONFIGURED) return setApproved(true);
    getMaxBuilderFee(address, BUILDER_ADDRESS).then((f) => setApproved(f >= BUILDER_FEE_TENTHS_BPS));
  }, [address]);
  // Fades default to an automatic 5% stop.
  useEffect(() => { if (isFade && mid && !sl) setSl((side === "long" ? mid * 0.95 : mid * 1.05).toFixed(market?.szDecimals ? 6 - market.szDecimals : 2)); }, [isFade, mid, side, sl, market]);

  const refPx = orderType === "limit" && Number(limitPx) > 0 ? Number(limitPx) : mid;
  const notional = usd * lev;
  const size = market && refPx ? roundSize(notional / refPx, market.szDecimals) : 0;
  const liqPct = (100 / lev) * 0.9;
  const estLiq = refPx ? (side === "long" ? refPx * (1 - liqPct / 100) : refPx * (1 + liqPct / 100)) : 0;
  const preview = (t: string) => { const v = Number(t); if (!v || !refPx || !size) return null; const diff = side === "long" ? v - refPx : refPx - v; return { pct: (diff / refPx) * 100 * lev, usd: diff * size }; };
  const tpPrev = tpslOn ? preview(tp) : null, slPrev = tpslOn ? preview(sl) : null;
  const tpslValid = !tpslOn || ((!tp || (side === "long" ? Number(tp) > refPx : Number(tp) < refPx)) && (!sl || (side === "long" ? Number(sl) < refPx : Number(sl) > refPx)));

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    const top = ["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE", "SUI", "LINK"];
    return (q ? markets.filter((m) => m.name.includes(q)) : markets.filter((m) => top.includes(m.name)).sort((a, b) => top.indexOf(a.name) - top.indexOf(b.name))).slice(0, 12);
  }, [markets, search]);

  const approve = async () => {
    if (!walletClient) return;
    setBusy("Waiting for signature…");
    try { await approveBuilderFee(makeExchangeClient(walletClient)); setApproved(true); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const submit = async () => {
    if (!authenticated) return login();
    if (!walletClient || !address) return setErr("Wallet still loading, try again in a second.");
    if (!profile) return router.push("/onboarding");
    if (!market || !mid) return setErr("Market not ready.");
    if (usd > MAX_POSITION_USD) return setErr(`Max ${fmtUsd(MAX_POSITION_USD)} margin per trade during beta.`);
    if (orderType === "limit" && !(Number(limitPx) > 0)) return setErr("Enter a limit price.");
    if (!tpslValid) return setErr(side === "long" ? "Take profit must be above entry and stop loss below." : "Take profit must be below entry and stop loss above.");
    setErr(null);
    setBusy("Signing order…");
    const res = await placeMarketOrder(makeExchangeClient(walletClient), {
      asset: market, side, usd: notional, mid, leverage: lev, orderType,
      limitPx: orderType === "limit" ? Number(limitPx) : undefined,
      takeProfitPx: tpslOn && Number(tp) > 0 ? Number(tp) : undefined,
      stopLossPx: tpslOn && Number(sl) > 0 ? Number(sl) : undefined,
    });
    if (!res.ok) { setBusy(null); return setErr(res.error ?? "Order failed"); }
    setBusy("Posting to feed…");
    const entryPx = res.avgPx ?? refPx, filledSz = res.totalSz ?? size;
    const r = await authedFetch("/api/posts", {
      method: "POST",
      body: JSON.stringify({ kind: "trade", coin, side, size: filledSz, notionalUsd: filledSz * entryPx, leverage: lev, entryPx, oid: res.oid, body: note.trim() || undefined, copiedFromId: seed.copiedFromId, fadedFromId: seed.fadedFromId, backsCallId: seed.backsCallId, tpPx: tpslOn && Number(tp) > 0 ? Number(tp) : undefined, slPx: tpslOn && Number(sl) > 0 ? Number(sl) : undefined }),
    });
    setBusy(null);
    if (!r.ok) return setErr("Filled on Hyperliquid but posting failed; refresh your profile.");
    router.push("/");
  };

  const cta = `${orderType === "limit" ? "Limit " : ""}${isFade ? "Fade · " : ""}${side === "long" ? "Long" : "Short"} ${coin} ${lev}× · ${fmtUsd(notional)}`;

  return (
    <div className="fade-in" data-tint="blue">
      {seed.handle && (
        <div className="px-5 pt-3 text-[13px]"><span className="muted">{isFade ? "Fading" : "Copying"}</span> <b>{seed.handle}</b> <span className="muted">· {seed.side === "long" ? "Long" : "Short"} {seed.coin}{isFade ? " → you go the other way" : ""}</span></div>
      )}

      {approved === false && walletClient && (
        <div className="block"><div className="card p-4" style={{ border: "1.5px solid var(--brand)" }}>
          <div className="font-bold">One-time setup</div>
          <p className="muted mt-1 text-sm">Approve a max {BUILDER_MAX_FEE_RATE} Perped fee so trades can be routed from here. One signature, revocable anytime, only on trades placed in Perped.</p>
          <button className="btn brand mt-3" style={{ padding: 12, fontSize: 14 }} onClick={approve} disabled={!!busy}>{busy ?? `Approve ${BUILDER_MAX_FEE_RATE} fee`}</button>
        </div></div>
      )}

      {!compact && (
        <div className="block">
          <input className="field mb-2.5" placeholder="Search markets" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="seg">{filtered.map((m) => <button key={m.name} className={`chip ${m.name === coin ? "on" : ""}`} onClick={() => setCoin(m.name)}><CoinMark coin={m.name} size="xs" />{m.name}</button>)}</div>
          <div className="mt-3.5 flex items-baseline justify-between"><span className="text-[22px] font-bold tracking-tight">{coin}</span><span className="mono text-lg">{mid ? mid.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "…"}</span></div>
        </div>
      )}

      <div className="block">
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => setSide("long")} className={`btn ${side === "long" ? "long" : ""}`}>Long</button>
          <button onClick={() => setSide("short")} className={`btn ${side === "short" ? "short" : ""}`}>Short</button>
        </div>
        <div className="seg mt-3.5">{(["market", "limit"] as const).map((t) => <button key={t} className={`chip capitalize ${t === orderType ? "info" : ""}`} onClick={() => setOrderType(t)}>{t}</button>)}</div>
        {orderType === "limit" && <div className="mt-3 flex items-center justify-between text-sm"><span className="muted">Limit price</span><input type="number" inputMode="decimal" className="field mono !w-36 !py-2.5 text-right" placeholder={mid ? String(mid) : ""} value={limitPx} onChange={(e) => setLimitPx(e.target.value)} /></div>}
      </div>

      <div className="block">
        <div className="flex items-center justify-between text-sm"><span className="muted">Margin (USDC)</span><span className="when">Max {fmtUsd(MAX_POSITION_USD)} in beta</span></div>
        <div className="mono my-2 text-[40px] font-semibold tracking-tight"><span className="muted text-2xl align-top">$</span><input type="number" inputMode="decimal" className="mono inline-block w-40 border-0 bg-transparent p-0 text-[40px] font-semibold tracking-tight outline-none" value={usd} min={5} max={MAX_POSITION_USD} onChange={(e) => setUsd(Math.max(0, Number(e.target.value)))} /></div>
        <div className="seg">{QUICK.map((q) => <button key={q} className={`chip ${usd === q ? "on" : ""}`} onClick={() => setUsd(q)}>{q}</button>)}</div>
        <div className="mt-4 flex items-center justify-between text-sm"><span className="muted">Leverage</span><span className="mono font-bold">{lev}×{isFade && fadeCap === 2 ? <span className="when ml-2">capped at 2× for new accounts</span> : null}</span></div>
        <input type="range" min={1} max={maxLev} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="range my-1.5" />
        <div className="grid grid-cols-3 gap-2.5">
          <div className="stat"><small>Position</small><div className="v mono">{fmtUsd(notional, { compact: notional >= 10000 })}</div></div>
          <div className="stat"><small>Size</small><div className="v mono">{market ? fmtSize(size, market.szDecimals) : "—"}</div></div>
          <div className="stat"><small>Liq. at</small><div className="v mono">{estLiq ? estLiq.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}</div></div>
        </div>
      </div>

      <div className="block">
        <div className="flex items-center justify-between"><span className="font-bold">Take profit · Stop loss</span><button className={`chip ${tpslOn ? "on" : ""}`} onClick={() => setTpslOn((v) => !v)}>{tpslOn ? "On" : "Off"}</button></div>
        {tpslOn && (
          <>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <div><div className="eyebrow mb-2">Take profit</div><input type="number" inputMode="decimal" className="field mono" value={tp} onChange={(e) => setTp(e.target.value)} placeholder={refPx ? (side === "long" ? (refPx * 1.04).toFixed(2) : (refPx * 0.96).toFixed(2)) : ""} />{tpPrev && <div className={`mt-2 text-[13px] font-semibold ${tpPrev.usd >= 0 ? "green" : "red"}`}>{fmtPct(tpPrev.pct, 1)} · {fmtUsd(tpPrev.usd, { sign: true })}</div>}</div>
              <div><div className="eyebrow mb-2">Stop loss</div><input type="number" inputMode="decimal" className="field mono" value={sl} onChange={(e) => setSl(e.target.value)} placeholder={refPx ? (side === "long" ? (refPx * 0.97).toFixed(2) : (refPx * 1.03).toFixed(2)) : ""} />{slPrev && <div className={`mt-2 text-[13px] font-semibold ${slPrev.usd >= 0 ? "green" : "red"}`}>{fmtPct(slPrev.pct, 1)} · {fmtUsd(slPrev.usd, { sign: true })}</div>}</div>
            </div>
            <p className="faint mt-2.5 text-xs">Placed on Hyperliquid with the order; both trigger as market orders even if Perped is closed.</p>
          </>
        )}
      </div>

      <div className="block">
        {isFade && <div className="warn mb-3.5">Fading is a real {side} on Hyperliquid at your size. If they're right, you're the one who gets perped, publicly: your name goes on their post.</div>}
        <input className="field mb-3.5" placeholder="Add a note for the feed" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
        {err && <p className="red mb-3 text-sm">{err}</p>}
        <button onClick={submit} disabled={!!busy || !market || size <= 0 || approved === false} className={`btn ${side}`}>{busy ?? (authenticated ? cta : "Log in to trade")}</button>
        <p className="faint mt-3 text-center text-xs leading-relaxed">Filled on Hyperliquid. {orderType === "market" ? "Market order, up to 3% slippage." : "Limit order rests until filled or cancelled."} You can lose your margin. Not financial advice.</p>
      </div>
    </div>
  );
}
