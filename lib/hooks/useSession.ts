"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLinkAccount, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type WalletClient } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import useSWR, { mutate as mutateGlobal } from "swr";
import { HL_NETWORK } from "@/lib/config";
import type { User } from "@/lib/schema";
import { resolveFeeTier, type FeeInfo } from "@/lib/fees";

const chain = HL_NETWORK === "mainnet" ? arbitrum : arbitrumSepolia;

/** Everything a page needs about the logged-in user: wallet, viem client, profile, authed fetch. */
function useSessionState() {
  const { ready: privyReady, authenticated: privyAuthed, logout: privyLogout, getAccessToken, user } = usePrivy();
  // Guest demo: a signed token in localStorage, no third-party login.
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestReady, setGuestReady] = useState(false);
  useEffect(() => { try { setGuestToken(localStorage.getItem("perped:guest")); } catch {} setGuestReady(true); }, []);
  // A guest is signed in if the browser still has the token, or if the server recognises the guest cookie.
  const { data: cookieMe } = useSWR<{ profile: User | null; guest?: boolean; address?: string | null; guestKey?: string }>(
    guestReady && privyReady && !privyAuthed && !guestToken ? "/api/me?via=cookie" : null,
    async () => (await fetch("/api/me")).json(),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const cookieGuest = !!cookieMe?.guest && !!cookieMe?.profile;
  // Signed in by cookie only (the browser lost its saved key): take the key back, so Settings can show it and Link X works.
  useEffect(() => {
    if (!cookieMe?.guestKey || guestToken) return;
    try { localStorage.setItem("perped:guest", cookieMe.guestKey); localStorage.setItem("perped:guest-prev", cookieMe.guestKey); } catch {}
    setGuestToken(cookieMe.guestKey);
  }, [cookieMe?.guestKey, guestToken]);
  const isGuest = !privyAuthed && (!!guestToken || cookieGuest);
  const authenticated = privyAuthed || isGuest;
  const ready = privyReady && guestReady;
  const startGuest = useCallback(async () => {
    let ref: string | null = null;
    try { ref = localStorage.getItem("perped:ref"); } catch {}
    const r = await fetch("/api/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref }) });
    const j = await r.json();
    if (!r.ok || !j.token) throw new Error(j.error ?? "Couldn't start demo");
    try { localStorage.setItem("perped:guest", j.token); localStorage.setItem("perped:guest-prev", j.token); if (j.profile?.handle) localStorage.setItem("perped:guest-prev-handle", j.profile.handle); } catch {}
    setGuestToken(j.token);
  }, []);
  /** Restore a guest account from its key (pasted, or the one saved on this device before logging out). */
  const restoreGuest = useCallback(async (token: string) => {
    const r = await fetch("/api/guest", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    const j = await r.json();
    if (!r.ok || !j.token) throw new Error(j.error ?? "Couldn't restore that account");
    try { localStorage.setItem("perped:guest", j.token); localStorage.setItem("perped:guest-prev", j.token); if (j.profile?.handle) localStorage.setItem("perped:guest-prev-handle", j.profile.handle); } catch {}
    setGuestToken(j.token);
    return j.profile as User;
  }, []);
  const logout = useCallback(async () => {
    // Guests: keep a copy of the key on this device so "Continue as …" can bring them straight back.
    try { const t = localStorage.getItem("perped:guest"); if (t) localStorage.setItem("perped:guest-prev", t); localStorage.removeItem("perped:guest"); localStorage.removeItem("perped:me"); } catch {}
    // Clear the guest cookie BEFORE dropping the token: otherwise the cookie check re-signs you in straight away
    // and the button looks like it did nothing.
    await fetch("/api/guest", { method: "DELETE" }).catch(() => null);
    if (privyAuthed) await privyLogout().catch(() => null);
    setGuestToken(null);
    // Fresh page so no cached profile is left on screen.
    if (typeof window !== "undefined") window.location.assign("/");
  }, [privyAuthed, privyLogout]);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [linkXState, setLinkXState] = useState<{ busy: boolean; error: string | null; done: string | null }>({ busy: false, error: null, done: null });
  const { login: privyLogin } = useLogin({
    onComplete: () => setLoginError(null),
    onError: (err) => {
      const code = String(err);
      setLinkXState((x) => (x.busy ? { ...x, busy: false } : x));
      try { sessionStorage.removeItem("perped:link-x"); } catch {}
      if (code === "exited_auth_flow") return; // user closed the modal
      const host = typeof window !== "undefined" ? window.location.origin : "";
      setLoginError(
        /origin|domain|allowed|unauthorized|forbidden/i.test(code)
          ? `Login blocked for ${host}. Add this URL to Allowed origins in the Privy dashboard (Settings → Domains).`
          : `Login failed: ${code}. Check the Privy dashboard: login methods enabled, and ${host} in Allowed origins.`,
      );
    },
  });
  /** Open Privy. Pass { loginMethods: ["wallet"] } etc. to show a single method. Accepts anything so it works as an onClick handler. */
  const login = useCallback((opts?: unknown) => {
    const o = opts && typeof opts === "object" && "loginMethods" in (opts as Record<string, unknown>) ? (opts as Record<string, unknown>) : undefined;
    // No method chosen → Perped's own sign-in sheet (Demo vs Real, with Guest). A method → straight into Privy on that method.
    if (!o) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("perped:login")); return; }
    return privyLogin(o as Parameters<typeof privyLogin>[0]);
  }, [privyLogin]);
  // Attach an X login to the guest account: remember the guest key, sign in with X, then link the two server-side.
  const linkX = useCallback(() => {
    let t: string | null = null;
    try { t = localStorage.getItem("perped:guest"); } catch {}
    if (!t) { setLinkXState({ busy: false, error: "We couldn't find this account's guest key on this device. Open Settings and copy your key first.", done: null }); return; }
    try { sessionStorage.setItem("perped:link-x", t); } catch {}
    setLinkXState({ busy: true, error: null, done: null });
    privyLogin({ loginMethods: ["twitter"] } as Parameters<typeof privyLogin>[0]);
  }, [privyLogin]);
  useEffect(() => {
    if (!privyAuthed) return;
    let t: string | null = null;
    try { t = sessionStorage.getItem("perped:link-x"); } catch {}
    if (!t) return;
    setLinkXState({ busy: true, error: null, done: null });
    (async () => {
      const token = await getAccessToken().catch(() => null);
      const r = await fetch("/api/me/link-x", { method: "POST", headers: { authorization: `Bearer ${token ?? ""}`, "x-guest-token": t! } }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : { error: "network error" };
      try { sessionStorage.removeItem("perped:link-x"); } catch {}
      if (!r?.ok) {
        setLinkXState({ busy: false, error: j.error ?? "Couldn't link X", done: null });
        await privyLogout().catch(() => null); // back to the guest account
        return;
      }
      setLinkXState({ busy: false, error: null, done: `@${j.x} now signs you in as @${j.handle}${j.replaced ? `. The separate @${j.replaced} profile that X login made is no longer used.` : "."}` });
      await mutateGlobal((k) => (Array.isArray(k) ? k[0] === "/api/me" : k === "/api/me"));
    })();
  }, [privyAuthed, getAccessToken, privyLogout]);

  const { wallets } = useWallets();
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);

  // A wallet the user connected themselves (MetaMask, Rabby, WalletConnect…) is their real trading account.
  // X-only signups have just the Privy embedded wallet and stay in demo until they connect one.
  const externalWallet = useMemo(() => wallets.find((w) => w.walletClientType !== "privy") ?? null, [wallets]);
  const wallet = useMemo(() => externalWallet ?? wallets.find((w) => w.walletClientType === "privy") ?? wallets[0] ?? null, [externalWallet, wallets]);
  const hasExternalWallet = !!externalWallet;
  const [linkError, setLinkError] = useState<string | null>(null);
  const { linkWallet } = useLinkAccount({ onError: (err) => { if (String(err) !== "exited_link_flow") setLinkError(`Couldn't connect wallet: ${String(err)}`); }, onSuccess: () => setLinkError(null) });
  const address = (wallet?.address?.toLowerCase() ?? null) as `0x${string}` | null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!wallet) return setWalletClient(null);
      const provider = await wallet.getEthereumProvider();
      if (cancelled) return;
      setWalletClient(createWalletClient({ account: wallet.address as `0x${string}`, chain, transport: custom(provider) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  /** fetch() with the Privy token + wallet address attached, for our own API routes. */
  const authedFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (privyAuthed) {
        const token = await getAccessToken();
        if (token) headers.set("authorization", `Bearer ${token}`);
        if (address) headers.set("x-wallet-address", address);
      } else if (guestToken) {
        headers.set("authorization", `Guest ${guestToken}`);
      }
      if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      return fetch(input, { ...init, headers });
    },
    [getAccessToken, address, privyAuthed, guestToken],
  );

  // Instant start: show the last profile this device saw while the fresh one loads. Don't wait for the wallet either:
  // the server knows who you are from the login token alone, so the profile loads in parallel with the wallet.
  type MeRes = { profile: User | null; unread: number; fee?: FeeInfo; address?: string | null; guest?: boolean };
  const [meCached, setMeCached] = useState<MeRes | undefined>(undefined);
  useEffect(() => { try { const j = localStorage.getItem("perped:me"); if (j) setMeCached(JSON.parse(j)); } catch {} }, []);
  const { data: me, mutate: refreshMe, isLoading: meLoading } = useSWR<MeRes>(
    privyAuthed || isGuest ? ["/api/me", address ?? guestToken ?? "pending"] : null,
    async () => (await authedFetch("/api/me")).json(),
    { refreshInterval: 30_000, fallbackData: privyAuthed || isGuest ? meCached : undefined },
  );
  useEffect(() => { if (me?.profile) try { localStorage.setItem("perped:me", JSON.stringify({ profile: me.profile, unread: me.unread, fee: me.fee, guest: me.guest })); } catch {} }, [me]);

  return {
    ready,
    authenticated,
    login,
    logout,
    user,
    wallet,
    /** Wallet address; for guests, the server-assigned demo placeholder. */
    address: address ?? (isGuest ? (me?.address as `0x${string}` | undefined) ?? null : null),
    walletClient,
    isGuest,
    /** Start a no-login demo account. */
    startGuest,
    /** Restore a guest account from its key. */
    restoreGuest,
    /** The guest key for this device's account (for the person to save). */
    guestToken,
    authedFetch,
    profile: me?.profile ?? null,
    profileLoading: meLoading,
    unread: me?.unread ?? 0,
    /** The builder fee this user pays per fill (tier-resolved server-side). */
    fee: me?.fee ?? resolveFeeTier({}),
    /** Why the last login attempt failed, in words the person can act on. */
    loginError,
    /** True once the user has connected their own wallet (required for real-money trading). */
    hasExternalWallet,
    /** Guests: attach an X login so this account can be signed into with X anywhere. */
    linkX,
    linkXState,
    /** Open Privy's connect-wallet flow to add an external wallet to this account. */
    linkWallet,
    linkError,
    refreshMe,
  };
}

type Session = ReturnType<typeof useSessionState>;
const SessionCtx = createContext<Session | null>(null);

/** One session for the whole app: guest sign-in, profile and wallet client are shared by every component. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const s = useSessionState();
  return createElement(SessionCtx.Provider, { value: s }, children);
}

/** Everything a page needs about the logged-in user: wallet, viem client, profile, authed fetch. */
export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error("useSession must be used inside <SessionProvider>");
  return s;
}
