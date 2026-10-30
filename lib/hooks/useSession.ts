"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type WalletClient } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import useSWR from "swr";
import { HL_NETWORK } from "@/lib/config";
import type { User } from "@/lib/schema";

const chain = HL_NETWORK === "mainnet" ? arbitrum : arbitrumSepolia;

/** Everything a page needs about the logged-in user: wallet, viem client, profile, authed fetch. */
export function useSession() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);

  // Prefer the Privy embedded wallet; fall back to the first connected external wallet.
  const wallet = useMemo(
    () => wallets.find((w) => w.walletClientType === "privy") ?? wallets[0] ?? null,
    [wallets],
  );
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
      const token = await getAccessToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      if (address) headers.set("x-wallet-address", address);
      if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      return fetch(input, { ...init, headers });
    },
    [getAccessToken, address],
  );

  const { data: me, mutate: refreshMe, isLoading: meLoading } = useSWR<{ profile: User | null; unread: number }>(
    authenticated && address ? ["/api/me", address] : null,
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
    address,
    walletClient,
    authedFetch,
    profile: me?.profile ?? null,
    profileLoading: meLoading,
    unread: me?.unread ?? 0,
    refreshMe,
  };
}
