"use client";


import { tt } from "@/lib/i18n";
import Link from "next/link";
import useSWR from "swr";
import { Avatar, ticker } from "./ui";
import { fmtPct } from "@/lib/format";

type Fight = { id: number; coin: string; settledAt: string; reason: string | null; myRoi: number; theirRoi: number; iFaded: boolean; opp: string; oppAvatar: string | null; oppXp: number; wins: number };

/** Top of a profile: their best fade win (biggest margin), face to face, with a one-tap share card. */
export function BestFight({ handle, avatarUrl, xp, isMe }: { handle: string; avatarUrl: string | null; xp: number; isMe: boolean }) {
  const { data } = useSWR<{ fight: Fight | null }>(`/api/profile/${encodeURIComponent(handle)}/best-fight`, { revalidateOnFocus: false });
  const f = data?.fight;
  if (!f) return null;
  const margin = f.myRoi - f.theirRoi;
  return (
    <section className="bfi">
      <div className="bfi-top"><span className="bfi-tag">{tt("Best fight")}</span><span className="when">{f.wins}{" "}{tt("fade win")}{f.wins === 1 ? "" : "s"} · {ticker(f.coin)}{f.reason === "liquidation" ? tt(" · KO") : ""}</span></div>
      <Link href={`/battle/${f.id}`} className="bfi-row">
        <span className="bfi-f win"><Avatar handle={handle} url={avatarUrl} size={44} link={false} xp={xp} /><b className="truncate">{handle}</b><span className={`mono ${f.myRoi >= 0 ? "green" : "red"}`}>{fmtPct(f.myRoi, 1)}</span></span>
        <span className="bfi-mid"><small>{tt("won by")}</small><b className="mono">{margin.toFixed(1)}%</b></span>
        <span className="bfi-f"><Avatar handle={f.opp} url={f.oppAvatar} size={44} link={false} xp={f.oppXp} /><b className="truncate">{f.opp}</b><span className={`mono ${f.theirRoi >= 0 ? "green" : "red"}`}>{fmtPct(f.theirRoi, 1)}</span></span>
      </Link>
      <div className="bfi-acts">
        <Link href={`/battle/${f.id}`}>{tt("Watch the replay")}</Link>
        {isMe && <Link href={`/battle/${f.id}?share=1`} className="go">{tt("Share this win")}</Link>}
      </div>
    </section>
  );
}
