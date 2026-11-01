"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { timeAgo } from "@/lib/format";
import { Avatar, Badges } from "./ui";
import { RichText } from "./RichText";

type C = { comment: { id: number; body: string; parentId: number | null; createdAt: string }; author: { handle: string; avatarUrl: string | null; role?: string | null; founderSeat?: number | null; founderStatus?: string | null } };

/** Comments right under a card: the latest few, a reply box, and a link to the full thread. Posts appear instantly. */
export function InlineComments({ postId, onCount }: { postId: number; onCount?: (n: number) => void }) {
  const { authenticated, login, profile, authedFetch } = useSession();
  const { data, mutate } = useSWR<{ comments: C[] }>(`/api/posts/${postId}/comments`, { revalidateOnFocus: false });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const all = data?.comments ?? [];
  const latest = all.slice(-3);

  const send = async () => {
    if (!authenticated) return login();
    const body = draft.trim(); if (!body) return;
    setBusy(true); setErr(null);
    // Optimistic: show it now, swap for the real row when the server answers.
    const temp: C = { comment: { id: -Date.now(), body, parentId: null, createdAt: new Date().toISOString() }, author: { handle: profile?.handle ?? "you", avatarUrl: profile?.avatarUrl ?? null } };
    mutate({ comments: [...all, temp] }, { revalidate: false });
    onCount?.(all.length + 1);
    setDraft("");
    const r = await authedFetch(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error === "pick a handle first" ? "Finish setting up your profile to comment." : j.error ?? "Couldn't post"); mutate(); onCount?.(all.length); setDraft(body); }
    else mutate();
    setBusy(false);
  };

  return (
    <div className="icm" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      {latest.map((c) => (
        <div key={c.comment.id} className="icm-row" style={{ opacity: c.comment.id < 0 ? 0.6 : 1 }}>
          <Avatar handle={c.author.handle} url={c.author.avatarUrl} size={24} />
          <div className="min-w-0 flex-1 text-[13px]"><b>{c.author.handle}</b><Badges u={c.author} /> <span className="when">{timeAgo(c.comment.createdAt)}</span><RichText text={c.comment.body} className="m-0 leading-snug" /></div>
        </div>
      ))}
      {all.length > 3 && <Link href={`/post/${postId}`} className="when block py-1">See all {all.length} comments →</Link>}
      {data && all.length === 0 && <div className="when py-1">Be the first. Respect or roast.</div>}
      <form className="icm-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {profile && <Avatar handle={profile.handle} url={profile.avatarUrl} size={26} link={false} />}
        <input className="field" style={{ padding: "9px 12px", fontSize: 14 }} placeholder={authenticated ? "Say something…" : "Log in to comment"} value={draft} onChange={(e) => setDraft(e.target.value)} onFocus={() => { if (!authenticated) login(); }} enterKeyHint="send" maxLength={500} />
        <button type="submit" className="copy" disabled={busy || !draft.trim()}>Post</button>
      </form>
      {err && <p className="red text-xs">{err}</p>}
    </div>
  );
}
