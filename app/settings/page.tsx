"use client";


import { LanguagePicker } from "@/components/LanguagePicker";
import { tt } from "@/lib/i18n";
import { PushPrompt } from "@/components/PushPrompt";
import { AlertSettings } from "@/components/AlertSettings";
import { PatchNotesRow } from "@/components/PatchNotes";
import { useEffect, useState } from "react";
import Link from "next/link";
import { HlImportSettings } from "@/components/HlRecord";
import { ProfileEditor } from "@/components/ProfileEditor";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { Icon, I, getTheme, setTheme, type Theme } from "@/components/ui";
import useSWR from "swr";
import { BUILDER_FEE_REFERRED_TENTHS_BPS, BUILDER_FEE_STANDARD_TENTHS_BPS, BUILDER_FEE_TOP_TENTHS_BPS, BUILDER_MAX_FEE_RATE, DEMO_ENABLED, TOP_TIER_RANK } from "@/lib/config";
import { fmtUsd } from "@/lib/format";
import { tenthsBpsToLabel, type FeeInfo } from "@/lib/fees";
import type { ReferralSummary } from "@/lib/referrals";
import type { User } from "@/lib/schema";
import { useLive, openComingSoon } from "@/lib/hooks/useLive";
import { LEVEL_KEY, getLevel, type Level } from "@/lib/level";

type Key = "showLiquidations" | "showSizes" | "allowCopy" | "allowFade" | "showBottomBoard" | "acceptDuels";

export default function SettingsPage() {
  const { profile, authedFetch, refreshMe, logout, address, fee, hasExternalWallet, linkWallet, linkError, isGuest, login, guestToken, linkX, linkXState } = useSession();
  const { allowed: liveOk, gate } = useLive();
  const [keyCopied, setKeyCopied] = useState(false);
  const [level, setLevelState] = useState<Level | null>(null);
  useEffect(() => { setLevelState(getLevel()); }, []);
  const [copied, setCopied] = useState(false);
  const { markets } = useMarkets();
  const topCap = markets.reduce((m, x) => Math.max(m, x.maxLeverage), 0) || 50;
  const levOptions = [1, 2, 3, 5, 10, 20, 25, 40, 50].filter((n) => n <= topCap).map((n) => [String(n), `${n}×`] as [string, string]);
  const [theme, setThemeState] = useState<Theme>("auto");
  const [local, setLocal] = useState<Partial<User>>({});
  useEffect(() => setThemeState(getTheme()), []);
  useEffect(() => { if (profile) setLocal(profile); }, [profile]);
  type Ref = { code: string; link: string; referredBy: string | null; fee: FeeInfo; programme: { sharePct: number; topSharePct: number; topThreshold: number }; summary: ReferralSummary; referees: { handle: string; earnedUsd: number; volumeUsd: number }[]; payouts: { id: number; amountUsd: string; txHash: string | null; createdAt: string }[] };
  const { data: ref } = useSWR<Ref>(profile ? "/api/referrals" : null, async () => (await authedFetch("/api/referrals")).json());
  const copyLink = async () => { try { await navigator.clipboard.writeText(ref?.link ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const save = async (patch: Partial<User>) => {
    setLocal((l) => ({ ...l, ...patch }));
    const r = await authedFetch("/api/me/settings", { method: "PATCH", body: JSON.stringify(patch) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setSaveErr(j.error === "invite_required" ? "invite_required" : j.error ?? "Couldn't save");
      setLocal((l) => ({ ...l, ...(profile ?? {}) }));
    } else setSaveErr(null);
    refreshMe();
  };
  const goLive = () => (isGuest ? login() : hasExternalWallet ? save({ isDemo: false }) : linkWallet());
  const Toggle = ({ k, label, note }: { k: Key; label: string; note?: string }) => (
    <label className="srow"><span>{label}{note && <span className="when ml-1.5">{note}</span>}</span><input type="checkbox" className="sw" checked={!!local[k]} onChange={(e) => save({ [k]: e.target.checked } as Partial<User>)} /></label>
  );
  const Seg = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
    <div className="seg">{options.map(([v, l]) => <button key={v} className={`chip ${value === v ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => onChange(v)}>{l}</button>)}</div>
  );

  if (!profile) return <div className="py-5"><p className="muted px-5 text-sm">{tt("Log in to see your settings.")}</p><div className="eyebrow px-5 pb-1.5 pt-4">{tt("Language")}</div><LanguagePicker /><div className="mt-4 px-5"><PatchNotesRow /></div></div>;

  return (
    <div data-tint="violet" className="fade-in pb-6">
      <header className="hairline flex items-center justify-between px-4 py-3"><Link href={`/u/${profile.handle}`} className="iconbtn" aria-label={tt("Back")}><Icon d={I.back} /></Link><div className="name">{tt("Settings")}</div><span className="w-9" /></header>

      <div id="profile" style={{ scrollMarginTop: 12 }}><ProfileEditor /></div>
      {isGuest && guestToken && (
        <div className="px-5 pb-2 pt-3">
          <div className="card p-4" style={{ border: "1.5px solid var(--gold)" }}>
            <div className="font-bold">{tt("Your guest key")}</div>
            <p className="muted mt-1 text-sm">{tt("This device stays signed in automatically. Save the key to get back into")}{" "}<b>{profile.handle}</b>{" "}{tt("from another phone or browser, or if you clear your data. Anyone with the key can use this demo account.")}</p>
            <div className="mt-2 flex gap-2"><input className="field mono" style={{ padding: "8px 12px", fontSize: 11 }} readOnly value={guestToken} onFocus={(e) => e.currentTarget.select()} /><button className="chip on" onClick={async () => { try { await navigator.clipboard.writeText(guestToken); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 1500); } catch {} }}>{keyCopied ? tt("Copied") : tt("Copy")}</button></div>
          </div>
          <div className="card mt-2.5 p-4">
            <div className="font-bold">{tt("Sign in with X instead of a key")}</div>
            <p className="muted mt-1 text-sm">{tt("Attach your X account to")}{" "}<b>{profile.handle}</b>{tt(". After that, signing in with X opens this account on any device, and you won’t need the key.")}</p>
            <button className="btn brand mt-3 w-full" style={{ padding: 12, fontSize: 14 }} disabled={linkXState.busy} onClick={linkX}><Icon d={I.x} size={16} />{linkXState.busy ? tt("Linking…") : tt("Link my X account")}</button>
          </div>
        </div>
      )}
      {(linkXState.done || linkXState.error) && <div className="px-5 pb-2 pt-3"><div className={`card p-3.5 text-sm ${linkXState.error ? "red" : ""}`} style={linkXState.done ? { color: "var(--green)", background: "var(--green-soft)" } : {}}>{linkXState.done ?? linkXState.error}</div></div>}

      <div className="eyebrow px-5 pb-1.5 pt-4">{tt("Language")}</div>
      <LanguagePicker />

      <div className="eyebrow px-5 pb-1.5 pt-4">{tt("Appearance")}</div>
      <div className="srow"><span>{tt("Crypto experience")}<span className="when ml-1.5">{tt("sets how things are explained")}</span></span><Seg value={level ?? "crypto"} options={[["new", tt("New")], ["crypto", tt("Some")], ["perps", tt("Pro")]]} onChange={(v) => { try { localStorage.setItem(LEVEL_KEY, v); } catch {} setLevelState(v as Level); }} /></div>
      <Link href="/?welcome=1" className="srow"><span>{tt("Replay the walkthrough")}<span className="when ml-1.5">{tt("explainer, first trade, first fade")}</span></span><span>→</span></Link>
      <div className="srow"><span>{tt("Theme")}</span><Seg value={theme} options={[["light", tt("Day")], ["dark", tt("Night")], ["auto", tt("Auto")]]} onChange={(v) => { setTheme(v); setThemeState(v); }} /></div>
      <div className="srow"><span>{tt("Show P&L as")}</span><Seg value={local.pnlDisplay ?? "pct"} options={[["pct", "%"], ["usd", "$"], ["roi", "ROI"]]} onChange={(v) => save({ pnlDisplay: v })} /></div>

      <div className="eyebrow px-5 pb-1.5 pt-4">{tt("Privacy")}</div>
      <Toggle k="showLiquidations" label={tt("Post my liquidations to the feed")} />
      <Toggle k="showSizes" label={tt("Show position sizes")} />
      <Toggle k="allowCopy" label={tt("Let people copy my trades")} />
      <Toggle k="allowFade" label={tt("Let people fade my trades")} />
      <Toggle k="showBottomBoard" label={tt("Show me at the bottom of the board")} note="(off by default)" />
      <Toggle k="acceptDuels" label={tt("Accept duel challenges")} />

      <div className="eyebrow px-5 pb-1.5 pt-4">{tt("Trading")}</div>
      <div className="srow"><span>{tt("Mode")}</span><span className="chip" style={local.isDemo ? {} : { color: "var(--green)", background: "var(--green-soft)" }}>{local.isDemo ? tt("Demo · practice money") : tt("Live · real money")}</span></div>
      {!liveOk ? (
        <div className="srow"><span className="muted text-sm">{isGuest ? tt("Guest demo. Link your X account to keep this record on any device. Real-money trading opens soon.") : tt("Real-money trading opens soon. Your demo record counts toward Season 0.")}</span>{isGuest ? <button className="chip" style={{ color: "var(--brand)", background: "var(--brand-soft)" }} onClick={linkX}>{tt("Link X")}</button> : <button className="chip live-off" onClick={gate(() => null)}>{tt("Go live")}<span className="soon-pill">{tt("Soon")}</span></button>}</div>
      ) : local.isDemo ? (
        <div className="srow"><span className="muted text-sm">{isGuest ? tt("Guest demo, this device only. Sign in with X to keep your record, or connect a wallet to trade for real.") : hasExternalWallet ? tt("Your wallet is connected. Switch to live to trade with real money.") : tt("Connect a wallet to trade real money. Your wallet becomes your Hyperliquid account.")}</span><button className="chip" style={{ color: "var(--brand)", background: "var(--brand-soft)" }} onClick={goLive}>{isGuest ? tt("Sign in") : hasExternalWallet ? tt("Go live") : tt("Connect wallet")}</button></div>
      ) : (
        DEMO_ENABLED && <div className="srow"><span className="muted text-sm">{tt("Back to practice money? Your real positions stay on Hyperliquid.")}</span><button className="chip" onClick={() => save({ isDemo: true })}>{tt("Switch to demo")}</button></div>
      )}
      {!hasExternalWallet && !isGuest && !local.isDemo && <div className="srow"><span className="muted text-sm">{tt("No wallet connected.")}</span><button className="chip" onClick={linkWallet}>{tt("Connect wallet")}</button></div>}
      {saveErr === "live_closed" ? <div className="px-5 pb-1"><button className="chip" onClick={() => openComingSoon()}>{tt("Real money opens soon: see early access")}</button></div> : saveErr === "invite_required" ? (
        <div className="inv-card mx-4"><b>{tt("Real trading is invite only for now")}</b><p className="when mt-1">{tt("You’re on the waitlist. Add someone’s invite code to go live straight away, and your fees drop to the invite rate forever.")}</p><Link href="/invite" className="btn brand mt-3 w-full" style={{ padding: 12, fontSize: 14 }}>{tt("Add an invite code")}</Link></div>
      ) : (saveErr || linkError) && <p className="red px-5 pb-1 text-sm">{saveErr ?? linkError}</p>}
      <div className="srow"><span>{tt("Default leverage")}</span><Seg value={String(local.defaultLeverage ?? 3)} options={levOptions} onChange={(v) => save({ defaultLeverage: Number(v) })} /></div>
      <div className="srow"><span>{tt("Max leverage")}<span className="when ml-1.5">{tt("per market, same as Hyperliquid")}</span></span><span className="mono">{tt("up to")}{" "}{topCap}×</span></div>
      <div className="srow"><span>{tt("Your Perped fee")}<span className="when ml-1.5">{fee.reason}</span></span><span className="mono font-bold">{fee.label}</span></div>
      <PushPrompt compact />
      <AlertSettings />
      <PatchNotesRow />
      <Link href="/intro" className="srow"><span>{tt("Replay the 60-second tour")}</span><span>→</span></Link>
      <Link href="/how-it-works" className="srow" style={{ color: "var(--brand)" }}><span>{tt("How Perped works · where your money is · fees · risks")}</span><span>→</span></Link>
      <div className="srow"><span>{tt("Approved maximum")}</span><span className="chip" style={{ color: "var(--green)", background: "var(--green-soft)" }}>{BUILDER_MAX_FEE_RATE} max</span></div>
      <div className="when px-5 pb-1 pt-1.5 text-[12px] leading-relaxed">{tt("Standard")}{" "}{tenthsBpsToLabel(BUILDER_FEE_STANDARD_TENTHS_BPS)}{" "}{tt("· with a referral code")}{" "}{tenthsBpsToLabel(BUILDER_FEE_REFERRED_TENTHS_BPS)}{" "}{tt("· top")}{" "}{TOP_TIER_RANK}{" "}{tt("on the 30-day board")}{" "}{tenthsBpsToLabel(BUILDER_FEE_TOP_TENTHS_BPS)}{tt(". Hyperliquid's own fee is separate.")}</div>

      {(profile.role === "owner" || profile.role === "admin") && (
        <>
          <div className="eyebrow px-5 pb-1.5 pt-4">{profile.role === "owner" ? tt("Owner") : tt("Admin")}</div>
          <Link href="/admin" className="srow" style={{ color: "var(--brand)" }}><span><b>{tt("Admin")}</b><span className="when ml-1.5">{tt("founders, waitlist, admins")}{profile.role === "owner" ? tt(", payouts, rename") : ""}</span></span><span>→</span></Link>
        </>
      )}
      <div id="hl" className="eyebrow px-5 pb-1.5 pt-4" style={{ scrollMarginTop: 12 }}>{tt("Track record")}</div>
      <HlImportSettings />
      <Link href="/crews" className="srow" style={{ color: "var(--brand)" }}><span><b>{tt("Crews")}</b><span className="when ml-1.5">{tt("start one for your group, or find one to join")}</span></span><span>→</span></Link>
      <div className="eyebrow px-5 pb-1.5 pt-4">{tt("Referrals")}</div>
      {(profile.founderSeat != null || profile.role === "admin" || profile.role === "owner") && <Link href="/founder" className="srow" style={{ color: "var(--brand)" }}><span><b>{tt("Founder dashboard")}</b><span className="when ml-1.5">{tt("your network, activity and earnings")}</span></span><span>→</span></Link>}
      <Link href="/invite" className="srow" style={{ color: "var(--brand)" }}><span><b>{tt("Invite & earn")}</b><span className="when ml-1.5">{tt("your link, rates, earnings and people")}</span></span><span>→</span></Link>
      <div className="block mx-4 mt-1 rounded-2xl p-4" style={{ background: "var(--brand-soft)" }}>
        <div className="flex items-center justify-between"><div><div className="eyebrow" style={{ color: "var(--muted)" }}>{tt("Your code")}</div><b className="mono text-lg uppercase">{profile.handle}</b></div><button className="chip" style={{ color: "var(--brand)", background: "var(--bg)" }} onClick={copyLink}>{copied ? tt("Copied") : tt("Copy link")}</button></div>
        <p className="muted mt-2 text-[13px] leading-relaxed">{tt("Friends who join with your code trade at the referral rate. You earn")}{" "}<b>{ref?.summary.sharePct ?? 25}%</b>{" "}{tt("of the Perped fee on every trade they make, for life")}{ref && ref.summary.sharePct < ref.programme.topSharePct ? ` (${ref.programme.topSharePct}% once ${ref.programme.topThreshold} of them are trading)` : ""}{tt(". Paid in USDC to your Perped wallet.")}</p>
        {ref && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="stat" style={{ background: "var(--bg)" }}><small>{tt("Referred")}</small><div className="v mono">{ref.summary.referees}</div></div>
            <div className="stat" style={{ background: "var(--bg)" }}><small>{tt("Earned")}</small><div className="v mono">{fmtUsd(ref.summary.earnedUsd)}</div></div>
            <div className="stat" style={{ background: "var(--bg)" }}><small>{tt("Owed")}</small><div className="v mono">{fmtUsd(ref.summary.owedUsd)}</div></div>
          </div>
        )}
      </div>
      {ref?.referredBy && <div className="srow"><span>{tt("Referred by")}</span><span className="mono">@{ref.referredBy}</span></div>}
      {ref && ref.referees.length > 0 && ref.referees.slice(0, 10).map((r) => <div key={r.handle} className="srow"><span>@{r.handle}<span className="when ml-1.5">{fmtUsd(r.volumeUsd, { compact: true })} traded</span></span><span className="mono green">{fmtUsd(r.earnedUsd)}</span></div>)}
      {ref && ref.payouts.length > 0 && ref.payouts.slice(0, 5).map((p) => <div key={p.id} className="srow"><span>{tt("Payout")}<span className="when ml-1.5">{new Date(p.createdAt).toLocaleDateString()}</span></span><span className="mono">{fmtUsd(Number(p.amountUsd))}</span></div>)}

      <div className="eyebrow px-5 pb-1.5 pt-4">{tt("Account")}</div>
      <div className="srow"><span>{tt("Linked X account")}</span>{local.xHandle ? <span className="mono text-sm">@{local.xHandle}</span> : isGuest ? <button className="chip" onClick={linkX}>{tt("Link X")}</button> : <span className="when">{tt("sign in with X to link")}</span>}</div>
      <div className="srow"><span>{tt("Wallet")}{hasExternalWallet ? "" : <span className="when ml-1.5">{isGuest ? tt("guest · demo only") : tt("built-in · not connected")}</span>}</span><span className="mono muted text-[13px]">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"}</span></div>
      <div className="srow"><span>{tt("Verified status")}</span><span className="when">{profile.verified ? tt("Verified ✓") : tt("10+ closed trades and a linked X account")}</span></div>
      <button className="srow w-full text-left" onClick={logout}><span style={{ color: "var(--red)" }}>{tt("Log out")}</span><span /></button>
      <div className="when px-5 pt-4 text-center">{tt("Perped 0.4 · Powered by Hyperliquid · Not financial advice")}</div>
    </div>
  );
}
