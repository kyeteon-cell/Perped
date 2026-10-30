"use client";

import Link from "next/link";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { fmtUsd } from "@/lib/format";
import { SignInOptions } from "./SignInOptions";
import { useDemoEquity } from "@/lib/hooks/useDemoEquity";
import { useMids } from "@/lib/hooks/useMids";

/** The "your day" card at the top of Home. Shows a generic welcome for logged-out visitors. */
export function Hero({ onDeposit }: { onDeposit: () => void }) {
  const { authenticated, profile } = useSession();
  const { data } = useSWR<{ accountValue: number | null; stats: { realizedPnl7d: string; callStreak: number } | null; positions: unknown[] }>(
    profile ? `/api/profile/${profile.handle}` : null,
    { refreshInterval: 30_000 },
  );
  const { mids } = useMids();
  const demo = useDemoEquity(profile?.isDemo ? profile.handle : null, Number(profile?.demoBalance ?? 0), mids);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (!authenticated || !profile) {
    return (
      <div className="hero photo" style={{ backgroundImage: "url(/api/share-bg/hero-droplets)" }}>
        <div className="k">Perped · PvP perps</div>
        <div className="big" style={{ fontSize: 26, lineHeight: 1.1 }}>Trade in public.<br />Get perped or get paid.</div>
        <div className="mt-2.5 text-[13px] opacity-95">Post your position. Someone will copy it, someone will fade it, and the chain decides who was right.</div>
        <div className="mt-4"><SignInOptions compact onDark /></div>
        <div className="hero-actions" style={{ marginTop: 10 }}><Link href="/markets">Browse markets first</Link><Link href="/how-it-works">Where your money is →</Link></div>
      </div>
    );
  }
  const bal = profile.isDemo ? demo.equity : (data?.accountValue ?? 0);
  const openN = profile.isDemo ? demo.openCount : (data?.positions?.length ?? 0);
  return (
    <div className="hero photo" style={{ backgroundImage: "url(/api/share-bg/hero-droplets)" }}>
      <div className="k">{greet}, {profile.handle}{profile.isDemo ? " · demo" : ""}</div>
      <div className="big mono">{fmtUsd(bal)}</div>
      {profile.isDemo && demo.openCount > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] opacity-90">
          <span>Available <b className="mono">{fmtUsd(demo.cash)}</b></span>
          <span>In trades <b className="mono">{fmtUsd(demo.margin)}</b></span>
          <span>Unrealised <b className={`mono ${demo.upnl >= 0 ? "" : ""}`}>{fmtUsd(demo.upnl, { sign: true })}</b></span>
        </div>
      )}
      <div className="mt-2.5 flex gap-4 text-[13px] opacity-95">
        <span>7 days <b className="mono">{fmtUsd(Number(data?.stats?.realizedPnl7d ?? 0), { sign: true })}</b></span>
        <span>Open <b className="mono">{openN}</b></span>
        {(data?.stats?.callStreak ?? 0) > 0 && <span>Streak <b>🔥 {data!.stats!.callStreak}</b></span>}
      </div>
      <div className="hero-actions">
        <Link href="/markets" className="solid">Trade</Link>
        {profile.isDemo ? <Link href="/settings">Connect wallet</Link> : <button onClick={onDeposit}>Deposit</button>}
        <Link href="/compose">Post</Link>
      </div>
      {bal === 0 && !profile.isDemo && <div className="relative mt-3 text-[12px] opacity-90">Fund your account to place your first trade.</div>}
    </div>
  );
}
