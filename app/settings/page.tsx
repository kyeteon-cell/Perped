"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/hooks/useSession";
import { Icon, I, getTheme, setTheme, type Theme } from "@/components/ui";
import { BUILDER_MAX_FEE_RATE, DEMO_ENABLED, MAX_POSITION_USD } from "@/lib/config";
import type { User } from "@/lib/schema";

type Key = "showLiquidations" | "showSizes" | "allowCopy" | "allowFade" | "showBottomBoard" | "acceptDuels";

export default function SettingsPage() {
  const { profile, authedFetch, refreshMe, logout, address } = useSession();
  const [theme, setThemeState] = useState<Theme>("auto");
  const [local, setLocal] = useState<Partial<User>>({});
  useEffect(() => setThemeState(getTheme()), []);
  useEffect(() => { if (profile) setLocal(profile); }, [profile]);

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
      <div className="srow"><span>Default leverage</span><Seg value={String(local.defaultLeverage ?? 3)} options={[["1", "1×"], ["2", "2×"], ["3", "3×"], ["5", "5×"]]} onChange={(v) => save({ defaultLeverage: Number(v) })} /></div>
      <div className="srow"><span>Max per trade</span><span className="mono">${MAX_POSITION_USD}</span></div>
      <div className="srow"><span>Perped fee approval</span><span className="chip" style={{ color: "var(--green)", background: "var(--green-soft)" }}>{BUILDER_MAX_FEE_RATE} max</span></div>

      <div className="eyebrow px-5 pb-1.5 pt-4">Account</div>
      <div className="srow"><span>Linked X account</span><input className="field mono !w-40 !py-2 text-right text-sm" placeholder="@handle" value={local.xHandle ?? ""} onChange={(e) => setLocal((l) => ({ ...l, xHandle: e.target.value }))} onBlur={() => save({ xHandle: local.xHandle?.replace(/^@/, "") || null })} /></div>
      <div className="srow"><span>Wallet</span><span className="mono muted text-[13px]">{address?.slice(0, 6)}…{address?.slice(-4)}</span></div>
      <div className="srow"><span>Verified status</span><span className="when">{profile.verified ? "Verified ✓" : "10+ closed trades and a linked X account"}</span></div>
      <button className="srow w-full text-left" onClick={logout}><span style={{ color: "var(--red)" }}>Log out</span><span /></button>
      <div className="when px-5 pt-4 text-center">Perped 0.3 · Powered by Hyperliquid · Not financial advice</div>
    </div>
  );
}
