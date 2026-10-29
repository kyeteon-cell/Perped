"use client";

import Link from "next/link";
import { useState } from "react";
import type { Post } from "@/lib/schema";
import { fmtUsd, fmtPct, pnlForPosition, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/hooks/useSession";

const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

export type FeedItem = {
  post: Post;
  author: { id: string; handle: string; address: string; avatarUrl: string | null };
  commentCount: number;
  reactionCount: number;
  copyCount: number;
};


export function FeedPost({ item, mid, onChanged }: { item: FeedItem; mid?: number; onChanged?: () => void }) {
  const { post, author } = item;
  const { authenticated, authedFetch, login } = useSession();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<{ comment: { id: number; body: string; createdAt: string }; author: { handle: string } }[] | null>(null);
  const [draft, setDraft] = useState("");
  const [reacted, setReacted] = useState(0);

  const entry = Number(post.entryPx);
  const size = Number(post.size);
  const isOpen = post.status === "open";
  const markPx = isOpen ? (mid ?? entry) : Number(post.exitPx ?? entry);
  const { pnl, pct } = pnlForPosition(post.side, entry, markPx, size);
  const roi = pct * post.leverage;
  const pos = pnl >= 0;

  const loadComments = async () => {
    setOpen((o) => !o);
    if (comments) return;
    const r = await fetch(`/api/posts/${post.id}/comments`);
    const j = await r.json();
    setComments(j.comments ?? []);
  };

  const sendComment = async () => {
    if (!authenticated) return login();
    if (!draft.trim()) return;
    const r = await authedFetch(`/api/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify({ body: draft }) });
    const j = await r.json();
    if (r.ok) {
      setComments((c) => [...(c ?? []), j.comment]);
      setDraft("");
      onChanged?.();
    }
  };

  const react = async (kind: "fire" | "skull" | "ape") => {
    if (!authenticated) return login();
    const r = await authedFetch(`/api/posts/${post.id}/react`, { method: "POST", body: JSON.stringify({ kind }) });
    const j = await r.json();
    if (r.ok) setReacted((n) => n + (j.reacted ? 1 : -1));
  };

  return (
    <article className="panel p-4">
      <header className="mb-3 flex items-center justify-between">
        <Link href={`/u/${author.handle}`} className="flex items-center gap-2">
          <div className="muted grid size-9 place-items-center rounded-full text-xs font-semibold" style={{ background: "var(--panel-2)" }}>
            {author.handle.slice(0, 2).toUpperCase()}
          </div>
          <div className="leading-tight">
            <div className="font-semibold">{author.handle}</div>
            <div className="muted text-xs">{timeAgo(post.createdAt)} ago{post.copiedFromId ? " · copied" : ""}{!isOpen ? " · closed" : ""}</div>
          </div>
        </Link>
        <span className={`pill ${isOpen ? (post.side === "long" ? "pill-long" : "pill-short") : "muted"}`}>{post.side === "long" ? "Long" : "Short"} · {post.leverage}×</span>
      </header>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-bold tracking-tight">{post.coin}</div>
          <div className="muted mono mt-0.5 text-xs">
            {fmtUsd(Number(post.notionalUsd), { compact: true })} · entry {entry.toLocaleString("en-US", { maximumFractionDigits: 6 })}
            {!isOpen && post.exitPx ? ` → ${Number(post.exitPx).toLocaleString("en-US", { maximumFractionDigits: 6 })}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-mono text-xl font-semibold ${pos ? "green" : "red"}`}>{fmtPct(roi, 1)}</div>
          <div className={`font-mono text-[13px] ${pos ? "green" : "red"}`}>{fmtUsd(pnl, { sign: true })}{isOpen ? "" : " realised"}</div>
        </div>
      </div>

      {/* P&L bar */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--panel-2)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.abs(roi))}%`, background: pos ? "var(--green)" : "var(--red)" }} />
      </div>

      {post.caption && <p className="mt-3 text-sm">{post.caption}</p>}

      <footer className="muted mt-3 flex items-center gap-4 text-xs">
        <button onClick={() => react("fire")} className="flex items-center gap-1"><Ico d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />{item.reactionCount + reacted}</button>
        <button onClick={loadComments} className="flex items-center gap-1"><Ico d="M4 5h16v11H9l-5 4z" />{comments ? comments.length : item.commentCount}</button>
        <span className="flex items-center gap-1"><Ico d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M5 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" />{item.copyCount} copied</span>
        {isOpen && (
          <Link
            href={`/trade?coin=${post.coin}&side=${post.side}&lev=${post.leverage}&copy=${post.id}&from=${author.handle}`}
            className="btn btn-accent ml-auto !rounded-lg !px-3 !py-1.5 text-xs"
          >
            Copy trade
          </Link>
        )}
      </footer>

      {open && (
        <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          {comments === null && <p className="muted text-xs">Loading…</p>}
          {comments?.length === 0 && <p className="muted text-xs">No comments yet. Be the first to roast or respect.</p>}
          {comments?.map((c) => (
            <div key={c.comment.id} className="text-sm">
              <span className="font-semibold">@{c.author.handle}</span> <span className="muted text-xs">{timeAgo(c.comment.createdAt)}</span>
              <div>{c.comment.body}</div>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input" placeholder="Say something…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendComment()} />
            <button onClick={sendComment} className="btn btn-ghost !px-3">Send</button>
          </div>
        </div>
      )}
    </article>
  );
}
