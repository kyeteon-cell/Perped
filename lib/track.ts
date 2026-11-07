"use client";

export type TrackEvent =
  | "visit" | "signed_in" | "intro_done" | "push_on" | "quick_fade_open" | "first_battle_card"
  | "welcome_new" | "welcome_crypto" | "welcome_perps" | "first_trade_done" | "first_trade_skip" | "first_fade_done" | "first_fade_skip";

/** This device's anonymous id (created on first use). */
export function anonId(): string {
  let anon = localStorage.getItem("perped:anon");
  if (!anon) { anon = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("perped:anon", anon); }
  return anon;
}

/**
 * Where this device first came from, worked out once and kept: a utm_source, a challenge or invite link,
 * the site that sent them (X, Telegram, Google…), or "direct". First touch wins so a later direct visit
 * doesn't wipe out the X post that brought them.
 */
export function firstTouch(): string {
  const saved = localStorage.getItem("perped:src");
  if (saved) return saved;
  let src = "direct";
  try {
    const u = new URL(window.location.href);
    const utm = u.searchParams.get("utm_source");
    const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
    if (utm) src = utm;
    else if (u.pathname.startsWith("/c/")) src = "challenge";
    else if (u.pathname.startsWith("/i/") || u.pathname.startsWith("/invite") || u.searchParams.get("ref")) src = "invite";
    else if (/(^|\.)(t\.co|x\.com|twitter\.com)$/.test(host)) src = "x";
    else if (/(^|\.)(t\.me|telegram\.org|web\.telegram\.org)$/.test(host)) src = "telegram";
    else if (/(^|\.)google\./.test(host)) src = "google";
    else if (host && host !== u.hostname.replace(/^www\./, "")) src = host;
  } catch {}
  src = src.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40) || "direct";
  localStorage.setItem("perped:src", src);
  return src;
}

/** True the first time this key is seen today on this device. */
export function onceToday(key: string): boolean {
  const k = `perped:ev:${key}`, today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(k) === today) return false;
  localStorage.setItem(k, today);
  return true;
}

export function trackBody(e: TrackEvent) {
  return JSON.stringify({ e, anon: anonId(), src: firstTouch() });
}

/** Fire-and-forget product event. `once` = at most once per device per day for that event. */
export function track(e: TrackEvent, opts: { once?: boolean; headers?: HeadersInit } = {}) {
  try {
    if (opts.once && !onceToday(e)) return;
    const g = localStorage.getItem("perped:guest");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (g) headers.authorization = `Guest ${g}`;
    fetch("/api/track", { method: "POST", headers: { ...headers, ...(opts.headers as Record<string, string> | undefined) }, body: trackBody(e), keepalive: true }).catch(() => {});
  } catch {}
}
