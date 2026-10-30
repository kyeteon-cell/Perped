"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { FeedRow } from "@/lib/feed";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { fmtPct, fmtPrice, pnlForPosition } from "@/lib/format";
import { Avatar, CoinMark, ticker, SkeletonList } from "@/components/ui";
import { isDemoPost } from "@/components/FeedPost";

/**
 * /c/:postId?ref=handle — the challenge link. A friend lands here, sees the position (or call), and takes
 * the other side in one tap: a guest demo account is made on the spot, the referral is tied to the sender,
 * and they're dropped straight into the opposite trade (or the opposite one-hour call).
 */
export default function ChallengePage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { authenticated, startGuest, refreshMe, authedFetch, profile } = useSession();
  const { mids } = useMids();
  const { data } = useSWR<{ post: FeedRow }>(`/api/posts/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = sp.get("ref")?.toLowerCase() ?? null;
  // Remember who sent the link so sign-up (guest or wallet) credits them.
  useEffect(() => { try { if (ref) localStorage.setItem("perped:ref", ref); } catch {} }, [ref]);

  if (!data) return <SkeletonList n={1} />;
  const { post, author } = data.post;
  const handle = author?.handle ?? "someone";
  const mid = post.coin ? mids[post.coin] : undefined;
  const isTrade = post.kind === "trade", isCall = post.kind === "call";
  const open = post.status === "open" && (!isCall || post.callStatus === "open");
  const side = post.side ?? "long", other = side === "long" ? "short" : "long";
  const entry = Number(post.entryPx || (post.meta as { fromPx?: number } | null)?.fromPx || post.targetPx || 0);
  const live = mid && entry ? (isTrade ? pnlForPosition(side, entry, mid, Number(post.size)).pct * (post.leverage ?? 1) : ((mid - entry) / entry) * 100 * (side === "long" ? 1 : -1)) : 0;
  const mine = profile && author && profile.id === author.id;

  const ensureAccount = async () => { if (!authenticated) { await startGuest(); await refreshMe(); } };
  const fade = async () => { setBusy("fade"); setErr(null); try { await ensureAccount(); router.push(`/trade?fade=${post.id}`); } catch (e) { setErr(String(e instanceof Error ? e.message : e)); setBusy(null); } };
  const copy = async () => { setBusy("copy"); setErr(null); try { await ensureAccount(); router.push(`/trade?copy=${post.id}`); } catch (e) { setErr(String(e instanceof Error ? e.message : e)); setBusy(null); } };
  const call = async (s: "long" | "short") => {
    setBusy(s); setErr(null);
    try {
      await ensureAccount();
      const r = await authedFetch("/api/quick", { method: "POST", body: JSON.stringify({ coin: post.coin, side: s }) });
      const j = await r.json();
      if (!r.ok && r.status !== 409) throw new Error(j.error ?? "Couldn't lock it in");
      router.push("/");
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); setBusy(null); }
  };

  return (
    <main className="px-5 pb-10 pt-8">
      <div className="hero photo" style={{ backgroundImage: "url(/api/share-bg/hero-fightnight)", margin: 0 }}>
        <div className="k">You&rsquo;ve been challenged</div>
        <div className="mt-3 flex items-center gap-3">
          <Avatar handle={handle} url={author?.avatarUrl} size={48} />
          <div>
            <div className="text-lg font-extrabold">{handle}{isDemoPost(data.post) && <span className="demo-tag ml-1.5">Demo</span>}</div>
            <div className="text-[13px] opacity-90">{isTrade ? `is ${side} ${ticker(post.coin!)} ${post.leverage}× from ${fmtPrice(entry)}` : isCall ? `says ${ticker(post.coin!)} goes ${side === "long" ? "higher" : "lower"} from ${fmtPrice(entry)}` : "posted this"}</div>
          </div>
        </div>
        {(isTrade || isCall) && (
          <div className="mt-4 flex items-end justify-between">
            <div className="flex items-center gap-2"><CoinMark coin={post.coin!} /><span className="text-2xl font-extrabold">{ticker(post.coin!, true)}</span></div>
            <div className="text-right"><div className={`mono text-2xl font-bold ${live >= 0 ? "green" : "red"}`}>{fmtPct(live, 1)}</div><div className="text-[11px] opacity-85">{open ? "right now" : "final"}</div></div>
          </div>
        )}
      </div>

      {!open && <p className="muted mt-5 text-center text-sm">This one&rsquo;s already settled. Open the app and find them on the leaderboard.</p>}
      {open && mine && <p className="muted mt-5 text-center text-sm">That&rsquo;s your own position — send this link to someone who thinks you&rsquo;re wrong.</p>}

      {open && !mine && isTrade && (
        <div className="mt-5 flex flex-col gap-2.5">
          <button className={`btn ${other}`} disabled={!!busy} onClick={fade}>{busy === "fade" ? "Setting you up…" : `Think they're wrong? Go ${other} · fade ${handle}`}</button>
          <button className="btn" disabled={!!busy} onClick={copy}>{busy === "copy" ? "Setting you up…" : `Agree? Copy the trade`}</button>
        </div>
      )}
      {open && !mine && isCall && (
        <div className="mt-5 flex flex-col gap-2.5">
          <button className={`btn ${other}`} disabled={!!busy} onClick={() => call(other)}>{busy === other ? "Locking in…" : `Think they're wrong? ${other === "long" ? "Higher" : "Lower"} in an hour`}</button>
          <button className="btn" disabled={!!busy} onClick={() => call(side)}>{busy === side ? "Locking in…" : `Agree · ${side === "long" ? "Higher" : "Lower"}`}</button>
        </div>
      )}
      {err && <p className="red mt-3 text-center text-xs">{err}</p>}

      <div className="card mt-6" style={{ padding: 16 }}>
        <div className="eyebrow">How this works</div>
        <ul className="muted mt-2 flex flex-col gap-1.5 text-[13px]">
          <li>• One tap gives you a <b>demo account with $10,000</b> of practice money at real Hyperliquid prices. No email, no wallet.</li>
          <li>• Your result is public: win and it shows on {handle}&rsquo;s post. Lose and, well, you got perped.</li>
          <li>• Want to trade real money later? Connect a wallet in Settings. {ref ? `Joining through ${ref}'s link gets you reduced fees.` : ""}</li>
        </ul>
        <Link href="/how-it-works" className="chip mt-3 inline-flex">Where your money is &amp; how fees work →</Link>
      </div>
      <p className="faint mt-4 text-center text-[11px]">Perped · PvP perps on Hyperliquid · <Link href="/">open the app</Link></p>
    </main>
  );
}
