"use client";

import useSWR from "swr";
import { useSession } from "./useSession";

export type LiveStatus = {
  open: boolean;
  allowed: boolean;
  signedIn?: boolean;
  guest?: boolean;
  /** On the early-access list. */
  joined?: boolean;
  /** Already let in (invite, founder, waitlist release or staff): first in when real money opens. */
  early?: boolean;
  /** Place in line, when waiting. */
  place?: number | null;
};

/** Open the "Real money is coming soon" sheet from anywhere. */
export function openComingSoon() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("perped:coming-soon"));
}

/**
 * Real-money trading switch, as the browser sees it. `allowed` is false until the server says otherwise,
 * so nothing real-money ever flashes open while loading. Staff can always test real trades.
 */
export function useLive() {
  const { profile } = useSession();
  const { data, mutate } = useSWR<LiveStatus>("/api/live", { dedupingInterval: 30_000 });
  const open = !!data?.open;
  const staff = profile?.role === "admin" || profile?.role === "owner";
  const allowed = open || staff || !!profile?.isBot;
  /** Wrap a real-money action: runs it when allowed, otherwise shows the Coming soon sheet. */
  const gate = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => { if (allowed) fn(...a); else openComingSoon(); };
  return { open, allowed, loaded: !!data, status: data, refresh: mutate, gate };
}
