"use client";

import useSWR, { useSWRConfig } from "swr";
import { useSession } from "@/lib/hooks/useSession";

/** Who the viewer follows, cached once and shared by every Follow button on the page. */
export function useFollowing() {
  const { authenticated, authedFetch, profile } = useSession();
  const key = authenticated && profile ? "/api/follows?me=1" : null;
  const { data, mutate } = useSWR<{ handles: string[] }>(key, async () => (await authedFetch("/api/follows?me=1")).json(), { dedupingInterval: 30_000, revalidateOnFocus: false });
  return { set: new Set(data?.handles ?? []), loaded: !!data, mutate, key };
}

/**
 * One Follow button for the whole app. Flips instantly (optimistic), reverts if the server says no,
 * and every other button for the same handle updates at the same time because they share the cache.
 */
export function FollowButton({ handle, compact = false, className = "" }: { handle: string; compact?: boolean; className?: string }) {
  const { authenticated, profile, authedFetch, login } = useSession();
  const { set, mutate, key } = useFollowing();
  const { mutate: globalMutate } = useSWRConfig();
  if (profile?.handle === handle) return null;
  const on = set.has(handle);
  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!authenticated) return login();
    const next = on ? [...set].filter((h) => h !== handle) : [...set, handle];
    if (key) mutate({ handles: next }, { revalidate: false });
    try { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8); } catch {}
    const r = await authedFetch("/api/follows", { method: "POST", body: JSON.stringify({ handle }) });
    if (!r.ok) { if (key) mutate(); return; }
    const j = await r.json();
    if (key) mutate({ handles: j.following ? [...new Set([...set, handle])] : [...set].filter((h) => h !== handle) }, { revalidate: false });
    globalMutate((k) => typeof k === "string" && k.startsWith("/api/profile/"), undefined, { revalidate: true });
  };
  if (compact) return <button type="button" className={`fbtn ${on ? "on" : ""} ${className}`} onClick={toggle} aria-pressed={on}>{on ? "Following" : "Follow"}</button>;
  return <button type="button" className={`btn ${on ? "" : "brand"} ${className}`} style={{ padding: 12, fontSize: 14 }} onClick={toggle} aria-pressed={on}>{on ? "Following" : "Follow"}</button>;
}
