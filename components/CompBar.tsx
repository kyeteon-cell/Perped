"use client";


import { tt } from "@/lib/i18n";
import { siteOrigin } from "@/lib/config";
import { useState, useEffect } from "react";
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
  // A failed load throws (so SWR retries instead of treating the error as an empty bar), and the last good bar
  // is kept on the device so it shows instantly on every page, even before the network answers.
  const [cached, setCached] = useState<Data | undefined>(undefined);
  useEffect(() => { try { const j = localStorage.getItem("perped:comp"); if (j) setCached(JSON.parse(j)); } catch {} }, []);
  // The bar itself is public: a plain fetch, so it never waits on a sign-in token. Your own status (in the sheet)
  // is fetched signed-in separately, only when you open it.
  const { data: fresh } = useSWR<Data>("/api/competition?bar=1", async () => {
    const r = await fetch("/api/competition");
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || typeof j.goal !== "number") throw new Error("competition unavailable");
    return j as Data;
  }, { refreshInterval: 60_000, revalidateOnFocus: true, errorRetryCount: 6, errorRetryInterval: 2_000, keepPreviousData: true });
  useEffect(() => { if (fresh) try { localStorage.setItem("perped:comp", JSON.stringify({ ...fresh, me: null })); } catch {} }, [fresh]);
  const data = fresh ?? cached;
  const [open, setOpen] = useState(false);
  const { data: mine } = useSWR<Data>(open && profile ? ["/api/competition", profile.id] : null, async () => (await authedFetch("/api/competition")).json(), { revalidateOnFocus: false });
  if (data?.hidden) return null;
  // Never vanish while loading: an empty bar holds the space until the numbers arrive.
  if (!data || !data.goal) return <div className="comp-bar comp-skel" aria-hidden><span className="comp-row"><Glyph n="trophy" size={15} tone="gold" /><b>{tt("Alpha competition")}</b></span><span className="comp-track"><span className="comp-fill" style={{ width: "2%" }} /></span></div>;
  const pct = Math.min(100, (data.count / data.goal) * 100);
  return (
    <>
      {/* A div, not a <button>: iOS Safari was painting the button's background without its contents. */}
      <div role="button" tabIndex={0} className={`comp-bar ${data.unlocked ? "done" : ""}`} onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }} aria-label={tt("Alpha competition: how it works")}>
        <span className="comp-row">
          <Glyph n="trophy" size={15} tone="gold" />
          <b>{data.unlocked ? tt("Alpha competition unlocked") : tt("Alpha competition")}</b>
          <span className="comp-n mono">{data.unlocked ? tt("See details") : <>{Math.min(data.count, data.goal)}<i>/{data.goal}</i></>}</span>
          <span className="comp-go" aria-hidden>›</span>
        </span>
        <span className="comp-track"><span className="comp-fill" style={{ width: `${Math.max(pct, 2)}%` }} /></span>
      </div>
      {open && <CompSheet d={mine && typeof mine.goal === "number" ? mine : data} onClose={() => setOpen(false)} />}
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
  if (!profile) status = <><b>{tt("You’re not in yet.")}</b>{" "}{tt("Start a free demo and place one trade to count.")}{" "}<button className="comp-link" onClick={() => { onClose(); window.dispatchEvent(new Event("perped:login")); }}>{tt("Start")}</button></>;
  else if (me?.counted) status = <><Icon d={I.check} size={15} /> <b>{tt("You’re counted.")}</b>{" "}{tt("Now bring people in to fill the bar faster.")}</>;
  else status = <><b>{tt("You don’t count yet.")}</b>{" "}{tt("Place one trade, any coin, long or short, and you’re in.")}{" "}<Link className="comp-link" href="/markets" onClick={onClose}>{tt("Place a trade")}</Link></>;

  return (
    <Sheet label={tt("Alpha competition")} onClose={onClose}>
      <div className="comp px-5 pb-6" data-tint="gold">
        <div className="comp-badge"><Glyph n="trophy" size={14} tone="gold" />{tt("Alpha competition · demo accounts")}</div>
        {d.unlocked ? (
          <>
            <h2 className="mt-2 text-[22px] font-extrabold leading-tight">{tt("Unlocked.")}{" "}{d.goal}{" "}{tt("traders made it.")}</h2>
            <p className="muted mt-1.5 text-[14px] leading-relaxed">{d.details ?? tt("Details drop any minute. Follow @perped_ on X so you see them first.")}</p>
            {d.detailsUrl && <a className="btn brand mt-4" style={{ padding: 13, fontSize: 15 }} href={d.detailsUrl} target="_blank" rel="noopener noreferrer">{tt("Read the details")}</a>}
          </>
        ) : (
          <>
            <h2 className="mt-2 text-[22px] font-extrabold leading-tight">{d.goal}{" "}{tt("traders unlocks the competition")}</h2>
            <p className="muted mt-1.5 text-[14px] leading-relaxed">{tt("When")}{" "}{d.goal}{" "}{tt("people have placed a trade, we drop the full details of the alpha competition for demo accounts. It runs on practice money, so there’s nothing to pay and nothing at risk.")}</p>
          </>
        )}

        <div className="comp-big">
          <div className="flex items-baseline justify-between"><span className="mono text-[26px] font-bold">{d.count}<span className="faint text-[16px]"> / {d.goal}</span></span><span className="when">{d.unlocked ? tt("Goal reached") : `${left} to go`}</span></div>
          <span className="comp-track lg"><span className="comp-fill" style={{ width: `${Math.max(pct, 2)}%` }} /></span>
        </div>

        <div className="eyebrow mt-5">{tt("How to count towards the")}{" "}{d.goal}</div>
        <ol className="comp-rules">
          <li><b>{tt("Any account counts.")}</b>{" "}{tt("Instant demo, X, Google, email or wallet: no linking needed.")}</li>
          <li><b>{tt("Place a trade.")}</b>{" "}{tt("Any trade counts: long, short, a copy or a fade. Anything placed since")}{" "}{fmtDay(d.startAt)} counts.</li>
          <li><b>{tt("Everyone counts once.")}</b>{" "}{tt("More trades don’t add more to the bar, and demo bots never count.")}</li>
        </ol>

        <div className="comp-me">{status}</div>

        <div className="eyebrow mt-5">{tt("Bring people in")}</div>
        <p className="muted mt-1.5 text-[14px] leading-relaxed">{tt("Share your invite link. Every friend who joins with it and places a trade moves the bar and goes on your recruit count. Top recruiters are listed below.")}</p>
        {link ? (
          <>
            <button className="comp-invite" onClick={copy}><span className="mono">{link.replace(/^https?:\/\//, "")}</span><b>{copied ? tt("Copied") : tt("Copy")}</b></button>
            {me && <p className="when mt-1.5">{tt("You’ve brought in")}{" "}<b>{me.recruited}</b> {me.recruited === 1 ? tt("person who counts") : tt("people who count")}.</p>}
          </>
        ) : <p className="when mt-2">{tt("Sign in to get your invite link.")}</p>}

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

        <button className="btn ghost mt-3 w-full" style={{ padding: 12, fontSize: 14 }} onClick={onClose}>{tt("Got it")}</button>
      </div>
    </Sheet>
  );
}
