"use client";

import { SignInSheet } from "@/components/SignInSheet";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback } from "react";
import { SWRConfig } from "swr";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { HL_NETWORK } from "@/lib/config";

const chain = HL_NETWORK === "mainnet" ? arbitrum : arbitrumSepolia;

export function Providers({ children }: { children: React.ReactNode }) {
  // The Privy App ID is public (it ships to every browser), so a baked-in fallback keeps preview
  // deployments that lack env vars working. Override with NEXT_PUBLIC_PRIVY_APP_ID.
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cmvuadbdq07k40fl8a3hq3c3z";
  if (!appId) {
    return (
      <div className="p-6 text-sm">
        <p className="font-semibold">Missing NEXT_PUBLIC_PRIVY_APP_ID</p>
        <p className="muted mt-2">Create an app at dashboard.privy.io, copy the App ID into .env.local and restart.</p>
      </div>
    );
  }
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: "light", accentColor: "#ff5a36", logo: "/icon-192.png" },
        loginMethods: ["twitter", "google", "email", "wallet"],
        // Every user gets an embedded EVM wallet; that wallet is their Hyperliquid account.
        embeddedWallets: { ethereum: { createOnLogin: "all-users" }, showWalletUIs: false },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <AuthedSWR>{children}<SignInSheet /></AuthedSWR>
    </PrivyProvider>
  );
}

/** Global SWR fetcher that carries the user's Privy token (or guest token), so every useSWR call sees the logged-in view. */
function AuthedSWR({ children }: { children: React.ReactNode }) {
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const fetcher = useCallback(async (url: string) => {
    const headers = new Headers();
    if (authenticated) {
      const token = await getAccessToken().catch(() => null);
      if (token) headers.set("authorization", `Bearer ${token}`);
      const w = wallets.find((x) => x.walletClientType !== "privy") ?? wallets.find((x) => x.walletClientType === "privy") ?? wallets[0];
      if (w?.address) headers.set("x-wallet-address", w.address.toLowerCase());
    } else {
      try { const g = localStorage.getItem("perped:guest"); if (g) headers.set("authorization", `Guest ${g}`); } catch {}
    }
    return fetch(url, { headers }).then((r) => r.json());
  }, [authenticated, getAccessToken, wallets]);
  return <SWRConfig value={{ fetcher, revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 4000, errorRetryCount: 2 }}>{children}</SWRConfig>;
}
