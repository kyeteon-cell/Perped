"use client";

import useSWR from "swr";
import Link from "next/link";
import { Header } from "@/components/Header";
import { FeedPost, type FeedItem } from "@/components/FeedPost";
import { HandlePicker } from "@/components/HandlePicker";
import { useSession } from "@/lib/hooks/useSession";
import { useMids } from "@/lib/hooks/useMids";

export default function FeedPage() {
  const { authenticated, address, profile, profileLoading } = useSession();
  const { mids, connected } = useMids();
  const { data, mutate, isLoading } = useSWR<{ posts: FeedItem[] }>("/api/posts", { refreshInterval: 15_000 });
  const posts = data?.posts ?? [];

  return (
    <>
      <Header right={<span className="muted text-xs">{connected ? "● live" : "○ connecting"}</span>} />

      {authenticated && address && !profileLoading && !profile && <div className="mb-4"><HandlePicker /></div>}

      {isLoading && <p className="muted text-sm">Loading the feed…</p>}

      {!isLoading && posts.length === 0 && (
        <div className="panel p-6 text-center">
          <p className="text-lg font-bold">Nobody&apos;s perped yet.</p>
          <p className="muted mt-1 text-sm">Open the first position and it shows up here for everyone to copy, cheer or roast.</p>
          <Link href="/trade" className="btn btn-accent mt-4">Place the first trade</Link>
        </div>
      )}

      <div className="space-y-3">
        {posts.map((item) => (
          <FeedPost key={item.post.id} item={item} mid={mids[item.post.coin]} onChanged={() => mutate()} />
        ))}
      </div>
    </>
  );
}
