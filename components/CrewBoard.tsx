"use client";


import { tt } from "@/lib/i18n";
import Link from "next/link";
import { Badges } from "./ui";
import { fmtUsd } from "@/lib/format";
import type { CrewCard } from "@/lib/crews";

/** A crew's emblem: its tag in a chrome tile. */
export function CrewEmblem({ tag, size = 44 }: { tag: string; size?: number }) {
  return <span className="crew-emblem" style={{ width: size, height: size, fontSize: Math.round(size * (tag.length > 3 ? 0.27 : 0.34)) }}>{tag}</span>;
}

/** This week's crew war, best first. */
export function CrewBoard({ board, mine }: { board: CrewCard[]; mine?: string | null }) {
  if (!board.length) return <div className="block text-center muted text-sm">{tt("No crews yet. Start the first one.")}</div>;
  return (
    <div>
      {board.map((c) => (
        <Link key={c.slug} href={`/crew/${c.slug}`} className={`lb crew-row ${mine === c.slug ? "me" : ""}`}>
          <span className="rank">{c.rank}</span>
          <CrewEmblem tag={c.tag} />
          <div className="min-w-0 flex-1">
            <div className="nrow name"><span className="truncate">{c.name}</span>{mine === c.slug && <span className="crew-you">{tt("Yours")}</span>}</div>
            <div className="when truncate">@{c.owner.handle}<Badges u={c.owner} /> · {c.members} {c.members === 1 ? "member" : "members"} · {fmtUsd(c.pnl7d, { sign: true, compact: true })} 7d</div>
          </div>
          <div className="text-right">
            <div className="mono text-[17px] font-bold">{c.wins}–{c.losses}</div>
            <div className="when">fades</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
