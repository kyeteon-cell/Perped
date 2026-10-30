"use client";

import { useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { HL_NETWORK } from "@/lib/config";

type Mode = "deposit" | "withdraw";

/**
 * Deposit / withdraw bottom sheet. Card route hands off to the on-ramp partner (NEXT_PUBLIC_ONRAMP_URL,
 * e.g. a MoonPay/Transak URL with the wallet pre-filled); transfer route shows the Arbitrum address.
 * Withdrawals are signed on Hyperliquid by the user's wallet (withdraw3 action) — stubbed here until wired.
 */
export function DepositSheet({ onClose, initial = "deposit" }: { onClose: () => void; initial?: Mode }) {
  const { address, hasExternalWallet, linkWallet, profile } = useSession();
  const [mode, setMode] = useState<Mode>(initial);
  const [route, setRoute] = useState<"card" | "transfer">("card");
  const [thb, setThb] = useState(3500);
  const [copied, setCopied] = useState(false);
  const rate = 33.4; // display estimate only; the on-ramp quotes the real rate
  const onramp = process.env.NEXT_PUBLIC_ONRAMP_URL;

  const copy = async () => {
    try { await navigator.clipboard.writeText(address ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Deposit or withdraw">
        <div className="grab" />
        {(!hasExternalWallet || profile?.isDemo) && (
          <div className="block"><div className="card p-4" style={{ border: "1.5px solid var(--brand)" }}>
            <div className="font-bold">Connect a wallet to trade real money</div>
            <p className="muted mt-1 text-sm">{profile?.isDemo ? "You're in demo mode. " : ""}Connect MetaMask, Rabby, Rainbow or any WalletConnect wallet; it becomes your Hyperliquid account and you deposit to it directly.</p>
            <div className="mt-3 flex gap-2"><button className="btn brand" style={{ padding: 12, fontSize: 14 }} onClick={linkWallet}>Connect wallet</button><button className="btn ghost" style={{ padding: 12, fontSize: 14 }} onClick={onClose}>Not now</button></div>
          </div></div>
        )}
        {hasExternalWallet && !profile?.isDemo && <>
        <div className="modes mx-5"><button className={mode === "deposit" ? "on" : ""} onClick={() => setMode("deposit")}>Deposit</button><button className={mode === "withdraw" ? "on" : ""} onClick={() => setMode("withdraw")}>Withdraw</button></div>

        {mode === "deposit" && (
          <>
            <div className="seg px-5 pt-4"><button className={`chip ${route === "card" ? "on" : ""}`} onClick={() => setRoute("card")}>Card or Apple Pay</button><button className={`chip ${route === "transfer" ? "on" : ""}`} onClick={() => setRoute("transfer")}>Send USDC</button></div>
            {route === "card" ? (
              <div className="block">
                <div className="flex items-center justify-between text-sm"><span className="muted">You pay</span><span className="when">THB</span></div>
                <div className="mono my-2 text-[40px] font-semibold tracking-tight">฿<input type="number" className="mono inline-block w-44 border-0 bg-transparent p-0 text-[40px] font-semibold tracking-tight outline-none" value={thb} onChange={(e) => setThb(Number(e.target.value))} /></div>
                <div className="seg">{[1000, 3500, 10000, 35000].map((v) => <button key={v} className={`chip ${thb === v ? "on" : ""}`} onClick={() => setThb(v)}>฿{v.toLocaleString()}</button>)}</div>
                <div className="fee mt-4">
                  <div className="fee-row"><span className="muted">You receive</span><b className="mono">≈ {(thb / rate * 0.973).toFixed(1)} USDC</b></div>
                  <div className="fee-row"><span className="muted">Provider fee</span><b className="mono">≈ 2.7%</b></div>
                  <div className="fee-row"><span className="muted">Arrives</span><b>Usually under 10 min</b></div>
                </div>
                {onramp ? (
                  <a className="btn deposit mt-4" href={`${onramp}${onramp.includes("?") ? "&" : "?"}walletAddress=${address ?? ""}&currencyCode=usdc_arbitrum&baseCurrencyCode=thb&baseCurrencyAmount=${thb}`} target="_blank" rel="noreferrer">Continue with card</a>
                ) : (
                  <button className="btn deposit mt-4" disabled>Card deposits coming soon</button>
                )}
                <p className="faint mt-2.5 text-center text-xs leading-relaxed">Handled by our payment partner. Perped never sees your card. USDC lands in your Hyperliquid account.</p>
              </div>
            ) : (
              <div className="block">
                <div className="flex items-center justify-between text-sm"><span className="muted">Network</span><span className="chip info">Arbitrum {HL_NETWORK === "testnet" ? "Sepolia (testnet)" : ""}</span></div>
                <div className="card mt-4 p-4">
                  <div className="eyebrow" style={{ color: "var(--muted)" }}>Your deposit address</div>
                  <div className="mono mt-1.5 break-all text-[13px]">{address ?? "…"}</div>
                  <button className="chip info mt-3" onClick={copy}>{copied ? "Copied" : "Copy address"}</button>
                </div>
                <div className="warn mt-3.5"><b>Send USDC on Arbitrum only.</b> Other tokens or networks can't be recovered. Minimum 5 USDC. Funds are bridged to Hyperliquid automatically; allow a few minutes.</div>
              </div>
            )}
          </>
        )}

        {mode === "withdraw" && (
          <div className="block">
            <p className="muted text-sm">Withdrawals go from your Hyperliquid account to any Arbitrum address, signed by your wallet. Hyperliquid charges 1 USDC; it takes about five minutes.</p>
            <div className="warn mt-3.5">Open positions stay open. Margin that's holding a position can't be withdrawn.</div>
            <a className="btn withdraw mt-4" href={HL_NETWORK === "testnet" ? "https://app.hyperliquid-testnet.xyz/portfolio" : "https://app.hyperliquid.xyz/portfolio"} target="_blank" rel="noreferrer">Withdraw on Hyperliquid</a>
            <p className="faint mt-2.5 text-center text-xs">In-app withdrawals are next on the list; for now this opens your Hyperliquid portfolio with the same wallet.</p>
          </div>
        )}
        </>}
      </div>
    </>
  );
}
