"use client";

import { useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { Icon, I } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import type { Notification } from "@/lib/schema";

const STYLE: Record<string, { icon: string; tint: string }> = {
  call_hit: { icon: I.check, tint: "green" }, call_missed: { icon: I.warn, tint: "red" }, copied: { icon: I.copy, tint: "brand" }, faded: { icon: I.copy, tint: "red" },
  stop: { icon: I.warn, tint: "red" }, tp: { icon: I.check, tint: "green" }, follow: { icon: I.user, tint: "violet" }, rank: { icon: I.trophy, tint: "gold" },
  reply: { icon: I.comment, tint: "blue" }, duel: { icon: I.trophy, tint: "gold" }, battle: { icon: I.bolt, tint: "gold" }, sl: { icon: I.warn, tint: "red" }, liquidation: { icon: I.bolt, tint: "red" }, referral: { icon: I.user, tint: "green" }, settled: { icon: I.list, tint: "green" },
};

export default function NotificationsPage() {
  const { authedFetch, authenticated, refreshMe } = useSession();
  const { data, mutate } = useSWR<{ notifications: Notification[] }>(authenticated ? "/api/notifications" : null, async () => (await authedFetch("/api/notifications")).json());
  useEffect(() => { if (data?.notifications.some((n) => !n.read)) authedFetch("/api/notifications", { method: "POST" }).then(() => { mutate(); refreshMe(); }); }, [data, authedFetch, mutate, refreshMe]);
  const rows = data?.notifications ?? [];
  const today = rows.filter((n) => Date.now() - new Date(n.createdAt).getTime() < 86_400_000), earlier = rows.filter((n) => !today.includes(n));
  const Row = ({ n }: { n: Notification }) => {
    const st = STYLE[n.type] ?? { icon: I.bell, tint: "brand" };
    return (
      <Link href={n.href ?? "#"} className="hairline flex items-center gap-3.5 px-5 py-3.5" style={{ background: n.read ? undefined : "var(--surface)" }}>
        <div className="grid h-10 w-10 flex-none place-items-center rounded-xl" style={{ background: `var(--${st.tint}-soft)`, color: `var(--${st.tint})` }}><Icon d={st.icon} /></div>
        <div className="min-w-0 flex-1"><b className="text-[15px]">{!n.read && <span className="mr-2 inline-block h-[7px] w-[7px] rounded-full align-[2px]" style={{ background: "var(--brand)" }} />}{n.title}</b>{n.body && <div className="when truncate">{n.body}</div>}</div>
        <span className="when">{timeAgo(n.createdAt)}</span>
      </Link>
    );
  };
  return (
    <div data-tint="brand" className="fade-in">
      <header className="hairline flex items-center justify-between px-4 py-3"><Link href="/" className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link><div className="name">Notifications</div><span className="w-9" /></header>
      {!authenticated && <p className="muted p-5 text-sm">Log in to see notifications.</p>}
      {authenticated && rows.length === 0 && <p className="muted p-5 text-sm">Nothing yet. When someone copies you, your call resolves, or a stop triggers, it lands here.</p>}
      {today.length > 0 && <div className="eyebrow px-5 pb-1.5 pt-3.5">Today</div>}
      {today.map((n) => <Row key={n.id} n={n} />)}
      {earlier.length > 0 && <div className="eyebrow px-5 pb-1.5 pt-3.5">Earlier</div>}
      {earlier.map((n) => <Row key={n.id} n={n} />)}
    </div>
  );
}
