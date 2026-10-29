# Perped — get perped

Social perps on Hyperliquid. Every trade is a post. Copy the best, roast the rest.

Mobile-first web app (installable PWA). Trades execute directly on Hyperliquid from the user's own embedded wallet with Perped's **builder code** attached, so the app earns a fee on every fill. Perped never holds funds.

## What's in the box (MVP)

| Area | Status |
|---|---|
| Login + silent embedded wallet (Privy: email / Google / X / wallet) | ✅ |
| Markets page: every perp with price, 24h change, volume, open interest, funding, sparkline | ✅ |
| Market page with price chart (1h/1d/1w) and live Perped long/short sentiment | ✅ |
| Market and limit orders (long/short, leverage, guardrails) | ✅ |
| Take-profit / stop-loss placed with the entry (Hyperliquid normalTpsl group) | ✅ |
| Builder-code fee attached to every order, one-time user approval flow | ✅ |
| Live feed: every trade is a post with running P&L from the Hyperliquid WebSocket | ✅ |
| Copy trade (one tap, pre-filled ticket, attribution tracked) | ✅ |
| Comments + reactions | ✅ |
| Profiles with verified on-chain stats and open positions, close from profile | ✅ |
| Leaderboard (7d / 30d / all) from real Hyperliquid fills, refreshed by cron | ✅ |
| Live rooms / audio / video streaming | ⏸ phase 2 |
| Tipping, public bets, follower alerts | ⏸ phase 2 |

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind 4 · Privy (`@privy-io/react-auth`, `@privy-io/server-auth`) · `@nktkas/hyperliquid` + viem for signing · Drizzle ORM + Postgres · SWR · Vercel (hosting + cron).

## Setup (≈20 minutes)

### 1. Accounts you need (all free tiers)

1. **Privy** — https://dashboard.privy.io → New app → copy **App ID** and **App secret**. In the app settings enable login methods Email, Google, Twitter, Wallet, and turn on *Embedded wallets → create on login for all users*. Add `http://localhost:3000` and your production domain to *Allowed origins*.
2. **Postgres** — Neon (https://neon.tech) or Supabase. Create a project, copy the connection string.
3. **Hyperliquid testnet wallet for the builder** — any EVM wallet you control. Fund it on testnet (faucet at https://app.hyperliquid-testnet.xyz/drip) with ≥ 100 USDC in the perps account. This address goes in `NEXT_PUBLIC_BUILDER_ADDRESS` and is where builder fees accrue (claim via the referral rewards page).
4. **Vercel** (later) — for hosting and the stats cron.

### 2. Install and run

```bash
cp .env.example .env.local   # fill in the values from step 1
npm install
npm run db:push              # creates the tables in your Postgres
npm run dev                  # http://localhost:3000
```

Open it on your phone via your computer's LAN IP (e.g. `http://192.168.1.20:3000`) to feel the real thing.

### 3. First trade on testnet

1. Log in → a wallet is created for you → pick a handle.
2. Fund that wallet with testnet USDC on Hyperliquid (profile page shows the address; use the testnet faucet, then deposit).
3. Trade tab → approve the builder fee once → long or short → it appears in the feed.
4. Open a second account in a private window and hit **Copy trade**.

### 4. Deploy

```bash
vercel          # or connect the repo on vercel.com
```
Set the same env vars in Vercel, plus `CRON_SECRET` (any random string). `vercel.json` already schedules `/api/cron/stats` every 15 minutes to refresh leaderboard stats from Hyperliquid fills.

## Env vars

See `.env.example`. Key ones:

- `NEXT_PUBLIC_HL_NETWORK` — `testnet` while building; flip to `mainnet` for launch.
- `NEXT_PUBLIC_BUILDER_ADDRESS` / `NEXT_PUBLIC_BUILDER_FEE_TENTHS_BPS` — your fee. 50 = 0.05%. Perps cap is 100 (0.1%). Lower converts better.
- `NEXT_PUBLIC_MAX_LEVERAGE` / `NEXT_PUBLIC_MAX_POSITION_USD` — beta guardrails.

## How the money flows

1. User approves `ApproveBuilderFee` once (max fee, revocable).
2. Every order the app sends includes `builder: { b: <your address>, f: <fee> }`.
3. Hyperliquid deducts the builder fee on the fill and credits your builder address.
4. You claim accumulated fees from the referral-rewards flow on Hyperliquid.

## Project layout

```
app/                 pages (feed, markets, market detail, trade, leaderboard, profile) + API routes
components/          TradeTicket, FeedPost, PriceChart, Sparkline, BuilderApproval, HandlePicker, Nav, Header
lib/config.ts        env → typed config (network, builder fee, guardrails)
lib/hl-info.ts       Hyperliquid read-only API (markets, candles, mids, state, fills) + stats summariser
lib/hl-exchange.ts   signed actions: market/limit order with TP/SL + builder code, close, approve fee
lib/schema.ts        Drizzle schema: users, posts, comments, reactions, follows, stats
lib/hooks/           useSession (Privy + viem), useMids (WebSocket), useMarkets
```

## Notes / known gaps

- Built against `@nktkas/hyperliquid` ^0.24. If `npm install` resolves a newer major and the `ExchangeClient` constructor or `order` signature changed, `lib/hl-exchange.ts` is the only file to touch.
- Posts are created client-side after the fill; a future hardening step verifies the `oid` against `userFills` server-side before posting.
- Deposits: users bridge USDC on Arbitrum → Hyperliquid themselves for now. An in-app on-ramp (MoonPay/Transak) is a phase-2 item.
- Legal: this is an unlicensed interface to a derivatives venue. Get advice before marketing to any specific jurisdiction, and keep the "not advice" copy.

## Roadmap

1. ✅ Base (this repo)
2. Live rooms (positions + chat, no video) → audio rooms → video with P&L overlay
3. Tipping, public bets settled on Hyperliquid prices, follower alerts
4. Native wrapper (Expo) for App Store / Play Store
