import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Privy + Hyperliquid SDK ship ESM; nothing special needed on Next 15.
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  // Lint runs in CI/dev; keep the production build on type errors only so copy with apostrophes doesn't block deploys.
  eslint: { ignoreDuringBuilds: true },
  // Baked into the app at build time so an open app can tell when a newer version is live (components/UpdateCheck).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
};

export default nextConfig;
