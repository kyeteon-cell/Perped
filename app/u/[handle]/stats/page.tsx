"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { StatsPanels } from "@/components/Performance";
import { Avatar, Icon, I } from "@/components/ui";
import type { Stats, User } from "@/lib/schema";

type Res = { user: User; stats: Stats | null; rivalries: { opponent: string; wins: number; losses: number }[]; error?: string };

/** /u/:handle/stats — the full performance page: equity curve, hit-rate rings, P&L by market, long/short, distribution. */
export default function StatsPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { data } = useSWR<Res>(`/api/profile/${handle}`);
  if (!data) return <p className="muted p-5 text-sm">Loading…</p>;
  if (data.error) return <p className="muted p-5 text-sm">No trader with that handle.</p>;
  return (
    <div className="fade-in profile pb-6">
      <header className="hairline flex items-center justify-between px-4 py-3">
        <Link href={`/u/${handle}`} className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link>
        <div className="flex items-center gap-2"><Avatar handle={data.user.handle} url={data.user.avatarUrl} size={24} /><div className="name">{data.user.handle} · stats</div></div>
        <span className="w-9" />
      </header>
      <StatsPanels handle={handle} stats={data.stats} rivalries={data.rivalries ?? []} />
    </div>
  );
}
