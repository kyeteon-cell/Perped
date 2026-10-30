"use client";

import { Sheet } from "./Sheet";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { CoinMark, ticker } from "./ui";

/** Challenge another trader to a duel: pick coin, your side, stake and duration. Creates the duel, then opens the ticket for your side. */
export function ChallengeSheet({ handle, onClose }: { handle: string; onClose: () => void }) {
  const router = useRouter();
  const { authedFetch, authenticated, login } = useSession();
  const { markets } = useMarkets();
  const [coin, setCoin] = useState("BTC");
  const [side, setSide] = useState<"long" | "short">("long");
  const [stake, setStake] = useState(50);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const top = ["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE", "SUI", "LINK"].filter((c) => markets.some((m) => m.name === c));

  const go = async () => {
    if (!authenticated) return login();
    setBusy(true); setErr(null);
    const r = await authedFetch("/api/duels", { method: "POST", body: JSON.stringify({ opponent: handle, coin, side, stakeUsd: stake, hours }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Couldn't create the duel");
    router.push(`/trade?duel=${j.duel.id}`);
  };

  return (
    <Sheet label="Challenge to a duel" onClose={onClose}>
        <div className="px-5 pb-6">
          <div className="flex items-center justify-between"><b className="text-lg">⚔ Challenge {handle}</b><span className="when">{hours}h · ${stake} each</span></div>
          <p className="muted mt-1 text-sm">You take one side, they take the other. Whoever is further ahead when the clock runs out wins. Stakes are your own positions; nothing is pooled.</p>
          <div className="eyebrow mt-4 mb-2">Market</div>
          <div className="seg">{top.map((c) => <button key={c} className={`chip ${c === coin ? "on" : ""}`} onClick={() => setCoin(c)}><CoinMark coin={c} size="xs" />{ticker(c)}</button>)}</div>
          <div className="eyebrow mt-4 mb-2">Your side</div>
          <div className="grid grid-cols-2 gap-2.5"><button className={`btn ${side === "long" ? "long" : ""}`} onClick={() => setSide("long")}>Long</button><button className={`btn ${side === "short" ? "short" : ""}`} onClick={() => setSide("short")}>Short</button></div>
          <div className="eyebrow mt-4 mb-2">Stake (margin each)</div>
          <div className="seg">{[25, 50, 100, 250, 500].map((s) => <button key={s} className={`chip ${s === stake ? "on" : ""}`} onClick={() => setStake(s)}>${s}</button>)}</div>
          <div className="eyebrow mt-4 mb-2">Settles in</div>
          <div className="seg">{[1, 4, 24, 72, 168].map((h) => <button key={h} className={`chip ${h === hours ? "on" : ""}`} onClick={() => setHours(h)}>{h < 24 ? `${h}h` : `${h / 24}d`}</button>)}</div>
          {err && <p className="red mt-3 text-sm">{err}</p>}
          <button className="btn brand mt-5" onClick={go} disabled={busy}>{busy ? "Creating…" : `Send challenge · then open your ${side}`}</button>
        </div>
    </Sheet>
  );
}
