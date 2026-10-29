import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Privy + Hyperliquid SDK ship ESM; nothing special needed on Next 15.
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
