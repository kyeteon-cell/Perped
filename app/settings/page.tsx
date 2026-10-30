"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { Icon, I, getTheme, setTheme, type Theme } from "@/components/ui";
import useSWR from "swr";
import { BUILDER_FEE_REFERRED_TENTHS_BPS, BUILDER_FEE_STANDARD_TENTHS_BPS, BUILDER_FEE_TOP_TENTHS_BPS, BUILDER_MAX_FEE_RATE, DEMO_ENABLED, MAX_LEVERAGE, MAX_POSITION_USD, TOP_TIER_RANK } from "@/lib/config";
import { fmtUsd } from "@/lib/format";
import { tenthsBpsToLabel, type FeeInfo } from "@/lib/fees";
import type { ReferralSummary } from "@/lib/referrals";
import type { User } from "@/lib/schema";

type Key = "showLiquidations" | "showSizes" | "allowCopy" | "allowFade" | "showBottomBoard" | "acceptDuels";

export default function SettingsPage() {
  const { profile, authedFetch, refreshMe, logout, address, fee } = useSession();
  const [copied, setCopied] = useState(false);
  const { markets } = useMarkets();
  const hypeCap = markets.find((m) => m.name === "HYPE")?.maxLeverage ?? MAX_LEVERAGE;
  const levOptions = [1, 2, 3, 5, 10, 20, 25, 40, 50].filter((n) => n <= hypeCap).map((n) => [String(n), `${n}×`] as [string, string]);
  const [theme, setThemeState] = useState<Theme>("auto");
  const [local, setLocal] = useState<Partial<User>>({});
  useEffect(() => setThemeState(getTheme()), []);
  useEffect(() => { if (profile) setLocal(profile); }, [profile]);
  type Ref = { code: string; link: string; referredBy: string | null; fee: FeeInfo; programme: { sharePct: number; topSharePct: number; topThreshold: number }; summary: ReferralSummary; referees: { handle: string; earnedUsd: number; volumeUsd: number }[]; payouts: { id: number; amountUsd: string; txHash: string | null; createdAt: string }[] };
  const { data: ref } = useSWR<Ref>(profile ? "/api/referrals" : null, async () => (await authedFetch("/api/referrals")).json());
  const copyLink = async () => { try { await navigator.clipboard.writeText(ref?.link ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };

  const save = async (patch: Partial<User>) => {
    setLocal((l) => ({ ...l, ...patch }));
    await authedFetch("/api/me/settings", { method: "PATCH", body: JSON.stringify(patch) });
    refreshMe();
  };
  const Toggle = ({ k, label, note }: { k: Key; label: string; note?: string }) => (
    <label className="srow"><span>{label}{note && <span className="when ml-1.5">{note}</span>}</span><input type="checkbox" className="sw" checked={!!local[k]} onChange={(e) => save({ [k]: e.target.checked } as Partial<User>)} /></label>
  );
  const Seg = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
    <div className="seg">{options.map(([v, l]) => <button key={v} className={`chip ${value === v ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => onChange(v)}>{l}</button>)}</div>
  );

  if (!profile) return <div className="p-5"><p className="muted text-sm">Log in to see your settings.</p></div>;

  return (
    <div data-tint="violet" className="fade-in pb-6">
      <header className="hairline flex items-center justify-between px-4 py-3"><Link href={`/u/${profile.handle}`} className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link><div className="name">Settings</div><span className="w-9" /></header>

      <div className="eyebrow px-5 pb-1.5 pt-3.5">Appearance</div>
      <div className="srow"><span>Theme</span><Seg value={theme} options={[["light", "Day"], ["dark", "Night"], ["auto", "Auto"]]} onChange={(v) => { setTheme(v); setThemeState(v); }} /></div>
      <div className="srow"><span>Show P&L as</span><Seg value={local.pnlDisplay ?? "pct"} options={[["pct", "%"], ["usd", "$"], ["roi", "ROI"]]} onChange={(v) => save({ pnlDisplay: v })} /></div>

      <div className="eyebrow px-5 pb-1.5 pt-4">Privacy</div>
      <Toggle k="showLiquidations" label="Post my liquidations to the feed" />
      <Toggle k="showSizes" label="Show position sizes" />
      <Toggle k="allowCopy" label="Let people copy my trades" />
      <Toggle k="allowFade" label="Let people fade my trades" />
      <Toggle k="showBottomBoard" label="Show me at the bottom of the board" note="(off by default)" />
      <Toggle k="acceptDuels" label="Accept duel challenges" />

      <div className="eyebrow px-5 pb-1.5 pt-4">Trading</div>
      {DEMO_ENABLED ? (
        <>
          <label className="srow"><span>Demo mode<span className="when ml-1.5">simulated fills, practice balance</span></span><input type="checkbox" className="sw" checked={!!local.isDemo} onChange={(e) => save({ isDemo: e.target.checked })} /></label>
          {local.isDemo && <div className="srow"><span className="muted text-sm">Ready for real money? Turn demo off, then deposit from your profile.</span><button className="chip" style={{ color: "var(--brand)", background: "var(--brand-soft)" }} onClick={() => save({ isDemo: false })}>Go live</button></div>}
        </>
      ) : (
        local.isDemo && <div className="srow"><span className="muted text-sm">Demo mode has been retired. Switch to live trading to continue.</span><button className="chip" style={{ color: "var(--brand)", background: "var(--brand-soft)" }} onClick={() => save({ isDemo: false })}>Go live</button></div>
      )}
      <div className="srow"><span>Default leverage</span><Seg value={String(local.defaultLeverage ?? 3)} options={levOptions} onChange={(v) => save({ defaultLeverage: Number(v) })} /></div>
      <div className="srow"><span>Max per trade</span><span className="mono">${MAX_POSITION_USD}</span></div>
      <div className="srow"><span>Max leverage<span className="when ml-1.5">follows HYPE on Hyperliquid</span></span><span className="mono">{hypeCap}×</span></div>
      <div className="srow"><span>Your Perped fee<span className="when ml-1.5">{fee.reason}</span></span><span className="mono font-bold">{fee.label}</span></div>
      <div className="srow"><span>Approved maximum</span><span className="chip" style={{ color: "var(--green)", background: "var(--green-soft)" }}>{BUILDER_MAX_FEE_RATE} max</span></div>
      <div className="when px-5 pb-1 pt-1.5 text-[12px] leading-relaxed">Standard {tenthsBpsToLabel(BUILDER_FEE_STANDARD_TENTHS_BPS)} · with a referral code {tenthsBpsToLabel(BUILDER_FEE_REFERRED_TENTHS_BPS)} · top {TOP_TIER_RANK} on the 30-day board {tenthsBpsToLabel(BUILDER_FEE_TOP_TENTHS_BPS)}. Hyperliquid&apos;s own fee is separate.</div>

      <div className="eyebrow px-5 pb-1.5 pt-4">Referrals</div>
      <div className="block mx-4 mt-1 rounded-2xl p-4" style={{ background: "var(--brand-soft)" }}>
        <div className="flex items-center justify-between"><div><div className="eyebrow" style={{ color: "var(--muted)" }}>Your code</div><b className="mono text-lg uppercase">{profile.handle}</b></div><button className="chip" style={{ color: "var(--brand)", background: "var(--bg)" }} onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button></div>
        <p className="muted mt-2 text-[13px] leading-relaxed">Friends who join with your code trade at the referral rate. You earn <b>{ref?.summary.sharePct ?? 25}%</b> of the Perped fee on every trade they make, for life{ref && ref.summary.sharePct < ref.programme.topSharePct ? ` (${ref.programme.topSharePct}% once ${ref.programme.topThreshold} of them are trading)` : ""}. Paid in USDC to your Perped wallet.</p>
        {ref && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="stat" style={{ background: "var(--bg)" }}><small>Referred</small><div className="v mono">{ref.summary.referees}</div></div>
            <div className="stat" style={{ background: "var(--bg)" }}><small>Earned</small><div className="v mono">{fmtUsd(ref.summary.earnedUsd)}</div></div>
            <div className="stat" style={{ background: "var(--bg)" }}><small>Owed</small><div className="v mono">{fmtUsd(ref.summary.owedUsd)}</div></div>
          </div>
        )}
      </div>
      {ref?.referredBy && <div className="srow"><span>Referred by</span><span className="mono">@{ref.referredBy}</span></div>}
      {ref && ref.referees.length > 0 && ref.referees.slice(0, 10).map((r) => <div key={r.handle} className="srow"><span>@{r.handle}<span className="when ml-1.5">{fmtUsd(r.volumeUsd, { compact: true })} traded</span></span><span className="mono green">{fmtUsd(r.earnedUsd)}</span></div>)}
      {ref && ref.payouts.length > 0 && ref.payouts.slice(0, 5).map((p) => <div key={p.id} className="srow"><span>Payout<span className="when ml-1.5">{new Date(p.createdAt).toLocaleDateString()}</span></span><span className="mono">{fmtUsd(Number(p.amountUsd))}</span></div>)}

      <div className="eyebrow px-5 pb-1.5 pt-4">Account</div>
      <div className="srow"><span>Linked X account</span><input className="field mono !w-40 !py-2 text-right text-sm" placeholder="@handle" value={local.xHandle ?? ""} onChange={(e) => setLocal((l) => ({ ...l, xHandle: e.target.value }))} onBlur={() => save({ xHandle: local.xHandle?.replace(/^@/, "") || null })} /></div>
      <div className="srow"><span>Wallet</span><span className="mono muted text-[13px]">{address?.slice(0, 6)}…{address?.slice(-4)}</span></div>
      <div className="srow"><span>Verified status</span><span className="when">{profile.verified ? "Verified ✓" : "10+ closed trades and a linked X account"}</span></div>
      <button className="srow w-full text-left" onClick={logout}><span style={{ color: "var(--red)" }}>Log out</span><span /></button>
      <div className="when px-5 pt-4 text-center">Perped 0.4 · Powered by Hyperliquid · Not financial advice</div>
    </div>
  );
}
