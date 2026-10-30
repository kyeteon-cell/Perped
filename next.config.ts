import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Privy + Hyperliquid SDK ship ESM; nothing special needed on Next 15.
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  // Lint runs in CI/dev; keep the production build on type errors only so copy with apostrophes doesn't block deploys.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
