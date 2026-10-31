"use client";

import { Glyph } from "./Glyph";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type { FeedRow } from "@/lib/feed";
import { useSession } from "@/lib/hooks/useSession";
import { track } from "@/lib/track";
import { QuickTrade } from "./QuickTrade";
import { Avatar, CoinMark, ticker } from "./ui";

/**
 * New here and no trades yet? One card: a live trade to fade, one tap into the quick fade sheet,
 * and you land in your first battle. Disappears once you've traded or dismissed it.
 */
export function FirstBattle({ rows }: { rows: FeedRow[] }) {
  const { authenticated, profile } = useSession();
  const { data: mine } = useSWR<{ posts: FeedRow[] }>(profile ? `/api/posts?handle=${profile.handle}&kind=trade&limit=1` : null);
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem("perped:first-battle") === "done"); } catch { setHidden(false); } }, []);
  const target = rows.find((r) => r.post.kind === "trade" && r.post.status === "open" && r.author && r.author.id !== profile?.id && r.author.allowFade !== false && !r.noFade && !r.post.fadedFromId);
  const show = authenticated && !!profile && !hidden && mine && mine.posts.length === 0 && !!target;
  useEffect(() => { if (show) track("first_battle_card", { once: true }); }, [show]);
  if (!show || !target) return null;
  const p = target.post, a = target.author!;
  const done = () => { setHidden(true); try { localStorage.setItem("perped:first-battle", "done"); } catch {} };
  const mySide = p.side === "long" ? "short" : "long";
  return (
    <div className="firstb">
      <div className="firstb-top"><span className="firstb-tag gl"><Glyph n="swords" />Your first battle</span><button className="when" onClick={done}>Not now</button></div>
      <div className="firstb-row">
        <Avatar handle={a.handle} url={a.avatarUrl} size={40} link={false} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold"><span className="truncate">{a.handle}</span> is <span className={p.side === "long" ? "green" : "red"}>{p.side === "long" ? "long" : "short"}</span> {ticker(p.coin!)} {p.leverage}×</div>
          <div className="when">Think they&rsquo;re wrong? Go <b className={mySide === "long" ? "green" : "red"}>{mySide}</b> with demo money and it&rsquo;s a battle.</div>
        </div>
        <CoinMark coin={p.coin!} size="sm" />
      </div>
      <button className="btn short mt-3" style={{ padding: 12, fontSize: 15 }} onClick={() => setOpen(true)}><span className="gl"><Glyph n="bolt" />Fade {a.handle}</span></button>
      {open && <QuickTrade item={target} mode="fade" onClose={() => { setOpen(false); done(); }} />}
    </div>
  );
}
