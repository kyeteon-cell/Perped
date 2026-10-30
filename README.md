# Perped — get perped

Social perps on Hyperliquid. Every trade is a post. Copy the best, fade the rest.

Mobile-first web app (installable PWA). Trades execute directly on Hyperliquid from the user's own embedded wallet with Perped's **builder code** attached, so the app earns a fee on every fill. Perped never holds funds.

## What's in v0.3

**Shell** — live price ticker on every page (Hyperliquid WebSocket), bottom nav, Day / Night / Auto theme with a different brand colour per theme (coral by day, mint-teal by night), per-page colour tints, semantic button colours.

**Home** — For you / Following / Live tabs, hero card (balance, 7-day PnL, open count, streak, Trade / Deposit / Post), feed of every post type with live P&L that flashes on ticks, tap P&L to cycle % / $ / ROI, like and dislike, Copy and Fade on every live trade, copied-vs-faded camps (hidden below 3 participants), "Traders like you" suggestions.

**Post types** — trade, text, call (coin, up/down, target, invalidation, deadline, optional "backed" trade), poll (verified users; optional price settlement), system (liquidation, milestone, settled, duel settled).

**Markets** — totals, 24h movers, sort by volume / gainers / losers / OI / funding / hot on Perped, rows with sparkline, funding and Perped long/short split. Market page with chart (1h/1d/1w), stats, sentiment and the ticket.

**Ticket** — market or limit, margin presets, leverage slider with caps, TP/SL placed with the entry as a Hyperliquid `normalTpsl` group, builder-fee approval inline, copy mode, fade mode (auto 5% stop, 2× cap for accounts under 10 trades, public warning).

**Leaders** — Trades (podium + list, 7d/30d/all) and Calls (hit rate, min 5 resolved, streak). "Exit liquidity" bottom five, **opt-in only**.

**Profile** — cover, avatar, verified tick, followers/following (tappable), bio, Write a post / Edit profile or Follow / Challenge, account balance with Deposit / Withdraw, stat tiles (7d, all time, volume, copied vs faded, rivalries, trades win %, calls hit % + Judgement + streak), pinned trades (closed only), tabs: Posts · Trades (Open with Close 50% / Close all / Add · Closed with Pin) · Followers · Following.

**Also** — full-screen composer (Post / Call / Poll), thread view with nested replies and Copied/Faded tags, Receipts (share card, Win / Honest / Clean / Roast, Share to X, Save image), notifications, settings (theme, P&L display, privacy toggles incl. fading/bottom-board/duels, default leverage, linked X, log out), five-step onboarding, deposit sheet (card via on-ramp URL, or USDC on Arbitrum with address), duels API (no spectator stakes).

**Back end** — Postgres via Drizzle; crons: `/api/cron/stats` (15 min, fills → stats, verification) and `/api/cron/resolve` (5 min, calls hit/missed, polls close/settle, duels settle, "told you so" comments).

Deferred: live rooms / audio / video, in-app withdrawals (currently opens Hyperliquid portfolio), native wrapper.

## Demo mode and demo traders

- **Demo mode** (any user): simulated fills at live Hyperliquid prices against a $1,000 practice balance. Offered at the end of onboarding, switchable in Settings ("Go live" turns it off). Demo accounts and paper trades carry a **Demo** tag; Leaders has a Real / Demo switch so results never mix.
- **Remove demo entirely**: set `NEXT_PUBLIC_DEMO_ENABLED=0`. Demo disappears from onboarding and settings, paper trades are refused, and existing demo users see a one-tap "Go live".
- **Six demo traders** (bots, flagged `isBot`): `GET /api/seed?key=CRON_SECRET` creates them and backfills two weeks; `/api/cron/bots` runs every 15 min. They open and close trades, copy and fade each other and humans (contrarian_kate fades most), challenge and accept duels, vote in and start polls, make calls, reply in their own threads, follow bots like themselves and whoever is winning, and pin their best trade. Humans are reacted to first. `BOTS_PAUSED=1` freezes them; `/api/seed?key=…&action=purge` removes them.

## Stack

Next.js 15 · TypeScript · Tailwind 4 · Privy (`@privy-io/react-auth`, `@privy-io/server-auth`) · `@nktkas/hyperliquid` + viem · Drizzle ORM + Postgres · SWR · Vercel (hosting + cron).

## Setup

### Accounts (all free tiers)
1. **Privy** — https://dashboard.privy.io → New app → App ID + App secret. Enable Email, Google, Twitter, Wallet; embedded wallets → create on login for all users. Add `http://localhost:3000` and your domain to Allowed origins.
2. **Postgres** — Neon (https://neon.tech) or Supabase. Copy the connection string.
3. **Builder wallet** — any EVM wallet you control, funded with ≥ 100 USDC in its Hyperliquid perps account on the network you run (testnet faucet: https://app.hyperliquid-testnet.xyz/drip). This address earns the builder fees.
4. **On-ramp (optional)** — MoonPay or Transak account; put the hosted widget URL in `NEXT_PUBLIC_ONRAMP_URL`. Without it the card button shows "coming soon" and the USDC-transfer route still works.
5. **Vercel** — hosting and the two crons in `vercel.json`. Set `CRON_SECRET`.

### Run
```bash
cp .env.example .env.local   # fill in
npm install
npm run db:push              # creates tables
npm run dev                  # http://localhost:3000
```

### First session on testnet
1. Open on your phone → Get started → Google → handle → read the four cards → approve the fee → copy your wallet address.
2. Get testnet USDC from the faucet to that address, deposit into perps on the Hyperliquid testnet app.
3. Markets → SOL → Long $25 2× → it appears in Home with live P&L.
4. Second account in a private window → Copy, then Fade. Close the first position from your profile → a Settled post appears if 3+ people joined.
5. Compose → Call → HYPE up to a target, 24 h → wait for the resolver (or hit `/api/cron/resolve` with the secret).

## Env
See `.env.example`. New in v0.3: `NEXT_PUBLIC_ONRAMP_URL`, `CRON_SECRET`.

## Layout
```
app/                 pages: home, markets, markets/[coin], trade, leaderboard, u/[handle], compose, post/[id], notifications, settings, onboarding
app/api/             posts (+ vote, poll, pin, close, comments, [id]), me (+ settings), follows, notifications, profile, leaderboard, markets (+ candles), duels, cron (stats, resolve)
components/          FeedPost (all kinds), Hero, TradeTicket, DepositSheet, Receipt, Ticker, Nav, PriceChart, Sparkline, ui (icons, CoinMark, Avatar, theme)
lib/                 config, format, hl-info (read API), hl-exchange (signed actions), schema, db, auth, feed (query + system posts + notify), hooks
```

## Known gaps / honest notes
- Build not yet verified by CI: run `npm install && npm run build` and fix anything the compiler flags (expected: a handful of type nits, not architecture).
- `@nktkas/hyperliquid` version drift: if `ExchangeClient` / `order` signatures changed, `lib/hl-exchange.ts` is the only file to touch.
- Calls resolve against the current mid at each 5-minute run, not against 1-minute candles; a wick between runs can be missed. Tighten with `candleSnapshot` later.
- Liquidation detection relies on the client calling `/close` with `reason: "liquidation"` or the stats cron reading `dir` from fills; a dedicated fills watcher is the proper fix.
- Trades are recorded client-side after the fill; server-side verification of `oid` against `userFills` is a hardening step.
- Verification = 10+ closed trades and a linked X handle (typed, not OAuth-verified yet).
- Legal: unlicensed interface to a derivatives venue; get advice before marketing to a specific jurisdiction. Keep the risk copy.
