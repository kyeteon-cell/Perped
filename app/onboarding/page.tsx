"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { makeExchangeClient, approveBuilderFee } from "@/lib/hl-exchange";
import { getMaxBuilderFee } from "@/lib/hl-info";
import { BUILDER_ADDRESS, BUILDER_CONFIGURED, BUILDER_FEE_TENTHS_BPS, BUILDER_MAX_FEE_RATE, HL_NETWORK } from "@/lib/config";
import { Icon, I } from "@/components/ui";

/**
 * Five steps: welcome/login → handle → how it works → fee approval (skippable) → funded or explore.
 * Returning users skip straight past steps they've completed.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { ready, authenticated, login, address, walletClient, profile, profileLoading, authedFetch, refreshMe } = useSession();
  const [step, setStep] = useState(1);
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [avail, setAvail] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (authenticated && profile) setStep((s) => (s < 3 ? 3 : s));
    else if (authenticated && address && !profileLoading) setStep((s) => (s < 2 ? 2 : s));
  }, [ready, authenticated, profile, profileLoading, address]);

  useEffect(() => {
    if (handle.length < 3) return setAvail(null);
    const t = setTimeout(async () => { const r = await fetch(`/api/profile/${handle.toLowerCase()}`); setAvail(r.status === 404); }, 300);
    return () => clearTimeout(t);
  }, [handle]);

  const saveHandle = async () => {
    setBusy(true); setErr(null);
    const r = await authedFetch("/api/me", { method: "POST", body: JSON.stringify({ handle: handle.toLowerCase(), bio: bio || undefined }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Try another handle");
    await refreshMe(); setStep(3);
  };
  const approve = async () => {
    if (!walletClient) return;
    setBusy(true); setErr(null);
    try {
      if (BUILDER_CONFIGURED && address && (await getMaxBuilderFee(address, BUILDER_ADDRESS)) < BUILDER_FEE_TENTHS_BPS) await approveBuilderFee(makeExchangeClient(walletClient));
      setStep(5);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(address ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const Progress = ({ n }: { n: number }) => <div className="mb-4 flex gap-1.5">{[1, 2, 3, 4].map((i) => <i key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= n ? "var(--brand)" : "var(--line)" }} />)}</div>;

  return (
    <div className="fade-in flex min-h-dvh flex-col" data-tint="brand">
      {step === 1 && (
        <>
          <div className="flex-1 px-6 pb-5 pt-12" style={{ background: "linear-gradient(180deg, var(--brand-soft) 0%, var(--bg) 100%)" }}>
            <div className="grid h-14 w-14 place-items-center rounded-2xl text-[28px] font-extrabold" style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>P</div>
            <h2 className="mt-5 text-[30px] font-bold leading-[1.1] tracking-tight">Trade in public.<br />Copy the best.</h2>
            <p className="muted mt-3 max-w-[32ch]">Perped is the social home for perps. Every trade is a post, every trader has a verified track record, and your money stays on Hyperliquid.</p>
            <div className="mt-5 flex flex-wrap gap-2"><span className="lbl long"><i />kiloklips · SOL +8.3%</span><span className="lbl short"><i />degenmaxi · ETH −2.1%</span><span className="lbl long"><i />samui_sam · HYPE +12.6%</span></div>
          </div>
          <div className="flex flex-col gap-2.5 px-6 pb-8 pt-3">
            <button className="btn ink" onClick={login}><Icon d={I.circle} size={18} />Continue with Google</button>
            <button className="btn" onClick={login}><Icon d={I.mail} size={18} />Continue with email</button>
            <button className="btn" onClick={login}><Icon d={I.wallet} size={18} />Connect a wallet</button>
            <p className="faint mt-1.5 text-center text-xs">No seed phrases. A wallet is created for you and only you control it.</p>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="flex-1 px-6 pb-3 pt-6">
            <Progress n={2} />
            <h2 className="text-[30px] font-bold leading-[1.1] tracking-tight">What should we call you?</h2>
            <p className="muted mt-2.5">Your handle is how you appear in the feed and on the leaderboards. You can change it later.</p>
            <div className="card mt-5 flex items-center gap-2.5 px-4"><span className="muted">@</span><input className="field !bg-transparent !px-0" placeholder="yourname" value={handle} onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20))} autoFocus /><span className={`text-xs font-bold ${avail === false ? "red" : avail ? "green" : "faint"}`}>{avail === null ? "" : avail ? "Available" : "Taken"}</span></div>
            <input className="field mt-2.5" placeholder="One line about how you trade (optional)" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} />
            {err && <p className="red mt-3 text-sm">{err}</p>}
          </div>
          <div className="px-6 pb-8"><button className="btn ink" onClick={saveHandle} disabled={busy || handle.length < 3 || avail === false}>{busy ? "Saving…" : "Continue"}</button></div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="flex-1 px-6 pb-3 pt-6">
            <Progress n={3} />
            <h2 className="text-[30px] font-bold leading-[1.1] tracking-tight">How Perped works</h2>
            <div className="mt-5 flex flex-col gap-2.5">
              {[
                [I.markets, "brand", "Every trade is a post", "Open a position and it appears in the feed with your name on it, live P&L and all. Wins and losses."],
                [I.copy, "blue", "Copy or fade anyone in one tap", "Copy at your own size, or fade and take the other side. Track records come from the chain, so nobody can fake them."],
                [I.shield, "green", "Your money stays on Hyperliquid", "Perped never holds funds. Trades fill on Hyperliquid's order book from your own wallet. We're the screen, not the exchange."],
                [I.warn, "red", "Perps are risky", "Leverage cuts both ways and you can lose your margin. Start small, use stops, and treat every post as an opinion, not advice."],
              ].map(([icon, tint, t, b]) => (
                <div key={t as string} className="card flex items-start gap-3.5 p-3.5"><div className="grid h-10 w-10 flex-none place-items-center rounded-xl" style={{ background: `var(--${tint}-soft)`, color: `var(--${tint})` }}><Icon d={icon as string} /></div><div><b>{t as string}</b><p className="muted mt-1 text-[13px] leading-relaxed">{b as string}</p></div></div>
              ))}
            </div>
          </div>
          <div className="px-6 pb-8"><button className="btn ink" onClick={() => setStep(4)}>Got it</button></div>
        </>
      )}

      {step === 4 && (
        <>
          <div className="flex-1 px-6 pb-3 pt-6">
            <Progress n={4} />
            <h2 className="text-[30px] font-bold leading-[1.1] tracking-tight">One signature to start</h2>
            <p className="muted mt-2.5">Perped earns a small fee on trades placed here. Hyperliquid asks you to approve the maximum once, up front.</p>
            <div className="fee mt-4">
              <div className="fee-row"><span className="muted">Perped fee</span><b className="mono">{BUILDER_MAX_FEE_RATE}</b></div>
              <div className="fee-row"><span className="muted">On a $250 trade</span><b className="mono">${(250 * BUILDER_FEE_TENTHS_BPS / 100000).toFixed(2)}</b></div>
              <div className="fee-row"><span className="muted">Hyperliquid's own fee</span><b className="mono">~0.045%</b></div>
              <div className="fee-row"><span className="muted">Applies to</span><b>Trades placed in Perped only</b></div>
            </div>
            <ul className="muted mt-4 list-disc pl-5 text-sm leading-relaxed"><li>You sign once with your wallet. Nothing is charged now.</li><li>You can revoke it anytime from Hyperliquid.</li><li>It can never go above the amount you approve.</li></ul>
            {err && <p className="red mt-3 text-sm">{err}</p>}
          </div>
          <div className="flex flex-col gap-2.5 px-6 pb-8"><button className="btn brand" onClick={approve} disabled={busy || !walletClient}>{busy ? "Waiting for signature…" : `Approve ${BUILDER_MAX_FEE_RATE} and continue`}</button><button className="btn ghost" onClick={() => setStep(5)}>Skip for now</button></div>
        </>
      )}

      {step === 5 && (
        <>
          <div className="flex-1 px-6 pb-3 pt-6">
            <h2 className="text-[30px] font-bold leading-[1.1] tracking-tight">You&apos;re in{profile ? `, ${profile.handle}` : ""}.</h2>
            <p className="muted mt-2.5">Your trading wallet is ready. Add funds when you want to trade, or go look around first.</p>
            <div className="card mt-4 p-4"><div className="eyebrow" style={{ color: "var(--muted)" }}>Your Hyperliquid wallet {HL_NETWORK === "testnet" ? "(testnet)" : ""}</div><div className="mono mt-1.5 break-all text-[13px]">{address}</div><button className="chip info mt-3" onClick={copy}>{copied ? "Copied" : "Copy address"}</button></div>
            <div className="mt-3.5 flex flex-col gap-2.5">
              <div className="card flex items-start gap-3.5 p-3.5"><div className="grid h-10 w-10 flex-none place-items-center rounded-xl" style={{ background: "var(--green-soft)", color: "var(--green)" }}><Icon d={I.card} /></div><div><b>Buy USDC with a card</b><p className="muted mt-1 text-[13px]">Apple Pay, card or bank. Lands in your wallet in minutes. Available from your profile.</p></div></div>
              <div className="card flex items-start gap-3.5 p-3.5"><div className="grid h-10 w-10 flex-none place-items-center rounded-xl" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}><Icon d={I.down} /></div><div><b>Send USDC from an exchange</b><p className="muted mt-1 text-[13px]">Withdraw to the address above on Arbitrum. It's bridged to Hyperliquid for you.</p></div></div>
            </div>
          </div>
          <div className="px-6 pb-8"><button className="btn ink" onClick={() => router.push("/")}>Explore the feed</button></div>
        </>
      )}
    </div>
  );
}
