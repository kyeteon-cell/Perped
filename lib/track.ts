"use client";

/** Fire-and-forget product event. `once` = at most once per device per day for that event. */
export function track(e: "visit" | "intro_done" | "push_on" | "quick_fade_open" | "first_battle_card" | "welcome_new" | "welcome_crypto" | "welcome_perps" | "first_trade_done" | "first_trade_skip" | "first_fade_done" | "first_fade_skip", opts: { once?: boolean; headers?: HeadersInit } = {}) {
  try {
    let anon = localStorage.getItem("perped:anon");
    if (!anon) { anon = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("perped:anon", anon); }
    if (opts.once) {
      const k = `perped:ev:${e}`, today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(k) === today) return;
      localStorage.setItem(k, today);
    }
    const g = localStorage.getItem("perped:guest");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (g) headers.authorization = `Guest ${g}`;
    fetch("/api/track", { method: "POST", headers: { ...headers, ...(opts.headers as Record<string, string> | undefined) }, body: JSON.stringify({ e, anon }), keepalive: true }).catch(() => {});
  } catch {}
}
