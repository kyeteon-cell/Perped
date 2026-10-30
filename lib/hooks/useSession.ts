"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLinkAccount, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type WalletClient } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import useSWR from "swr";
import { HL_NETWORK } from "@/lib/config";
import type { User } from "@/lib/schema";
import { resolveFeeTier, type FeeInfo } from "@/lib/fees";

const chain = HL_NETWORK === "mainnet" ? arbitrum : arbitrumSepolia;

/** Everything a page needs about the logged-in user: wallet, viem client, profile, authed fetch. */
export function useSession() {
  const { ready: privyReady, authenticated: privyAuthed, logout: privyLogout, getAccessToken, user } = usePrivy();
  // Guest demo: a signed token in localStorage, no third-party login.
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestReady, setGuestReady] = useState(false);
  useEffect(() => { try { setGuestToken(localStorage.getItem("perped:guest")); } catch {} setGuestReady(true); }, []);
  const isGuest = !privyAuthed && !!guestToken;
  const authenticated = privyAuthed || isGuest;
  const ready = privyReady && guestReady;
  const startGuest = useCallback(async () => {
    const r = await fetch("/api/guest", { method: "POST" });
    const j = await r.json();
    if (!r.ok || !j.token) throw new Error(j.error ?? "Couldn't start demo");
    try { localStorage.setItem("perped:guest", j.token); } catch {}
    setGuestToken(j.token);
  }, []);
  const logout = useCallback(async () => {
    try { localStorage.removeItem("perped:guest"); } catch {}
    setGuestToken(null);
    if (privyAuthed) await privyLogout();
  }, [privyAuthed, privyLogout]);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { login: privyLogin } = useLogin({
    onComplete: () => setLoginError(null),
    onError: (err) => {
      const code = String(err);
      if (code === "exited_auth_flow") return; // user closed the modal
      const host = typeof window !== "undefined" ? window.location.origin : "";
      setLoginError(
        /origin|domain|allowed|unauthorized|forbidden/i.test(code)
          ? `Login blocked for ${host}. Add this URL to Allowed origins in the Privy dashboard (Settings → Domains).`
          : `Login failed: ${code}. Check the Privy dashboard: login methods enabled, and ${host} in Allowed origins.`,
      );
    },
  });
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

  const { data: me, mutate: refreshMe, isLoading: meLoading } = useSWR<{ profile: User | null; unread: number; fee?: FeeInfo; address?: string | null; guest?: boolean }>(
    (privyAuthed && address) || isGuest ? ["/api/me", address ?? guestToken] : null,
    async () => (await authedFetch("/api/me")).json(),
    { refreshInterval: 30_000 },
  );

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
    /** Open Privy's connect-wallet flow to add an external wallet to this account. */
    linkWallet,
    linkError,
    refreshMe,
  };
}
