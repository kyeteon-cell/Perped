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

export type CopySeed = { coin: string; side: "long" | "short"; leverage: number; copiedFromId: number; handle: string };

/** The one-tap trade ticket. Optionally pre-filled from a feed post (copy trade). */
export function TradeTicket({ seed }: { seed?: CopySeed }) {
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

  const market: Market | undefined = useMemo(() => markets.find((m) => m.name === coin), [markets, coin]);
  const mid = mids[coin] ?? market?.mid ?? 0;
  const maxLev = Math.min(MAX_LEVERAGE, market?.maxLeverage ?? MAX_LEVERAGE);
  useEffect(() => { if (lev > maxLev) setLev(maxLev); }, [maxLev, lev]);

  const notional = usd * lev;
  const size = market && mid ? roundSize(notional / mid, market.szDecimals) : 0;
  const liqPct = lev > 1 ? (100 / lev) * 0.9 : 90; // rough: distance to liquidation ≈ (1/lev) minus maintenance buffer

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
    const res = await placeMarketOrder(client, { asset: market, side, usd: notional, mid, leverage: lev });
    if (!res.ok) {
      setBusy(null);
      return setErr(res.error ?? "Order failed");
    }
    setBusy("Posting to feed…");
    const entryPx = res.avgPx ?? mid;
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
      {seed && (
        <div className="pill inline-block" style={{ background: "var(--panel-2)" }}>
          Copying @{seed.handle}&apos;s {seed.side} on {seed.coin}
        </div>
      )}

      <BuilderApproval />

      {/* Market picker */}
      <div className="panel p-3">
        <input className="input mb-2" placeholder="Search markets…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {filtered.map((m) => (
            <button key={m.name} onClick={() => setCoin(m.name)} className="pill" style={{ background: m.name === coin ? "var(--accent)" : "var(--panel-2)", color: m.name === coin ? "#1a1200" : "var(--text)" }}>
              {m.name}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-2xl font-black">{coin}</span>
          <span className="font-mono text-lg">{mid ? `$${mid.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : "…"}</span>
        </div>
      </div>

      {/* Side */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setSide("long")} className={`btn ${side === "long" ? "btn-long" : "btn-ghost"}`}>▲ Long</button>
        <button onClick={() => setSide("short")} className={`btn ${side === "short" ? "btn-short" : "btn-ghost"}`}>▼ Short</button>
      </div>

      {/* Size */}
      <div className="panel space-y-3 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="muted">Margin (USDC)</span>
          <span className="muted">max {fmtUsd(MAX_POSITION_USD)}</span>
        </div>
        <div className="flex gap-2">
          {QUICK.map((q) => (
            <button key={q} onClick={() => setUsd(q)} className="pill flex-1" style={{ background: usd === q ? "var(--accent)" : "var(--panel-2)", color: usd === q ? "#1a1200" : "var(--text)" }}>${q}</button>
          ))}
        </div>
        <input type="number" inputMode="decimal" className="input font-mono" value={usd} min={5} max={MAX_POSITION_USD} onChange={(e) => setUsd(Math.max(0, Number(e.target.value)))} />
        <div className="flex items-center justify-between text-sm">
          <span className="muted">Leverage</span>
          <span className="font-mono font-bold">{lev}×</span>
        </div>
        <input type="range" min={1} max={maxLev} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        <div className="muted grid grid-cols-3 gap-2 text-xs">
          <div>Position<br /><span className="font-mono text-sm" style={{ color: "var(--text)" }}>{fmtUsd(notional)}</span></div>
          <div>Size<br /><span className="font-mono text-sm" style={{ color: "var(--text)" }}>{market ? fmtSize(size, market.szDecimals) : "—"} {coin}</span></div>
          <div>Liq. distance<br /><span className="font-mono text-sm" style={{ color: "var(--text)" }}>≈{liqPct.toFixed(0)}%</span></div>
        </div>
      </div>

      <input className="input" placeholder="Say something (optional) — why this trade?" value={caption} maxLength={240} onChange={(e) => setCaption(e.target.value)} />

      {err && <p className="red text-sm">{err}</p>}

      <button onClick={submit} disabled={!!busy || !market || size <= 0} className={`btn w-full text-lg ${side === "long" ? "btn-long" : "btn-short"}`}>
        {busy ?? (authenticated ? `${side === "long" ? "Long" : "Short"} ${coin} ${lev}× · ${fmtUsd(notional)}` : "Log in to trade")}
      </button>
      <p className="muted text-center text-xs">Market order, up to 3% slippage. Perps are risky; you can lose your margin. Not advice.</p>
    </div>
  );
}
