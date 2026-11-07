"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { onceToday, trackBody } from "@/lib/track";

/**
 * Links from a crew's Telegram group carry ?ref=owner&crew=slug on any page. Remember both; once the visitor
 * has a profile, join them to that crew (the join also credits the owner if they have no referral yet).
 */
export function RefCapture() {
  const path = usePathname();
  const { profile, authedFetch } = useSession();
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const ref = q.get("ref"), crew = q.get("crew");
      if (ref && /^[a-z0-9_]{3,20}$/i.test(ref) && !localStorage.getItem("perped:ref")) localStorage.setItem("perped:ref", ref.toLowerCase());
      if (crew && /^[a-z0-9-]{3,30}$/i.test(crew)) localStorage.setItem("perped:crew", crew.toLowerCase());
    } catch {}
  }, [path]);
  // Once a day per account per device: "this person was here today", tied to their account. Joins the
  // anonymous visit to the person (so the admin funnel can follow a visitor to a fader) and counts return days.
  const handle = profile?.handle;
  useEffect(() => {
    if (!handle) return;
    try { if (!onceToday(`signed_in:${handle}`)) return; } catch { return; }
    void authedFetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: trackBody("signed_in"), keepalive: true }).catch(() => null);
  }, [handle, authedFetch]);
  useEffect(() => {
    if (!profile || path.startsWith("/onboarding")) return;
    let slug: string | null = null;
    try { slug = localStorage.getItem("perped:crew"); } catch {}
    if (!slug) return;
    try { localStorage.removeItem("perped:crew"); } catch {}
    void authedFetch(`/api/crews/${encodeURIComponent(slug)}/join?auto=1`, { method: "POST" }).catch(() => null);
  }, [profile, path, authedFetch]);
  return null;
}
