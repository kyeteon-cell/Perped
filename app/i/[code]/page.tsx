"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Avatar, SkeletonList } from "@/components/ui";
import { Glyph } from "@/components/Glyph";
import { useSession } from "@/lib/hooks/useSession";
import { CREATOR_PCT } from "@/lib/programme-rates";

type Inv = { valid: boolean; code?: string; handle?: string; avatarUrl?: string | null; founderSeat?: number | null; fees: { normal: string; invited: string; normalBps: number; invitedBps: number } };

/** /i/:code — the invite link. Shows who's inviting, the forever discount, and one button in. */
export default function InviteLanding({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const { data } = useSWR<Inv>(`/api/invite/${encodeURIComponent(code)}`);
  const { authenticated, login, startGuest, authedFetch, profile } = useSession();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data?.valid && data.code) try { localStorage.setItem("perped:ref", data.code); } catch {} }, [data]);
  if (!data) return <SkeletonList n={2} />;
  if (!data.valid) return (
    <main className="px-4 pt-6"><div className="inv-hero"><small>Invite</small><h2>That invite link doesn&rsquo;t work</h2><p>Ask whoever sent it for a fresh one, or join the waitlist.</p></div>
      <button className="btn ink mt-4 w-full" onClick={() => router.push("/invite")}>Join the waitlist</button></main>
  );
  const per100k = (bps: number) => `$${((100_000 * bps) / 100_000).toFixed(0)}`;
  const accept = async () => {
    if (!authenticated) return login();
    if (profile?.handle === data.code) return router.push("/invite");
    setBusy(true);
    const r = await authedFetch("/api/invite", { method: "POST", body: JSON.stringify({ code: data.code }) }).then((x) => x.json()).catch(() => ({ error: "Try again" }));
    setBusy(false);
    if (r.ok) router.push("/invite"); else setMsg(r.error ?? "Couldn't apply the code");
  };
  return (
    <main className="px-4 pb-10 pt-4">
      <section className="inv-hero">
        <small>You&rsquo;re invited</small>
        <div className="inv-inviter">
          <span className={data.founderSeat ? "inv-ring" : ""}><Avatar handle={data.handle!} url={data.avatarUrl} size={52} link={false} /></span>
          <div><div className="text-[19px] font-black">{data.handle}</div>{data.founderSeat && <span className="fbadge mt-1"><Glyph n="crown" />FOUNDER #{data.founderSeat}</span>}</div>
        </div>
        <h2>Trade, fade, and pay less.</h2>
        <p>Perped is the social perps app on Hyperliquid. Every trade is a post. Every fade is a head-to-head.</p>
      </section>
      <section className="inv-card">
        <div className="flex items-center justify-between"><span className="eyebrow">Your invite discount</span><span className="when green">locked in forever</span></div>
        <div className="inv-fees"><span className="h">Per fill</span><span className="h">Normal</span><span className="h">You</span>
          <span>Perped fee</span><s className="mono">{data.fees.normal}</s><b className="mono green">{data.fees.invited}</b>
          <span>On $100k a month</span><s className="mono">{per100k(data.fees.normalBps)}</s><b className="mono green">{per100k(data.fees.invitedBps)}</b></div>
      </section>
      <section className="inv-card">
        <div className="inv-perks">
          <div><i><Glyph n="bolt" /></i><div><b>Fade anyone in one tap</b><span>Same leverage, other side, straight into the fade.</span></div></div>
          <div><i><Glyph n="target" /></i><div><b>Practise free first</b><span>$10,000 of demo money at live prices. Go live when you&rsquo;re ready.</span></div></div>
          <div><i><Glyph n="bank" /></i><div><b>Your money stays yours</b><span>Trades fill on Hyperliquid from your own wallet.</span></div></div>
          <div><i><Glyph n="megaphone" /></i><div><b>Get paid to post trades</b><span>Earn {CREATOR_PCT}% of the fees when someone copies or fades your trades or trades your calls. Plus your own invite link, no limit.</span></div></div>
        </div>
        <button className="btn brand mt-4 w-full" style={{ padding: 15, fontSize: 16 }} onClick={accept} disabled={busy}>{busy ? "Applying…" : authenticated ? "Use this invite" : "Accept invite"}</button>
        {!authenticated && <button className="when mt-2 w-full text-center" onClick={() => startGuest().then(() => router.push("/")).catch(() => null)}>Try the demo first</button>}
        {msg && <p className="red mt-2 text-center text-[13px]">{msg}</p>}
        <div className="when mt-2 text-center">Code <b style={{ color: "var(--text)" }}>{data.code}</b> applied</div>
      </section>
    </main>
  );
}
