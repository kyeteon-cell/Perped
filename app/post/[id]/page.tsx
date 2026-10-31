"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { FeedPost } from "@/components/FeedPost";
import { RichText } from "@/components/RichText";
import { ShareSheet } from "@/components/ShareSheet";
import { Avatar, Icon, I, SkeletonList } from "@/components/ui";
import type { FeedRow } from "@/lib/feed";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";
import { timeAgo } from "@/lib/format";

type C = { comment: { id: number; body: string; createdAt: string; parentId: number | null; userId: string }; author: { handle: string; avatarUrl: string | null; verified: boolean } };

/** Thread: the post, its comments (with replies nested one level), a compose bar, and a Receipt for closed trades. */
export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { authedFetch, authenticated, login, profile } = useSession();
  const { mids } = useMids();
  const [autoQuick, setAutoQuick] = useState<"copy" | "fade" | null>(null);
  useEffect(() => { try { const q = new URLSearchParams(window.location.search); setAutoQuick(q.get("fade") === "1" ? "fade" : q.get("copy") === "1" ? "copy" : null); } catch {} }, []);
  const { data, mutate } = useSWR<{ post: FeedRow }>(`/api/posts/${id}`, async () => (await authedFetch(`/api/posts/${id}`)).json());
  const { data: cm, mutate: mutateC } = useSWR<{ comments: C[] }>(`/api/posts/${id}/comments`);
  const coin = data?.post?.post.coin;
  const { data: copiers } = useSWR<{ posts: FeedRow[] }>(coin ? `/api/posts?kind=trade&coin=${coin}&limit=50` : null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [receipt, setReceipt] = useState(() => { try { return new URLSearchParams(window.location.search).get("share") === "1"; } catch { return false; } });
  const [cErr, setCErr] = useState<string | null>(null);
  const post = data?.post;
  const copierHandles = new Set((copiers?.posts ?? []).filter((p) => p.post.copiedFromId === Number(id)).map((p) => p.author?.handle));
  const faderHandles = new Set((copiers?.posts ?? []).filter((p) => p.post.fadedFromId === Number(id)).map((p) => p.author?.handle));

  const send = async () => {
    if (!authenticated) return login();
    if (!draft.trim()) return;
    const body = draft.trim(), parentId = replyTo ?? undefined;
    const temp = { comment: { id: -Date.now(), body, parentId: parentId ?? null, createdAt: new Date().toISOString() }, author: { handle: profile?.handle ?? "you", avatarUrl: profile?.avatarUrl ?? null, verified: false } } as unknown as C;
    mutateC({ comments: [...(cm?.comments ?? []), temp] }, { revalidate: false });
    setDraft(""); setReplyTo(null); setCErr(null);
    const r = await authedFetch(`/api/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ body, parentId }) });
    if (r.ok) { mutateC(); mutate(); }
    else { const j = await r.json().catch(() => ({})); mutateC(); setDraft(body); setCErr(j.error === "pick a handle first" ? "Finish setting up your profile to comment." : j.error ?? "Couldn't post comment"); }
  };
  const roots = (cm?.comments ?? []).filter((c) => !c.comment.parentId);
  const children = (pid: number) => (cm?.comments ?? []).filter((c) => c.comment.parentId === pid);
  const Row = ({ c, reply }: { c: C; reply?: boolean }) => (
    <div className="hairline flex gap-3 px-5 py-3.5" style={{ paddingLeft: reply ? 52 : undefined, background: reply ? "var(--surface)" : undefined }}>
      <Avatar handle={c.author.handle} url={c.author.avatarUrl} size={32} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{c.author.handle}{c.author.verified && <span className="vbadge">✓</span>}{post?.author?.handle === c.author.handle && <span className="lbl done ml-1.5" style={{ padding: "1px 6px", fontSize: 10 }}>OP</span>}<span className="when"> · {timeAgo(c.comment.createdAt)}</span>{copierHandles.has(c.author.handle) && <span className="lbl long ml-1.5" style={{ padding: "1px 8px", fontSize: 10 }}><i />Copied</span>}{faderHandles.has(c.author.handle) && <span className="lbl short ml-1.5" style={{ padding: "1px 8px", fontSize: 10 }}><i />Faded</span>}</div>
        <RichText text={c.comment.body} className="mt-1 text-[15px] leading-relaxed" />
        {!reply && <div className="acts mt-1.5"><button onClick={() => setReplyTo(c.comment.id)}>Reply</button></div>}
      </div>
    </div>
  );

  return (
    <div data-tint="brand" className="fade-in pb-40">
      <header className="hairline flex items-center justify-between px-4 py-3"><Link href="/" className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link><div className="name">Thread</div>{post ? <button className="iconbtn" aria-label="Share" onClick={() => setReceipt(true)}><Icon d={I.share} /></button> : <span className="w-9" />}</header>
      {!post && <SkeletonList n={1} />}
      {post && <FeedPost item={post} full autoQuick={autoQuick} mid={post.post.coin ? mids[post.post.coin] : undefined} onChanged={() => mutate()} />}
      {roots.map((c) => (<div key={c.comment.id}>{Row({ c })}{children(c.comment.id).map((r) => <div key={r.comment.id}>{Row({ c: r, reply: true })}</div>)}</div>))}
      {cm && roots.length === 0 && <p className="muted p-5 text-sm">No comments yet. Respect or roast.</p>}
      <div style={{ bottom: "calc(88px + env(safe-area-inset-bottom, 0px))", background: "var(--bg)", borderColor: "var(--line)" }} className="fixed left-1/2 flex w-full max-w-md -translate-x-1/2 items-center gap-2.5 border-t px-4 py-2.5">
        {profile && <Avatar handle={profile.handle} url={profile.avatarUrl} size={32} />}
        <input className="field" placeholder={replyTo ? "Reply…" : "Add a comment"} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        {replyTo && <button className="chip" onClick={() => setReplyTo(null)}>×</button>}
        <button className="copy" onClick={send}>Send</button>
      </div>
      {cErr && <p style={{ bottom: "calc(144px + env(safe-area-inset-bottom, 0px))" }} className="red fixed left-1/2 w-full max-w-md -translate-x-1/2 px-5 text-xs">{cErr}</p>}
      {receipt && post && <ShareSheet item={post} mid={post.post.coin ? mids[post.post.coin] : undefined} onClose={() => setReceipt(false)} />}
    </div>
  );
}
