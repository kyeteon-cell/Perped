"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./useSession";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on" | "loading";

/** Phone alerts: state + turn on/off. On iPhone, web push only works once Perped is added to the Home Screen. */
export function usePush() {
  const { authedFetch, authenticated } = useSession();
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => null);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      setState(sub ? "on" : "off");
    })();
  }, []);

  const enable = useCallback(async () => {
    if (!authenticated) return false;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return false; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await fetch("/api/push").then((r) => r.json());
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
      const r = await authedFetch("/api/push", { method: "POST", body: JSON.stringify(sub.toJSON()) });
      setState(r.ok ? "on" : "off");
      return r.ok;
    } catch {
      setState("off");
      return false;
    } finally { setBusy(false); }
  }, [authedFetch, authenticated]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await authedFetch("/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null); await sub.unsubscribe(); }
      setState("off");
    } finally { setBusy(false); }
  }, [authedFetch]);

  return { state, busy, enable, disable };
}
