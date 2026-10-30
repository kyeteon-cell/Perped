# Perped — get perped

Social perps on Hyperliquid. Every trade is a post. Copy the best, fade the rest.

Mobile-first web app (installable PWA). Trades execute directly on Hyperliquid from the user's own embedded wallet with Perped's **builder code** attached, so the app earns a fee on every fill. Perped never holds funds.

## What's in v0.3

**Shell** — live price ticker on every page (Hyperliquid WebSocket), bottom nav, Day / Night / Auto theme with a different brand colour per theme (coral by day, mint-teal by night), per-page colour tints, semantic button colours.

**Home** — For you / Following / Live tabs, hero card, **Banked** (a slow marquee of recently closed trades; closed trades no longer appear in the For you feed, only here, on profiles and in threads), **Pulse** (an auto-advancing animated strip: live duels with a tug-of-war bar, Up right now / Down bad boards ranked by live ROI, who faded whom and who's winning it, call streaks; numbers tick on every WebSocket price, `/api/pulse`), (balance, 7-day PnL, open count, streak, Trade / Deposit / Post), feed of every post type as colour-coded cards (green/red trades, blue calls, violet polls, ink text, tinted system events, each with a kind tag) with live P&L that flashes on ticks, tap P&L to cycle % / $ / ROI, like and dislike, big Copy and Fade buttons on every live trade plus **swipe right to copy / swipe left to fade** (card slides over a coloured backdrop, haptic tick at the threshold), copied-vs-faded camps (hidden below 3 participants), "Traders like you" suggestions.

**Post types** — trade, text, call (coin, up/down, target, invalidation, deadline, optional "backed" trade), poll (verified users; optional price settlement), system (liquidation, milestone, settled, duel settled).

**Markets** — totals, 24h movers, sort by volume / gainers / losers / OI / funding / hot on Perped, rows with sparkline, funding and Perped long/short split. Market page with a TradingView lightweight-charts chart (candles/line, 1m–1d intervals, volume, pinch-zoom/pan, crosshair OHLC, live last candle), stats, sentiment and the ticket.

**Ticket** — market or limit, margin presets, leverage slider with caps, TP/SL placed with the entry as a Hyperliquid `normalTpsl` group, builder-fee approval inline, copy mode, fade mode (auto 5% stop, 2× cap for accounts under 10 trades, public warning).

**Leaders** — Trades (podium + list, 7d/30d/all) and Calls (hit rate, min 5 resolved, streak). "Exit liquidity" bottom five, **opt-in only**.

**Profile** — cover, avatar, verified tick, followers/following (tappable), bio, Write a post / Edit profile or Follow / Challenge, account balance with Deposit / Withdraw, a Performance card (equity curve from closed trades, 30d/all toggle, win rate / all-time / volume / calls hit, win–loss bar) linking to `/u/:handle/stats` (equity curve, hit-rate rings for trades/calls/judgement/trust, P&L by market, long vs short with avg win/loss and best/worst, ROI distribution histogram, rivalries), pinned trades (closed only), tabs: Posts · Trades (Open with Close 50% / Close all / Add · Closed with Pin) · Followers · Following.

**Battle** — every fade has a head-to-head page at `/battle/:faderPostId`: both positions with live ROI and a tug-of-war bar, trader-vs-trader stats (win rate, 30d and all-time P&L, trades, calls hit, copied/faded, liquidations) with the better side highlighted, the record between the two, copied-vs-faded split on the original trade, both captions, previous rounds; Pulse fade cards and the Fade tag on trade cards open it.

**Also** — full-screen composer (Post / Call / Poll), thread view with nested replies and Copied/Faded tags, Receipts (share card, Win / Honest / Clean / Roast, Share to X, Save image), notifications, settings (theme, P&L display, privacy toggles incl. fading/bottom-board/duels, default leverage, linked X, log out), five-step onboarding, deposit sheet (card via on-ramp URL, or USDC on Arbitrum with address), duels: ⚔ Challenge from any profile (coin, side, stake, duration) → you open your side in the ticket → they get a notification → `/duels/:id` to accept (opens the ticket for the opposite side) or decline → settles by who's further ahead at the deadline (no spectator stakes).

**Back end** — Postgres via Drizzle; crons: `/api/cron/stats` (15 min, fills → stats, verification) and `/api/cron/resolve` (5 min, calls hit/missed, polls close/settle, duels settle, "told you so" comments).

Deferred: live rooms / audio / video, in-app withdrawals (currently opens Hyperliquid portfolio), native wrapper.

## Fees and referrals (v0.4)

Every live fill carries Perped's Hyperliquid **builder code**. Users approve a maximum once (`NEXT_PUBLIC_BUILDER_MAX_FEE_TENTHS_BPS`, default 0.07%); each order is then charged at the user's **tier rate**, never above the max:

| Tier | Default | How you get it |
|---|---|---|
| Standard | 0.05% | everyone |
| Referral | 0.035% | signed up with another user's code |
| Top trader | 0.025% | top 100 on the 30-day PnL board, 10+ closed trades, positive 30-day PnL |

The tier is resolved server-side (`lib/fees.ts`, `/api/me` → `fee`) and the ticket passes `feeTenthsBps` into every order.

**Referral codes** are handles. Share `https://<your-domain>/?ref=<handle>`; the home page remembers it and onboarding step 2 pre-fills it (it can also be typed). Referrers earn **25%** of the builder fee their referees pay, **40%** once ten of them have traded in the last 30 days; paid in USDC to their Perped wallet.

- `/api/cron/referrals` runs daily at 00:40 UTC: for each referred live user it reads yesterday's fills, sums the `builderFee` field (so only Perped-routed fills count) and writes one `referral_earnings` row per referee per day. Re-run a day with `?key=CRON_SECRET&day=YYYY-MM-DD`.
- `/api/referrals` (authed) → your code, link, tier, summary, referees, payouts; shown in Settings.
- `/api/admin/referrals?key=CRON_SECRET` → your payout list (who's owed what, and their wallet). `POST` `{handle, amountUsd, txHash}` to record a payout you've sent; the referrer gets a notification.
- Builder fees themselves accrue on-chain to `NEXT_PUBLIC_BUILDER_ADDRESS`; claim them from Hyperliquid's referral/builder rewards page.

**Live prices** — market data (ticker, markets, charts, demo fills) comes from Hyperliquid **mainnet** regardless of the trading network (`NEXT_PUBLIC_HL_DATA_NETWORK`, default `mainnet`). Orders, balances and fills use `NEXT_PUBLIC_HL_NETWORK`; asset indices are re-resolved on the trading network before signing because they differ between networks.

**Coin logos and tickers** — `CoinMark` loads each coin's logo from Hyperliquid's icon set (`app.hyperliquid.xyz/coins/<COIN>.svg`) with a coloured letter badge as fallback. Hyperliquid's thousand-lot coins (`kPEPE`, `kBONK`…) are shown by their real ticker with a `·1000×` tag; links and API calls keep the Hyperliquid name.

**Leverage** matches Hyperliquid exactly: each market's own max leverage (BTC 40×, ETH 25×, SOL 20×…) read live from `metaAndAssetCtxs` and enforced client- and server-side. `NEXT_PUBLIC_MAX_LEVERAGE` is only the fallback before markets load. Fades from accounts with under 10 closed trades stay capped at 2×.

## Sign-up, demo mode and demo traders

- **Ways in, grouped by outcome** (`SignInOptions`, shown on the Home hero and onboarding): **Demo** — X, Google, Email or Guest (practice money, no wallet); **Real** — Connect a wallet (becomes the Hyperliquid account). Each button opens Privy on just that method. Previously: Continue with X, Connect a wallet, or **Try the demo** (a guest account: no login, no third party; a signed token in the browser, demo only, this device only; ids start `guest:`). Guests see *Sign in* wherever others see *Connect wallet*.
- Continue with X, or Connect a wallet. X signups land in **demo** automatically (embedded wallet only); to trade real money they connect an external wallet (MetaMask, Rabby, Rainbow, WalletConnect) from Settings, the deposit sheet or the home hero. That wallet becomes their Hyperliquid account. Wallet signups start live. The server refuses `isDemo:false` for accounts with no external wallet.
- **Demo mode**: simulated fills at live Hyperliquid prices against a $10,000 practice balance. Switchable in Settings once a wallet is connected. Demo accounts and paper trades carry a gold **Demo** tag and their cards get a hatched background with a dashed gold outline; live trades carry a green **Real** tag; Home has an All / Real money / Demo filter; Leaders has a Real / Demo switch so results never mix.
- **Remove demo entirely**: set `NEXT_PUBLIC_DEMO_ENABLED=0`. Demo disappears from onboarding and settings, paper trades are refused, and existing demo users see a one-tap "Go live".
- **Six demo traders** (bots, flagged `isBot`): they are created automatically (with two weeks of backfilled activity) the first time `/api/cron/bots` or `/api/health` runs on an empty database; `GET /api/seed?key=CRON_SECRET` does the same by hand; `/api/cron/bots` runs every 15 min. They trade at Hyperliquid's real max leverage by persona (degenmaxi and mooncat run the market max ~80% of the time, wickhunter the upper half, the others sensible with an occasional max send), open and close trades, copy and fade each other and humans (contrarian_kate fades most), challenge and accept duels, vote in and start polls, make calls, reply in their own threads, follow bots like themselves and whoever is winning, and pin their best trade. Humans are reacted to first. `BOTS_PAUSED=1` freezes them; `/api/seed?key=…&action=purge` removes them.

## Stack

Next.js 15 · TypeScript · Tailwind 4 · Privy (`@privy-io/react-auth`, `@privy-io/server-auth`) · `@nktkas/hyperliquid` + viem · Drizzle ORM + Postgres · SWR · Vercel (hosting + cron).

## Setup

### Accounts (all free tiers)
1. **Privy** — https://dashboard.privy.io → New app → App ID + App secret. Enable Twitter (X) and Wallet login methods; embedded wallets → create on login for all users. Add `http://localhost:3000` and your domain to Allowed origins.
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
1. Open on your phone → Get started → Continue with X (demo) or Connect a wallet (live) → handle → read the four cards → approve the fee → copy your wallet address.
2. Get testnet USDC from the faucet to that address, deposit into perps on the Hyperliquid testnet app.
3. Markets → SOL → Long $25 2× → it appears in Home with live P&L.
4. Second account in a private window → Copy, then Fade. Close the first position from your profile → a Settled post appears if 3+ people joined.
5. Compose → Call → HYPE up to a target, 24 h → wait for the resolver (or hit `/api/cron/resolve` with the secret).

## Env
See `.env.example`. New in v0.4: `NEXT_PUBLIC_BUILDER_MAX_FEE_TENTHS_BPS`, `NEXT_PUBLIC_BUILDER_FEE_REFERRED_TENTHS_BPS`, `NEXT_PUBLIC_BUILDER_FEE_TOP_TENTHS_BPS`, `NEXT_PUBLIC_TOP_TIER_RANK`, `NEXT_PUBLIC_REFERRAL_SHARE_PCT`, `NEXT_PUBLIC_REFERRAL_TOP_SHARE_PCT`, `NEXT_PUBLIC_REFERRAL_TOP_THRESHOLD`. The schema now migrates itself on the first database call after each deploy (idempotent SQL; `AUTO_MIGRATE=0` turns it off). Open `/api/health` to confirm — no key needed. It also checks Privy: that the app id/secret pair is valid and that the current domain is in Privy's allowed origins, which is the usual reason login fails on a new deploy. Login errors are shown in the UI too.

## Layout
```
app/                 pages: home, markets, markets/[coin], trade, leaderboard, u/[handle], compose, post/[id], notifications, settings, onboarding
app/api/             posts (+ vote, poll, pin, close, comments, [id]), me (+ settings), follows, notifications, profile, leaderboard, markets (+ candles), duels, cron (stats, resolve)
components/          FeedPost (all kinds), Hero, TradeTicket, DepositSheet, Receipt, Ticker, Nav, PriceChart, Sparkline, ui (icons, CoinMark, Avatar, theme)
lib/                 config, format, hl-info (read API), hl-exchange (signed actions), schema, db, auth, feed (query + system posts + notify), hooks
```

## Known gaps / honest notes
- Fixed in v0.4: profile and every `useSWR` call now send auth (the global fetcher attaches the Privy or guest token), poll results align to options, `allowCopy` is enforced, Receipt chips open the share sheet, comment errors show.
- Build not yet verified by CI: run `npm install && npm run build` and fix anything the compiler flags (expected: a handful of type nits, not architecture).
- `@nktkas/hyperliquid` version drift: if `ExchangeClient` / `order` signatures changed, `lib/hl-exchange.ts` is the only file to touch.
- Calls resolve against the current mid at each 5-minute run, not against 1-minute candles; a wick between runs can be missed. Tighten with `candleSnapshot` later.
- Liquidation detection relies on the client calling `/close` with `reason: "liquidation"` or the stats cron reading `dir` from fills; a dedicated fills watcher is the proper fix.
- Trades are recorded client-side after the fill; server-side verification of `oid` against `userFills` is a hardening step.
- Verification = 10+ closed trades and a linked X handle (typed, not OAuth-verified yet).
- Legal: unlicensed interface to a derivatives venue; get advice before marketing to a specific jurisdiction. Keep the risk copy.
