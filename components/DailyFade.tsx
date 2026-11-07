"use client";


import { tt } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Avatar, CoinMark, ticker } from "./ui";
import { useSession } from "@/lib/hooks/useSession";

type Daily = { postId: number; handle: string; avatarUrl: string | null; coin: string; side: string; leverage: number; faders: number; myBattle: number | null; bonus: number };

const left = () => {
  const now = new Date(), end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const m = Math.max(0, Math.round((end - now.getTime()) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
};

/** Home: today's Daily Fade. One trade everyone is invited to fade; beat it for bonus XP. */
export function DailyFade() {
  const { profile } = useSession();
  // The global fetcher carries your session, so "you're in" shows when you've already faded it.
  const { data } = useSWR<{ daily: Daily | null }>(`/api/daily${profile ? `?u=${profile.id}` : ""}`, { refreshInterval: 60_000 });
  const d = data?.daily ?? null;
  const [t, setT] = useState("");
  useEffect(() => { setT(left()); const id = setInterval(() => setT(left()), 30_000); return () => clearInterval(id); }, []);
  if (!d) return null;
  const mine = profile?.handle === d.handle;
  const fade = d.side === "long" ? "short" : "long";
  return (
    <section className="dfd">
      <div className="dfd-top"><span className="dfd-tag">{tt("Daily Fade")}</span><span className="dfd-x">+{d.bonus} XP</span><span className="dfd-t">{t}</span></div>
      <div className="dfd-row">
        <Avatar handle={d.handle} url={d.avatarUrl} size={44} link={false} />
        <div className="min-w-0 flex-1">
          <b className="truncate">{mine ? tt("You're today's target") : `Beat @${d.handle}`}</b>
          <span className="when"><span className={d.side === "long" ? "green" : "red"}>{d.side === "long" ? tt("Long") : tt("Short")} {d.leverage}×</span> {ticker(d.coin)} · {d.faders} fading{mine ? tt(" you") : ""}</span>
        </div>
        <CoinMark coin={d.coin} size="sm" />
      </div>
      {mine ? <Link href={`/post/${d.postId}`} className="dfd-cta">{tt("See who's fading you →")}</Link>
        : d.myBattle ? <Link href={`/battle/${d.myBattle}`} className="dfd-cta in">{tt("You're in · watch the fight →")}</Link>
        : <Link href={`/post/${d.postId}?fade=1`} className={`dfd-cta go ${fade}`}>{tt("Fade it · go")}{" "}{fade} →</Link>}
    </section>
  );
}
