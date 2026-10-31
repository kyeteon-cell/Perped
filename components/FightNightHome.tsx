"use client";

import { Glyph } from "./Glyph";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type { ArenaRes } from "@/app/api/arena/route";
import { fightNightWindow } from "@/lib/fightnight";
import { Avatar, CoinMark, ticker } from "./ui";

/**
 * Home, around Fight Night: an hour before, a countdown; during the hour, the three biggest live battles
 * (nemesis matches first, then the highest leverage) with the double-XP badge. Hidden the rest of the day.
 */
export function FightNightHome() {
  const [phase, setPhase] = useState<null | { live: boolean; label: string }>(null);
  useEffect(() => {
    const tick = () => {
      const { start, end, live } = fightNightWindow(new Date());
      const ms = (live ? end : start).getTime() - Date.now();
      if (!live && ms > 3_600_000) return setPhase(null);
      const m = Math.max(1, Math.ceil(ms / 60_000));
      setPhase({ live, label: live ? `${m}m left` : `starts in ${m}m` });
    };
    tick(); const id = setInterval(tick, 20_000); return () => clearInterval(id);
  }, []);
  const { data } = useSWR<ArenaRes>(phase?.live ? "/api/arena" : null, { refreshInterval: 20_000 });
  if (!phase) return null;
  const top = [...(data?.live ?? [])]
    .sort((a, b) => Number(!!b.nemesis) - Number(!!a.nemesis) || Math.max(b.faderLeg.leverage, b.targetLeg.leverage) - Math.max(a.faderLeg.leverage, a.targetLeg.leverage))
    .slice(0, 3);
  return (
    <section className={`fnh ${phase.live ? "live" : ""}`}>
      <div className="fnh-top">
        <span className="fnh-tag gl"><Glyph n="glove" />Fight Night {phase.live ? "· LIVE" : ""}</span>
        <span className="fnh-x">2× XP</span>
        <span className="fnh-t">{phase.label}</span>
      </div>
      {!phase.live && <p className="fnh-p">From 9pm every fade you start pays double XP. Line up your fades.</p>}
      {phase.live && (
        <div className="fnh-list">
          {top.map((b) => (
            <Link key={b.id} href={`/battle/${b.faderPostId}`} className="fnh-row">
              <Avatar handle={b.fader.handle} url={b.fader.avatarUrl} size={26} link={false} />
              <b className="truncate">{b.fader.handle}</b>
              <span className="fnh-vs">{b.nemesis ? <Glyph n="skull" tone="violet" /> : "vs"}</span>
              <b className="truncate">{b.target.handle}</b>
              <Avatar handle={b.target.handle} url={b.target.avatarUrl} size={26} link={false} />
              <span className="ml-auto flex items-center gap-1 when"><CoinMark coin={b.coin} size="xs" />{ticker(b.coin)} {Math.max(b.faderLeg.leverage, b.targetLeg.leverage)}×</span>
            </Link>
          ))}
          {!top.length && <p className="fnh-p">No fades yet. Start the first one: fade a trade in the feed.</p>}
        </div>
      )}
      <Link href="/arena" className="fnh-cta">{phase.live ? "Enter the Arena →" : "See the Arena →"}</Link>
    </section>
  );
}
