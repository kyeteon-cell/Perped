"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SWRConfig } from "swr";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { HL_NETWORK } from "@/lib/config";

const chain = HL_NETWORK === "mainnet" ? arbitrum : arbitrumSepolia;

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
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
        appearance: { theme: "dark", accentColor: "#ffb020", logo: "/icon-192.png" },
        loginMethods: ["email", "google", "twitter", "wallet"],
        // Every user gets an embedded EVM wallet; that wallet is their Hyperliquid account.
        embeddedWallets: { ethereum: { createOnLogin: "all-users" }, showWalletUIs: false },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <SWRConfig value={{ fetcher: (url: string) => fetch(url).then((r) => r.json()), revalidateOnFocus: false }}>{children}</SWRConfig>
    </PrivyProvider>
  );
}
