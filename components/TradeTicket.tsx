"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets, type Market } from "@/lib/hooks/useMarkets";
import { useMids } from "@/lib/hooks/useMids";
import { makeExchangeClient, placeMarketOrder } from "@/lib/hl-exchange";
import { fmtUsd, roundSize, fmtSize } from "@/lib/format";
import { MAX_LEVERAGE, MAX_POSITION_USD } from "@/lib/config";
import { BuilderApproval } from "./BuilderApproval";

const QUICK = [25, 50, 100, 250];

export type CopySeed = { coin: string; side?: "long" | "short"; leverage?: number; copiedFromId?: number; handle?: string };

/**
 * The trade ticket. `seed` pre-fills it (from a market page or a copy-trade link);
 * `compact` hides the market picker when the page already shows the market.
 */
export function TradeTicket({ seed, compact = false }: { seed?: CopySeed; compact?: boolean }) {
  const router = useRouter();
  const { authenticated, login, walletClient, address, profile, authedFetch } = useSession();
  const { markets } = useMarkets();
  const { mids } = useMids();

  const [coin, setCoin] = useState(seed?.coin ?? "SOL");
  const [side, setSide] = useState<"long" | "short">(seed?.side ?? "long");
  const [usd, setUsd] = useState(50);
  const [lev, setLev] = useState(Math.min(seed?.leverage ?? 2, MAX_LEVERAGE));
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPx, setLimitPx] = useState<string>("");
  const [tpslOn, setTpslOn] = useState(false);
  const [tp, setTp] = useState<string>("");
  const [sl, setSl] = useState<string>("");

  const market: Market | undefined = useMemo(() => markets.find((m) => m.name === coin), [markets, coin]);
  const mid = mids[coin] ?? market?.mid ?? 0;
  const maxLev = Math.min(MAX_LEVERAGE, market?.maxLeverage ?? MAX_LEVERAGE);
  useEffect(() => { if (lev > maxLev) setLev(maxLev); }, [maxLev, lev]);

  const notional = usd * lev;
  const size = market && mid ? roundSize(notional / mid, market.szDecimals) : 0;
  const liqPct = lev > 1 ? (100 / lev) * 0.9 : 90; // rough: distance to liquidation ≈ (1/lev) minus maintenance buffer
  const refPx = orderType === "limit" && Number(limitPx) > 0 ? Number(limitPx) : mid;
  const estLiq = refPx ? (side === "long" ? refPx * (1 - liqPct / 100) : refPx * (1 + liqPct / 100)) : 0;
  const exitPreview = (target: string) => {
    const t = Number(target);
    if (!t || !refPx || !size) return null;
    const diff = side === "long" ? t - refPx : refPx - t;
    return { pct: (diff / refPx) * 100 * lev, usd: diff * size };
  };
  const tpPrev = tpslOn ? exitPreview(tp) : null;
  const slPrev = tpslOn ? exitPreview(sl) : null;
  const tpslValid = !tpslOn || ((!tp || (side === "long" ? Number(tp) > refPx : Number(tp) < refPx)) && (!sl || (side === "long" ? Number(sl) < refPx : Number(sl) > refPx)));

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    const top = ["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE", "SUI", "LINK"];
    const list = q ? markets.filter((m) => m.name.includes(q)) : markets.filter((m) => top.includes(m.name)).sort((a, b) => top.indexOf(a.name) - top.indexOf(b.name));
    return list.slice(0, 12);
  }, [markets, search]);

  const submit = async () => {
    if (!authenticated) return login();
    if (!walletClient || !address) return setErr("Wallet still loading, try again in a second.");
    if (!profile) return setErr("Pick a handle first.");
    if (!market || !mid) return setErr("Market not ready.");
    if (usd > MAX_POSITION_USD) return setErr(`Max ${fmtUsd(MAX_POSITION_USD)} margin per trade while we're in beta.`);
    setErr(null);
    setBusy("Signing order…");
    const client = makeExchangeClient(walletClient);
    if (orderType === "limit" && !(Number(limitPx) > 0)) { setBusy(null); return setErr("Enter a limit price."); }
    if (!tpslValid) { setBusy(null); return setErr(side === "long" ? "Take profit must be above entry and stop loss below." : "Take profit must be below entry and stop loss above."); }
    const res = await placeMarketOrder(client, {
      asset: market,
      side,
      usd: notional,
      mid,
      leverage: lev,
      orderType,
      limitPx: orderType === "limit" ? Number(limitPx) : undefined,
      takeProfitPx: tpslOn && Number(tp) > 0 ? Number(tp) : undefined,
      stopLossPx: tpslOn && Number(sl) > 0 ? Number(sl) : undefined,
    });
    if (!res.ok) {
      setBusy(null);
      return setErr(res.error ?? "Order failed");
    }
    setBusy("Posting to feed…");
    const entryPx = res.avgPx ?? refPx;
    const filledSz = res.totalSz ?? size;
    const r = await authedFetch("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        coin,
        side,
        size: filledSz,
        notionalUsd: filledSz * entryPx,
        leverage: lev,
        entryPx,
        oid: res.oid,
        caption: caption.trim() || undefined,
        copiedFromId: seed?.copiedFromId,
      }),
    });
    setBusy(null);
    if (!r.ok) return setErr("Trade went through on Hyperliquid but posting failed — refresh your profile.");
    router.push("/");
  };

  return (
    <div className="space-y-3">
      {seed?.handle && (
        <div className="muted text-xs">
          Copying <b className="font-semibold" style={{ color: "var(--text)" }}>{seed.handle}</b> · {seed.side === "long" ? "Long" : "Short"} {seed.coin}
        </div>
      )}

      <BuilderApproval />

      {/* Market picker (hidden on a market page, which already shows the market) */}
      {!compact && <div className="panel p-3">
        <input className="input mb-2" placeholder="Search markets…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {filtered.map((m) => (
            <button key={m.name} onClick={() => setCoin(m.name)} className="pill" style={{ background: m.name === coin ? "var(--ink)" : "var(--panel-2)", color: m.name === coin ? "var(--ink-fg)" : "var(--text)" }}>
              {m.name}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-xl font-bold tracking-tight">{coin}</span>
          <span className="font-mono text-lg">{mid ? `$${mid.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : "…"}</span>
        </div>
      </div>}

      {/* Side */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setSide("long")} className={`btn ${side === "long" ? "btn-long" : "btn-ghost"}`}>Long</button>
        <button onClick={() => setSide("short")} className={`btn ${side === "short" ? "btn-short" : "btn-ghost"}`}>Short</button>
      </div>

      {/* Order type + size */}
      <div className="panel space-y-3 p-3">
        <div className="flex gap-1.5">
          {(["market", "limit"] as const).map((t) => (
            <button key={t} onClick={() => setOrderType(t)} className="pill flex-1 capitalize" style={{ background: t === orderType ? "var(--ink)" : "var(--panel-2)", color: t === orderType ? "var(--ink-fg)" : "var(--text)" }}>{t}</button>
          ))}
        </div>
        {orderType === "limit" && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="muted">Limit price</span>
            <input type="number" inputMode="decimal" className="input !w-32 !py-1.5 text-right font-mono" placeholder={mid ? String(mid) : ""} value={limitPx} onChange={(e) => setLimitPx(e.target.value)} />
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="muted">Margin (USDC)</span>
          <span className="muted">Max {fmtUsd(MAX_POSITION_USD)} during beta</span>
        </div>
        <div className="flex gap-2">
          {QUICK.map((q) => (
            <button key={q} onClick={() => setUsd(q)} className="pill flex-1" style={{ background: usd === q ? "var(--ink)" : "var(--panel-2)", color: usd === q ? "var(--ink-fg)" : "var(--text)" }}>${q}</button>
          ))}
        </div>
        <input type="number" inputMode="decimal" className="input font-mono" value={usd} min={5} max={MAX_POSITION_USD} onChange={(e) => setUsd(Math.max(0, Number(e.target.value)))} />
        <div className="flex items-center justify-between text-sm">
          <span className="muted">Leverage</span>
          <span className="font-mono font-bold">{lev}×</span>
        </div>
        <input type="range" min={1} max={maxLev} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="w-full accent-[var(--ink)]" />
        <div className="muted grid grid-cols-3 gap-2 text-xs">
          <div>Position<br /><span className="font-mono text-sm" style={{ color: "var(--text)" }}>{fmtUsd(notional)}</span></div>
          <div>Size<br /><span className="font-mono text-sm" style={{ color: "var(--text)" }}>{market ? fmtSize(size, market.szDecimals) : "—"} {coin}</span></div>
          <div>Liq. distance<br /><span className="font-mono text-sm" style={{ color: "var(--text)" }}>≈{liqPct.toFixed(0)}%</span></div>
        </div>
      </div>

      {/* Take profit / stop loss */}
      <div className="panel space-y-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">Take profit / stop loss</span>
          <button onClick={() => setTpslOn((v) => !v)} className="pill !px-2.5 !py-0.5 !text-[11px]" style={{ background: tpslOn ? "var(--ink)" : "var(--panel-2)", color: tpslOn ? "var(--ink-fg)" : "var(--text)" }}>{tpslOn ? "On" : "Off"}</button>
        </div>
        {tpslOn && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="muted mb-1 text-[11px]">Take profit</div>
                <input type="number" inputMode="decimal" className="input !py-2 font-mono" value={tp} onChange={(e) => setTp(e.target.value)} placeholder={refPx ? (side === "long" ? (refPx * 1.04).toFixed(2) : (refPx * 0.96).toFixed(2)) : ""} />
                {tpPrev && <div className={`mt-1 text-[11px] ${tpPrev.usd >= 0 ? "green" : "red"}`}>{tpPrev.pct >= 0 ? "+" : ""}{tpPrev.pct.toFixed(1)}% · {fmtUsd(tpPrev.usd, { sign: true })}</div>}
              </div>
              <div>
                <div className="muted mb-1 text-[11px]">Stop loss</div>
                <input type="number" inputMode="decimal" className="input !py-2 font-mono" value={sl} onChange={(e) => setSl(e.target.value)} placeholder={refPx ? (side === "long" ? (refPx * 0.97).toFixed(2) : (refPx * 1.03).toFixed(2)) : ""} />
                {slPrev && <div className={`mt-1 text-[11px] ${slPrev.usd >= 0 ? "green" : "red"}`}>{slPrev.pct >= 0 ? "+" : ""}{slPrev.pct.toFixed(1)}% · {fmtUsd(slPrev.usd, { sign: true })}</div>}
              </div>
            </div>
            <p className="faint text-[11px]">Placed on Hyperliquid with the order; both trigger as market orders. Est. liquidation {estLiq ? estLiq.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}.</p>
          </>
        )}
      </div>

      <input className="input" placeholder="Add a note (optional)" value={caption} maxLength={240} onChange={(e) => setCaption(e.target.value)} />

      {err && <p className="red text-sm">{err}</p>}

      <button onClick={submit} disabled={!!busy || !market || size <= 0} className={`btn w-full text-[15px] ${side === "long" ? "btn-long" : "btn-short"}`}>
        {busy ?? (authenticated ? `${orderType === "limit" ? "Limit " : ""}${side === "long" ? "Long" : "Short"} ${coin} ${lev}× · ${fmtUsd(notional)}` : "Log in to trade")}
      </button>
      <p className="faint text-center text-[11px]">{orderType === "market" ? "Market order, up to 3% slippage." : "Limit order, rests until filled or cancelled."} You can lose your margin. Not financial advice.</p>
    </div>
  );
}
