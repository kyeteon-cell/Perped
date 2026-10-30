"use client";

import Link from "next/link";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { fmtUsd } from "@/lib/format";

/** The "your day" card at the top of Home. Shows a generic welcome for logged-out visitors. */
export function Hero({ onDeposit }: { onDeposit: () => void }) {
  const { authenticated, login, profile } = useSession();
  const { data } = useSWR<{ accountValue: number | null; stats: { realizedPnl7d: string; callStreak: number } | null; positions: unknown[] }>(
    profile ? `/api/profile/${profile.handle}` : null,
    { refreshInterval: 30_000 },
  );
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (!authenticated || !profile) {
    return (
      <div className="hero">
        <div className="k">Welcome to Perped</div>
        <div className="big" style={{ fontSize: 24 }}>Trade in public. Copy the best.</div>
        <div className="mt-2 text-[13px] opacity-95">Every trade is a post. Every record is on-chain. Your money stays on Hyperliquid.</div>
        <div className="hero-actions"><button className="solid" onClick={login}>Get started</button><Link href="/markets">Browse markets</Link></div>
      </div>
    );
  }
  const bal = data?.accountValue ?? 0;
  const openN = data?.positions?.length ?? 0;
  return (
    <div className="hero">
      <div className="k">{greet}, {profile.handle}</div>
      <div className="big mono">{fmtUsd(bal)}</div>
      <div className="mt-2.5 flex gap-4 text-[13px] opacity-95">
        <span>7 days <b className="mono">{fmtUsd(Number(data?.stats?.realizedPnl7d ?? 0), { sign: true })}</b></span>
        <span>Open <b className="mono">{openN}</b></span>
        {(data?.stats?.callStreak ?? 0) > 0 && <span>Streak <b>🔥 {data!.stats!.callStreak}</b></span>}
      </div>
      <div className="hero-actions">
        <Link href="/markets" className="solid">Trade</Link>
        <button onClick={onDeposit}>Deposit</button>
        <Link href="/compose">Post</Link>
      </div>
      {bal === 0 && <div className="relative mt-3 text-[12px] opacity-90">Fund your account to place your first trade.</div>}
    </div>
  );
}
