"use client";

import { siteOrigin } from "@/lib/config";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Sheet } from "./Sheet";
import { Glyph } from "./Glyph";
import { Avatar, Icon, I } from "./ui";
import { useSession } from "@/lib/hooks/useSession";
import type { CompBoard, CompMe } from "@/lib/competition";

type Data = CompBoard & { me: CompMe | null };

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Site-wide XP-style bar advertising the alpha competition: fills as people place their first trade. */
export function CompBar() {
  // Signed-in fetch, so "your status" works for wallet / X / email logins too (not only guest cookies).
  const { authedFetch, profile } = useSession();
  const { data } = useSWR<Data>(["/api/competition", profile?.id ?? ""], async () => (await authedFetch("/api/competition")).json(), { refreshInterval: 60_000, revalidateOnFocus: false });
  const [open, setOpen] = useState(false);
  if (!data || data.hidden || !data.goal) return null;
  const pct = Math.min(100, (data.count / data.goal) * 100);
  return (
    <>
      <button className={`comp-bar ${data.unlocked ? "done" : ""}`} onClick={() => setOpen(true)} aria-label="Alpha competition: how it works">
        <span className="comp-row">
          <Glyph n="trophy" size={15} tone="gold" />
          <b>{data.unlocked ? "Alpha competition unlocked" : "Alpha competition"}</b>
          <span className="comp-n mono">{data.unlocked ? "See details" : <>{Math.min(data.count, data.goal)}<i>/{data.goal}</i></>}</span>
          <span className="comp-go" aria-hidden>›</span>
        </span>
        <span className="comp-track"><span className="comp-fill" style={{ width: `${Math.max(pct, 2)}%` }} /></span>
      </button>
      {open && <CompSheet d={data} onClose={() => setOpen(false)} />}
    </>
  );
}

export function CompSheet({ d, onClose }: { d: Data; onClose: () => void }) {
  const { profile } = useSession();
  const [copied, setCopied] = useState(false);
  const left = Math.max(0, d.goal - d.count);
  const pct = Math.min(100, (d.count / d.goal) * 100);
  const link = profile && typeof window !== "undefined" ? `${siteOrigin()}/?ref=${profile.handle}` : null;
  const copy = async () => { if (!link) return; try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {} };

  const me = d.me;
  let status: React.ReactNode;
  if (!profile) status = <><b>You&rsquo;re not in yet.</b> Start a free demo and place one trade to count. <button className="comp-link" onClick={() => { onClose(); window.dispatchEvent(new Event("perped:login")); }}>Start</button></>;
  else if (me?.counted) status = <><Icon d={I.check} size={15} /> <b>You&rsquo;re counted.</b> Now bring people in to fill the bar faster.</>;
  else status = <><b>You don&rsquo;t count yet.</b> Place one trade, any coin, long or short, and you&rsquo;re in. <Link className="comp-link" href="/markets" onClick={onClose}>Place a trade</Link></>;

  return (
    <Sheet label="Alpha competition" onClose={onClose}>
      <div className="comp px-5 pb-6" data-tint="gold">
        <div className="comp-badge"><Glyph n="trophy" size={14} tone="gold" />Alpha competition · demo accounts</div>
        {d.unlocked ? (
          <>
            <h2 className="mt-2 text-[22px] font-extrabold leading-tight">Unlocked. {d.goal} traders made it.</h2>
            <p className="muted mt-1.5 text-[14px] leading-relaxed">{d.details ?? "Details drop any minute. Follow @perped_ on X so you see them first."}</p>
            {d.detailsUrl && <a className="btn brand mt-4" style={{ padding: 13, fontSize: 15 }} href={d.detailsUrl} target="_blank" rel="noopener noreferrer">Read the details</a>}
          </>
        ) : (
          <>
            <h2 className="mt-2 text-[22px] font-extrabold leading-tight">{d.goal} traders unlocks the competition</h2>
            <p className="muted mt-1.5 text-[14px] leading-relaxed">When {d.goal} people have placed a trade, we drop the full details of the alpha competition for demo accounts. It runs on practice money, so there&rsquo;s nothing to pay and nothing at risk.</p>
          </>
        )}

        <div className="comp-big">
          <div className="flex items-baseline justify-between"><span className="mono text-[26px] font-bold">{d.count}<span className="faint text-[16px]"> / {d.goal}</span></span><span className="when">{d.unlocked ? "Goal reached" : `${left} to go`}</span></div>
          <span className="comp-track lg"><span className="comp-fill" style={{ width: `${Math.max(pct, 2)}%` }} /></span>
        </div>

        <div className="eyebrow mt-5">How to count towards the {d.goal}</div>
        <ol className="comp-rules">
          <li><b>Any account counts.</b> Instant demo, X, Google, email or wallet: no linking needed.</li>
          <li><b>Place a trade.</b> Any trade counts: long, short, a copy or a fade. Anything placed since {fmtDay(d.startAt)} counts.</li>
          <li><b>Everyone counts once.</b> More trades don&rsquo;t add more to the bar, and demo bots never count.</li>
        </ol>

        <div className="comp-me">{status}</div>

        <div className="eyebrow mt-5">Bring people in</div>
        <p className="muted mt-1.5 text-[14px] leading-relaxed">Share your invite link. Every friend who joins with it and places a trade moves the bar and goes on your recruit count. Top recruiters are listed below.</p>
        {link ? (
          <>
            <button className="comp-invite" onClick={copy}><span className="mono">{link.replace(/^https?:\/\//, "")}</span><b>{copied ? "Copied" : "Copy"}</b></button>
            {me && <p className="when mt-1.5">You&rsquo;ve brought in <b>{me.recruited}</b> {me.recruited === 1 ? "person who counts" : "people who count"}.</p>}
          </>
        ) : <p className="when mt-2">Sign in to get your invite link.</p>}

        {d.recruiters.length > 0 && (
          <div className="comp-recs">
            {d.recruiters.map((r, i) => (
              <Link key={r.handle} href={`/u/${r.handle}`} className="comp-rec" onClick={onClose}>
                <span className="mono faint w-4">{i + 1}</span>
                <Avatar handle={r.handle} url={r.avatarUrl} size={28} link={false} />
                <span className="flex-1 font-semibold">@{r.handle}</span>
                <span className="mono">{r.n}</span>
              </Link>
            ))}
          </div>
        )}

        <button className="btn ghost mt-3 w-full" style={{ padding: 12, fontSize: 14 }} onClick={onClose}>Got it</button>
      </div>
    </Sheet>
  );
}
