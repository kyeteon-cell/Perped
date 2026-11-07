/**
 * Patch notes shown in Settings → What's new. Every release that changes something people will notice gets an
 * entry here (newest first). Keep lines short and in plain words: what changed for the player, not how.
 */
export type Release = { version: string; date: string; title: string; new?: string[]; improved?: string[]; fixed?: string[] };

export const RELEASES: Release[] = [
  {
    version: "0.10.1", date: "7 Nov 2026", title: "Behind the scenes",
    improved: [
      "Small under-the-hood changes so we can see which parts of Perped people enjoy and where they get stuck, and fix those first. No personal data is collected.",
    ],
  },
  {
    version: "0.10.0", date: "7 Nov 2026", title: "A faster Home",
    new: [
      "Happening now: Fight Night, the Daily Fade, the one-hour call, your first fade and the live Pulse cards are one swipeable strip instead of five stacked cards. Whatever matters most right now comes first, and it stops sliding once you touch it.",
      "The feed now starts on your first screen, instead of two screens down.",
    ],
    improved: [
      "Your balance is one compact row with 7-day P&L, open trades, streak and a Trade button. Tap it for your profile.",
      "Posting moved to the pen in the top bar. Your week and phone alerts now sit inside the feed instead of above it.",
      "Pulse has its own spot on the Live tab.",
    ],
  },
  {
    version: "0.9.10", date: "7 Nov 2026", title: "Bad signal, handled",
    new: [
      "Lose signal and a chip at the top tells you prices and trades are paused. It says Back online when you reconnect, and live prices pick up straight away instead of after a delay.",
    ],
    fixed: [
      "Trade, close and set-exits buttons no longer get stuck on their spinner if your connection drops mid-tap. You get a clear message about what happened and what to check before trying again.",
      "If your real-money order fills but the connection drops before it posts, Perped tells you it filled, so you don't place it twice.",
      "Patch notes show the right version number again.",
    ],
  },
  {
    version: "0.9.9", date: "6 Nov 2026", title: "Type your amount",
    fixed: [
      "Trade and quick trade: you can type any amount in the margin box (decimals too), not just pick a preset. Tap the box to open the keypad; tapping a preset still fills it in.",
    ],
  },
  {
    version: "0.9.8", date: "6 Nov 2026", title: "kPEPE and 1000x markets fixed",
    fixed: [
      "Opening kPEPE (and the other 1000x markets like kBONK and kSHIB) no longer crashes the app.",
      "Stops, targets and the automatic fade stop on those markets now use the right number of decimals, instead of rounding a 0.005 price to 0.01.",
    ],
  },
  {
    version: "0.9.7", date: "6 Nov 2026", title: "Stop losses fixed",
    fixed: [
      "Stop losses and take profits on demo trades now fill at the price you set, not wherever price had got to by the next check. Before, a stop could close well past your level (and lose a lot more than you planned).",
      "A quick wick that touches your stop and bounces now counts, the same as a real stop order on Hyperliquid.",
      "Stops, targets and liquidations trigger within seconds while you have Perped open, instead of waiting up to five minutes.",
      "If price jumps straight past your level, the trade closes at the first price after the jump.",
    ],
  },
  {
    version: "0.9.6", date: "6 Nov 2026", title: "Share card fix",
    fixed: [
      "Fade share cards: the logo, the lead number and \"Pick a side\" no longer overlap at the bottom. The footer has its own strip, and the lead row shrinks to fit long names.",
      "Settled fights on share cards say who won instead of who's ahead.",
    ],
    improved: [
      "The app updates itself: when a new version is live, it reloads as you come back to it, or shows a New version ready chip while you're using it. No more force-closing to get fixes.",
    ],
  },
  {
    version: "0.9.6", date: "5 Nov 2026", title: "Fade scoring fixes",
    fixed: [
      "A side that has closed now shows as Banked on its health bar, instead of a live health score worked out from a price it's no longer exposed to.",
      "The tug bar on fades now moves with the gap between the two ROIs: when both traders are up big, the leader's side visibly wins the bar instead of sitting near the middle.",
      "Health bar footers say how far away liquidation is in both cases (\"Liq 31.8% away\").",
      "The nav bar and trades pill no longer get stuck floating partway up the screen on iPhone after scrolling a fade.",
      "Head to head shows a dash for win rate when someone hasn't closed a trade yet, instead of 0%.",
      "Leaders: the list under the podium now carries on from #4 instead of repeating 1–3, accounts with no closed trades in the period are no longer ranked at $0.00, and win rates read \"48% win\" without a plus sign.",
    ],
  },
  {
    version: "0.9.5", date: "5 Nov 2026", title: "iPhone fixes",
    fixed: [
      "Opening the app from a notification no longer leaves the nav bar and trades pill floating mid-screen on iPhone.",
      "Opening the app from your home screen no longer starts it half-scrolled with the nav bar mid-screen: pages now scroll inside the app, so iPhone can't knock the bottom bars out of place.",
      "Going Back returns you to where you were on the page.",
    ],
  },
  {
    version: "0.9.4", date: "5 Nov 2026", title: "Stability update",
    fixed: [
      "Trade page no longer freezes when you switch coins or flip between Crypto and Stocks.",
      "Chart stats (open, high, low, close) always match the coin you're looking at; the old coin's candles no longer show while the new one loads.",
      "The /duels address now takes you to the Arena instead of a missing page.",
    ],
    improved: [
      "New automated check of every page on a phone-sized browser for errors, freezes and dead links.",
    ],
  },
  {
    version: "0.9.3", date: "4 Nov 2026", title: "Crews and records",
    new: [
      "Crews: start or join a crew, crew pages with stats, and crew tags next to names.",
      "Telegram crew bot for your group.",
      "Bring your Hyperliquid record: show your all-time PnL and win rate on your profile, verified on-chain.",
      "Earnings calculator on the invite page.",
    ],
    improved: [
      "Your fade W–L is counted exactly from your finished fights everywhere: profile, Arena and leaderboard.",
      "The trades pill shows Live for running fights (ahead–behind), or Unbeaten when you're ahead in all of them.",
      "Health bars keep their side colour when low: green for longs, red for shorts.",
      "Demo traders now trade stock perps as well as crypto.",
    ],
    fixed: [
      "Trades sheet and competition bar retry if a load fails, with loading and Try again states instead of a blank screen.",
      "iPhone (iOS 26): the nav bar and trades pill no longer float mid-screen after a sheet closes or the app resumes.",
      "The competition bar now shows on every page on iPhone.",
    ],
  },
  {
    version: "0.9.2", date: "3 Nov 2026", title: "Stocks, picks and moments",
    new: [
      "Stock perps: every Hyperliquid stock and index market with live prices, charts and demo trading.",
      "Pick the winner: back a side in any live fight for free and earn XP if you're right (double for calling the upset).",
      "Daily Fade: one target a day, beat it for +50 XP.",
      "Weekly recap card every Monday, with a share button.",
      "Big moments: order-filled stamp, rank-up ceremony, trophy unlock, win confetti, and what a winning demo trade would have paid for real.",
      "Trades pill and sheet: every open trade with live P&L, inline chart with your entry, stop and liquidation, plus Close winning / Close losing / Close all.",
      "Live arena tab: fight cards with health bars, Unbeaten banner, Took the lead stamp and KO screen.",
      "Arena explainer on your first visit.",
      "Phone alert settings: choose which alerts buzz your phone.",
      "Best fight at the top of every profile, with a share card.",
    ],
    improved: [
      "Push alerts rewritten to fit the lock screen: short headline, one sentence per line, nothing cut off.",
      "Fights settle the moment both sides close.",
      "Founders now earn 50% of their invitees' fees for life.",
      "The competition counts anyone who has placed a trade, demo accounts included.",
      "Home loads faster: lower sections load as you scroll.",
      "Rolling numbers, pull to refresh, new posts slide in, liquidation heartbeat on risky trades.",
      "perped.pro is now the only address; old links redirect and keep your demo account.",
    ],
    fixed: [
      "Names and badges line up on one line everywhere.",
      "Trades pill stays centred, and the Arena top bar only appears once you scroll.",
    ],
  },
  {
    version: "0.9.1", date: "2 Nov 2026", title: "Markets and trophies",
    new: [
      "Market metrics: funding (8h and yearly, countdown, history, other exchanges), order book depth and slippage, premium and today versus a normal day, each with a plain-English read.",
      "Search for coins and traders together, with suggestions.",
      "29 trophies with drawn emblems, from bronze to obsidian.",
      "Ranks on avatars with a metal rim by rank, plus admin and founder badges.",
      "First-open welcome with a guided first trade and first fade.",
      "Earnings page for founders and inviters, and share cards that carry your invite code.",
      "Alpha competition bar and About cards on every market.",
    ],
    fixed: [
      "Funding showed 1/8 of the real 8h rate.",
      "Log out signed you straight back in.",
      "Stops and targets now settle at the live price.",
    ],
  },
  {
    version: "0.9.0", date: "1 Nov 2026", title: "Season 0",
    new: [
      "The new Arena: Main event, Your fight, Vendettas, Bloodbath and the Pit.",
      "Charts tick live every second, with win and lose zones on trades and fades.",
      "Demo mode for Season 0, with early access to real money.",
      "Link X to a demo account, founder dashboard.",
    ],
    improved: ["Faster start, lighter polling and spam limits."],
  },
];

export const APP_VERSION = RELEASES[0].version;
