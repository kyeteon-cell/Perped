"use client";


import { tt } from "@/lib/i18n";
import { Roll } from "./Roll";
import { small } from "@/lib/img";
import { Glyph } from "./Glyph";
import Link from "next/link";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { fmtUsd } from "@/lib/format";
import { SignInOptions } from "./SignInOptions";
import { useDemoEquity } from "@/lib/hooks/useDemoEquity";
import { useMids } from "@/lib/hooks/useMids";
import { useLive } from "@/lib/hooks/useLive";

/** The "your day" card at the top of Home. Shows a generic welcome for logged-out visitors. */
export function Hero({ onDeposit }: { onDeposit: () => void }) {
  const { allowed: liveOk } = useLive();
  const { authenticated, profile } = useSession();
  const { data } = useSWR<{ accountValue: number | null; stats: { realizedPnl7d: string; callStreak: number } | null; positions: unknown[] }>(
    profile ? `/api/profile/${profile.handle}` : null,
    { refreshInterval: 60_000 },
  );
  const { mids } = useMids();
  const demo = useDemoEquity(profile?.isDemo ? profile.handle : null, Number(profile?.demoBalance ?? 0), mids);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (!authenticated || !profile) {
    return (
      <div className="hero photo" style={{ backgroundImage: `url(${small("/api/share-bg/hero-chrome", 1080)})` }}>
        <div className="k">{tt("Perped · PvP perps")}</div>
        <div className="big" style={{ fontSize: 26, lineHeight: 1.1 }}>{tt("Trade in public.")}<br />{tt("Get perped or get paid.")}</div>
        <div className="mt-2.5 text-[13px] opacity-95">{tt("Post your position. Someone will copy it, someone will fade it, and the chain decides who was right.")}</div>
        <div className="mt-4"><SignInOptions compact onDark /></div>
        <div className="hero-actions" style={{ marginTop: 10 }}><Link href="/intro">{tt("How it works in 60s")}</Link><Link href="/how-it-works">{tt("Where your money is →")}</Link><Link href="/settings">{tt("Language")}</Link></div>
      </div>
    );
  }
  const bal = profile.isDemo ? demo.equity : (data?.accountValue ?? 0);
  const openN = profile.isDemo ? demo.openCount : (data?.positions?.length ?? 0);
  // Signed in: one compact row (balance, 7d, open, streak, Trade) so the feed starts on the first screen.
  // Go live / Connect wallet live in Settings; Post is the pen in the Home banner.
  const pnl7 = Number(data?.stats?.realizedPnl7d ?? 0);
  const streak = data?.stats?.callStreak ?? 0;
  const needsFunds = bal === 0 && !profile.isDemo;
  return (
    <div className="hbal">
      <Link href={`/u/${profile.handle}`} className="min-w-0 flex-1" aria-label={`${greet}, ${profile.handle}. Your account`}>
        <div className="hbal-v mono"><Roll v={bal} fmt={(x) => fmtUsd(x)} /></div>
        <div className="hbal-s truncate">
          {profile.isDemo ? tt("Demo · ") : ""}7d <b className={`mono ${pnl7 > 0 ? "green" : pnl7 < 0 ? "red" : ""}`}>{fmtUsd(pnl7, { sign: true })}</b>
          {" · "}{openN} open{profile.isDemo && demo.openCount > 0 ? <> · <b className={`mono ${demo.upnl >= 0 ? "green" : "red"}`}><Roll v={demo.upnl} fmt={(x) => fmtUsd(x, { sign: true })} /></b> live</> : null}
          {streak > 0 && <> · <span className="gl"><Glyph n="flame" />{streak}</span></>}
        </div>
      </Link>
      {needsFunds && liveOk ? <button className="hbal-go" onClick={onDeposit}>{tt("Deposit")}</button> : <Link href="/markets" className="hbal-go">{tt("Trade")}</Link>}
    </div>
  );
}
