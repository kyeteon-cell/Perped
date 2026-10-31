import Link from "next/link";
import { BUILDER_FEE_STANDARD_TENTHS_BPS, BUILDER_FEE_REFERRED_TENTHS_BPS, BUILDER_FEE_TOP_TENTHS_BPS, BUILDER_MAX_FEE_TENTHS_BPS, TOP_TIER_RANK, REFERRAL_SHARE_PCT, REFERRAL_TOP_SHARE_PCT, REFERRAL_TOP_THRESHOLD, HL_NETWORK } from "@/lib/config";
import { tenthsBpsToLabel } from "@/lib/fees";
import { RANKS } from "@/lib/rank";

export const metadata = { title: "How Perped works · where your money is, start to finish" };

const F = (t: number) => tenthsBpsToLabel(t);

/** The money-path picture: wallet ↔ bridge ↔ Hyperliquid account, Perped beside it. */
function MoneyPath() {
  return (
    <svg viewBox="0 0 360 230" className="hw-dia" role="img" aria-label="Money moves only between your wallet and Hyperliquid; Perped only sends orders you signed">
      <defs>
        <marker id="g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--green)" /></marker>
        <marker id="b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--blue)" /></marker>
      </defs>
      {[["Your wallet", "USDC · your key", 10], ["HL bridge", "public contract", 130], ["Your HL account", "balance · positions", 250]].map(([t, s, x]) => (
        <g key={String(t)}><rect x={Number(x)} y="30" width="100" height="56" rx="10" fill="var(--green-soft)" stroke="var(--green)" strokeWidth="1.5" /><text x={Number(x) + 50} y="53" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">{t}</text><text x={Number(x) + 50} y="70" textAnchor="middle" fontSize="9.5" fill="var(--muted)">{s}</text></g>
      ))}
      <g fill="none" stroke="var(--green)" strokeWidth="1.5"><path d="M110 50H130" markerEnd="url(#g)" /><path d="M130 66H110" markerEnd="url(#g)" /><path d="M230 50H250" markerEnd="url(#g)" /><path d="M250 66H230" markerEnd="url(#g)" /></g>
      <text x="120" y="24" textAnchor="middle" fontSize="9" fill="var(--muted)">deposit / withdraw</text>
      <rect x="250" y="150" width="100" height="56" rx="10" fill="var(--blue-soft)" stroke="var(--blue)" strokeWidth="1.5" />
      <text x="300" y="173" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">Perped</text>
      <text x="300" y="190" textAnchor="middle" fontSize="9.5" fill="var(--muted)">feed · battles · ranks</text>
      <g fill="none" stroke="var(--blue)" strokeWidth="1.25"><path d="M285 150V86" markerEnd="url(#b)" /><path d="M315 86V150" markerEnd="url(#b)" /><path d="M250 178H60V86" strokeDasharray="4 3" markerEnd="url(#b)" /></g>
      <text x="280" y="122" textAnchor="end" fontSize="9" fill="var(--muted)">reads</text>
      <text x="320" y="122" fontSize="9" fill="var(--muted)">signed orders</text>
      <text x="150" y="172" textAnchor="middle" fontSize="9" fill="var(--muted)">asks your wallet to sign (never money)</text>
    </svg>
  );
}

/** /how-it-works — the trust page, written for someone who has never traded a perp. */
export default function HowItWorks() {
  const nav: [string, string][] = [["start", "Start here"], ["money", "Where your money is"], ["demo-path", "Demo, step by step"], ["real-path", "Real money, step by step"], ["permissions", "What we can do"], ["verify", "Check it yourself"], ["fees", "Fees"], ["battles", "Battles & ranks"], ["arena", "The Arena"], ["risk", "Risks"], ["promise", "Our commitments"]];
  return (
    <main className="hw-page px-5 pb-14 pt-6">
      <Link href="/" className="when">← Back</Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">How Perped works</h1>
      <Link href="/intro" className="chip on mt-3 inline-flex" style={{ fontSize: 13 }}>New here? The 60-second tour →</Link>
      <p className="muted mt-1">Perped never holds your money. Your trades live on Hyperliquid, in your own wallet&rsquo;s account; Perped is the social layer that lets people copy you, fade you and keep score. This page explains all of it from scratch.</p>
      <div className="mt-4 flex flex-wrap gap-1.5">{nav.map(([id, t]) => <a key={id} href={`#${id}`} className="chip" style={{ padding: "6px 10px", fontSize: 12 }}>{t}</a>)}</div>

      <section id="start" className="hw mt-7">
        <h2 className="text-lg font-bold">Start here: the words you need</h2>
        <p className="mt-2">If you have never traded crypto derivatives, five ideas cover almost everything on Perped.</p>
        <dl className="hw-gloss mt-3">
          <dt>A perp (perpetual future)</dt><dd>A contract that tracks a coin&rsquo;s price without you owning the coin. You bet on the direction: <b>long</b> means you profit if the price goes up, <b>short</b> means you profit if it goes down. There is no expiry; you hold it until you close it.</dd>
          <dt>Margin</dt><dd>The money you put up for a trade. On Perped the card shows it as, say, <span className="mono">$250 × 40</span>: $250 of your money controlling a $10,000 position.</dd>
          <dt>Leverage</dt><dd>The multiplier. 40× means every 1% the price moves, your position moves 40%. It cuts both ways: at 40× a 2.5% move against you wipes the whole $250. Start at 2–5× until you have closed a few trades.</dd>
          <dt>Liquidation</dt><dd>When a losing trade eats your margin, the exchange closes it automatically and the margin is gone. Nobody chases you for more; you can never lose more than you put up on that trade.</dd>
          <dt>A wallet</dt><dd>An app (Rabby, MetaMask, Rainbow, Phantom) that holds a private key. The key is the only thing that can move your money. Websites like Perped can <i>ask</i> the wallet to sign something; the wallet shows you what it is and you tap Approve or Reject.</dd>
          <dt>Hyperliquid</dt><dd>The exchange. It is a blockchain built to run a perps order book, clearing billions of dollars a day. Your account on it is simply your wallet address, and anyone can look it up.</dd>
        </dl>
      </section>

      <section id="money" className="hw mt-7">
        <h2 className="text-lg font-bold">Where your money is</h2>
        <p className="mt-2">Perped has no deposit address, no balance of yours, no wallet holding client funds, and no way to create one. Money moves between your wallet and Hyperliquid, signed by you each time. Perped sits beside that path: it reads from Hyperliquid and sends it orders your wallet has already signed.</p>
        <MoneyPath />
        <ul className="hw-list mt-3">
          <li><b>Non-custodial.</b> Your Hyperliquid account is your wallet address. Funds in it move only with a transaction signed by your key. Hyperliquid Labs cannot move them, and neither can any front-end, Perped included.</li>
          <li><b>Public.</b> Every account&rsquo;s balance, positions and fills are on Hyperliquid&rsquo;s explorer for anyone to see. Tap <b>Verified on Hyperliquid</b> on any real-money post to see that trader&rsquo;s.</li>
          <li><b>If Perped vanished tomorrow,</b> your money would still be on Hyperliquid, reachable from Hyperliquid&rsquo;s own site or any other front-end with the same wallet. That is the test of a real front-end.</li>
          <li><b>What Perped stores:</b> your handle, bio, pictures, settings, follows, likes, comments, battle results, XP, and a <i>record</i> of each trade you post (coin, side, size, entry, exit) so it can be shown and scored. Not your key, not your USDC, not your positions.</li>
          {HL_NETWORK !== "mainnet" && <li><b>Right now real-money trading runs on Hyperliquid&rsquo;s testnet</b> while we finish testing. Prices shown are mainnet; orders go to testnet. We will say clearly when mainnet is on.</li>}
        </ul>
      </section>

      <span id="demo" />
      <section id="demo-path" className="hw mt-7">
        <h2 className="text-lg font-bold">Demo, step by step</h2>
        <p className="mt-2">Most people start here. Demo is $10,000 of practice money at live prices. Nothing goes to Hyperliquid and nothing can be lost.</p>
        <ol className="hw-steps mt-3">
          <li><b>Tap Guest</b> on the Home screen (or sign in with X, Google or email). An account is made on the spot with a random handle; you can change it in Settings.</li>
          <li><b>Make a one-hour call.</b> Top of Home: &ldquo;Where&rsquo;s BTC in an hour?&rdquo; Tap Higher or Lower. It settles against the price it was made at, on the hour. This is the gentlest way in: no leverage, no sizing.</li>
          <li><b>Open a trade.</b> Markets → pick a coin → Long or Short → choose margin and leverage → confirm. The fill is simulated at the live Hyperliquid price and appears in the feed as your post, marked <span className="demo-tag">Demo</span>.</li>
          <li><b>Manage it.</b> Every open trade of yours has a <b>Manage</b> pill: close 25/50/75/100%, set a take-profit or stop-loss (with presets in % terms), or add to it. Demo stops are checked against the live price every few minutes.</li>
          <li><b>Copy or fade.</b> Swipe a live trade right to copy it, or left to fade it. <b>⚡ Quick fade</b> asks for one thing, your size: it takes the opposite side at the trader&rsquo;s exact leverage, adds a stop loss for you, and drops you straight into the battle page.</li>
          <li><b>Fight.</b> Every fade is a <b>battle</b>: whoever ends with the higher ROI wins. Watch it live on the battle page, and in the Arena with everyone else&rsquo;s. Share any trade as a challenge link; a friend who taps it lands straight in the opposite trade.</li>
          <li><b>Climb.</b> Wins, calls and battles earn XP and ranks. The demo leaderboard ranks practice accounts against each other; it never mixes with real-money results.</li>
        </ol>
      </section>

      <section id="real-path" className="hw mt-7">
        <h2 className="text-lg font-bold">Real money, step by step</h2>
        <p className="mt-2">Only do this once you have closed a few demo trades and understand leverage. Every step below is signed by you in your own wallet.</p>
        <ol className="hw-steps mt-3">
          <li><b>Get a wallet.</b> Install Rabby, MetaMask, Rainbow or Phantom (with Ethereum networks on) on your phone. Write the seed phrase on paper. Nobody — not Perped, not Hyperliquid — can recover it for you.</li>
          <li><b>Get USDC on Arbitrum.</b> Buy USDC on an exchange and withdraw it to your wallet address choosing the <b>Arbitrum</b> network, or buy directly in the wallet app. You also need a little ETH on Arbitrum (a dollar or two) to pay network fees.</li>
          <li><b>Deposit to Hyperliquid.</b> Send USDC to Hyperliquid&rsquo;s bridge contract (Perped&rsquo;s Deposit button opens it). Your wallet signs it; Hyperliquid credits your account a minute later. Perped is not part of this transaction.</li>
          <li><b>Connect and go live.</b> On Perped, Settings → Connect a wallet → Go live. Your wallet becomes your Hyperliquid account inside Perped. Your demo history stays on your profile.</li>
          <li><b>Approve the fee cap, once.</b> Your wallet will ask you to approve a Perped builder fee of at most {F(BUILDER_MAX_FEE_TENTHS_BPS)} per fill. That is a cap enforced by Hyperliquid; what we actually charge is lower (see Fees). You can revoke it on Hyperliquid at any time.</li>
          <li><b>Trade.</b> Tap Long or Short. Perped builds the order; your wallet shows the coin, side and size; you approve; Hyperliquid fills it. Your position now exists on Hyperliquid, and Perped posts the record, marked <span className="real-tag">Real</span> with a link to the explorer.</li>
          <li><b>Close, or let your stop do it.</b> Same as trading: a signed order, filled by Hyperliquid. Take-profit and stop-loss orders are placed on Hyperliquid itself when you set them, so they fire even if Perped is closed.</li>
          <li><b>Withdraw.</b> On Hyperliquid&rsquo;s site, sign a withdrawal and USDC arrives in your wallet on Arbitrum within minutes. Perped is not involved and cannot stop you.</li>
        </ol>
        <p className="muted mt-3 text-[13px]">Start with an amount you could lose without noticing. Check your first two or three fills on the explorer. Then size up.</p>
      </section>

      <section id="permissions" className="hw mt-7">
        <h2 className="text-lg font-bold">What Perped can and cannot do with your wallet</h2>
        <p className="mt-2">Everything Perped does on your behalf needs a signature from your wallet. There are exactly two things you ever sign for Perped.</p>
        <table className="hw-table mt-3">
          <thead><tr><th>Permission</th><th>Lets Perped</th><th>Cannot</th></tr></thead>
          <tbody>
            <tr><td>Each order (open, close, TP, SL)</td><td>Hand you that one order to approve, then send it to Hyperliquid</td><td>Sign anything without you tapping Approve; move funds; withdraw</td></tr>
            <tr><td>Builder fee cap (once)</td><td>Let Hyperliquid add up to {F(BUILDER_MAX_FEE_TENTHS_BPS)} to fills placed through Perped</td><td>Charge above the cap; charge on trades made elsewhere; touch your balance</td></tr>
          </tbody>
        </table>
        <ul className="hw-list mt-3">
          <li><b>Cannot withdraw or deposit for you.</b> Those are Hyperliquid transactions only your key can sign. Perped never holds that key and never asks for it.</li>
          <li><b>Cannot freeze your account.</b> Your account is on Hyperliquid. Deleting your Perped profile changes nothing on-chain.</li>
          <li><b>Cannot see your seed phrase.</b> Wallet apps never expose it to websites.</li>
          <li><b>Cannot trade while you are away,</b> except for take-profit and stop-loss orders you signed in advance, which Hyperliquid itself executes.</li>
        </ul>
        <p className="mt-3">If Perped ever asks for anything not listed here — a transfer, an approval for an unknown contract, a seed phrase — close the tab. It is a bug or an impostor site, and either is worth telling us about.</p>
      </section>

      <section id="verify" className="hw mt-7">
        <h2 className="text-lg font-bold">Check it yourself</h2>
        <p className="mt-2">Do not take our word for any of this. Each check takes a few minutes in a browser.</p>
        <ol className="hw-steps mt-3">
          <li><b>Look yourself up.</b> Paste your wallet address into Hyperliquid&rsquo;s explorer. Balance, positions and every fill are there with timestamps, and they match what Perped shows because both read the same ledger.</li>
          <li><b>Tap &ldquo;Verified on Hyperliquid&rdquo;</b> on any real post. If a post claims a fill that is not on the explorer, the post is wrong, not the chain.</li>
          <li><b>Read what your wallet asks you to approve.</b> The fee cap shows its exact number; each order shows coin, side and size. Anything else: decline.</li>
          <li><b>Check the builder fee on Hyperliquid.</b> Its site lists which builders you have approved and at what cap. Perped&rsquo;s entry is at or below the number on this page, and you can revoke it there.</li>
          <li><b>Try the exit.</b> Open Hyperliquid&rsquo;s own site with the same wallet. Your position is there. Close or withdraw there. Perped is one window onto your account, not the account.</li>
        </ol>
      </section>

      <section id="fees" className="hw mt-7">
        <h2 className="text-lg font-bold">Fees</h2>
        <p className="mt-2">Perped earns a <b>builder fee</b>: a small percentage of each real fill, added to Hyperliquid&rsquo;s own trading fee and collected by Hyperliquid, which pays Perped. We never invoice you and never hold a balance of yours. We earn the same on a winning trade as a losing one.</p>
        <table className="hw-table mt-3">
          <tbody>
            <tr><td>Standard</td><td className="mono">{F(BUILDER_FEE_STANDARD_TENTHS_BPS)}</td><td>of notional, per fill, shown on the ticket</td></tr>
            <tr><td>Joined through an invite</td><td className="mono">{F(BUILDER_FEE_REFERRED_TENTHS_BPS)}</td><td>for life</td></tr>
            <tr><td>Top {TOP_TIER_RANK} on the leaderboard</td><td className="mono">{F(BUILDER_FEE_TOP_TENTHS_BPS)}</td><td>while ranked</td></tr>
            <tr><td>Cap you approve once</td><td className="mono">{F(BUILDER_MAX_FEE_TENTHS_BPS)}</td><td>enforced by Hyperliquid, not by us</td></tr>
          </tbody>
        </table>
        <p className="mt-3">Example: $250 margin at 40× is $10,000 of notional. At {F(BUILDER_FEE_STANDARD_TENTHS_BPS)} the Perped fee is <span className="mono">${((10000 * BUILDER_FEE_STANDARD_TENTHS_BPS) / 100000).toFixed(2)}</span> to open and the same to close. Hyperliquid&rsquo;s own fee applies on top and is published on their site.</p>
        <p className="mt-2"><b>Invites.</b> Share a challenge or invite link and anyone who joins through it pays the reduced rate. You receive {REFERRAL_SHARE_PCT}% of the Perped fee on everything they trade ({REFERRAL_TOP_SHARE_PCT}% once {REFERRAL_TOP_THRESHOLD} of your invitees are active), paid in USDC and shown in Settings. It comes out of the fee, never out of anyone&rsquo;s trading balance.</p>
        <p className="mt-2">Demo trading is free, because there is no fill to charge on.</p>
      </section>

      <section id="battles" className="hw mt-7">
        <h2 className="text-lg font-bold">Battles, duels and ranks</h2>
        <ul className="hw-list">
          <li><b>A battle starts when someone fades a trade:</b> same coin, the other side. Higher leverage-adjusted ROI wins; under 0.5% apart is a draw; a liquidation loses on the spot. <b>Bank and chase:</b> if one side closes first, their ROI is banked and the battle stays live; the side still in has to beat that number when they close, or they lose. Bailing early hands your opponent a target, but nobody can win just by holding longer. It settles when both positions close; if a battle is still open after 7 days, the open side is marked at the live price.</li>
          <li><b>Quick fade&rsquo;s automatic stop.</b> It aims for a 10% loss on your margin, but never sits closer than a 1% price move (so normal wobble doesn&rsquo;t stop you out at high leverage), and always closes well before liquidation. At 10× that is 1% away; at 25×, 1% away and −25% of margin; at 2×, 5% away. Change it any time from Manage.</li>
          <li><b>Margin/SL health.</b> The bars on a battle run from 100% at your entry to 0% at your stop loss, or at liquidation if you have no stop. Under 40% they turn red chrome and bleed. A stop already in profit shows full: you can&rsquo;t lose that one.</li>
          <li><b>Colours always mean the same thing.</b> Green is bought or in profit, red is sold or in loss. Prices are coloured by which way the market moved; your P&amp;L by whether you&rsquo;re up. Leaders get a gold ring, never a green one.</li>
          <li><b>One fade per person per trade.</b> You can fade a trade once, and you can&rsquo;t fade back someone who faded you on it: you&rsquo;re already in a battle with them. Anyone else can pile in, so one trade can fight many battles.</li>
          <li><b>Rivals and nemeses.</b> Fight the same trader three times (battles and duels both count), or call them out, and you become rivals: you get an alert with a one-tap quick fade whenever they open a trade, and the series score shows next to their name. Your <b>nemesis</b> is your #1 rival, the person you&rsquo;ve fought most (or called out). Nemesis battles get their own ☠ tag and tab. Taking back the lead in a series pays +25 XP; five straight wins is a sweep, +50 XP.</li>
          <li><b>A duel</b> is a timed head-to-head you accept by link. The start price is the live price when it&rsquo;s accepted; whoever is ahead when the clock runs out wins.</li>
          <li><b>XP is slow and it can go down.</b> Battle win +60 (+30 for a 20%+ margin, +40 for beating someone two ranks above you), loss +10, draw +20. Duel +75 / +10. One-hour call +6 / +2. Closed trade +4 / +1. Liquidations earn nothing. From Knife Catcher up, losing costs XP: battle −15, duel −10, liquidation −25, multiplied by how many ranks you are above Wick Hunter, so ranks can be lost. Beating a guest account made that same day pays draw XP only.</li>
          <li><b>💰 Streak bounties.</b> Anyone on a 5+ battle win streak carries a bounty. Break it and you get 25 XP plus 10 XP for every win in their streak, on top of the win, and a feed post.</li>
          <li><b>Ranks.</b> Your emblem shows next to your name everywhere. Demo and real accounts earn XP the same way; the leaderboard still separates them.
            <div className="ladder mt-3">{RANKS.map((r) => <div key={r.level} className="lad"><img src={`/api/share-bg/rank-${r.level}`} alt="" /><div className="text-[12px] font-bold">{r.title}</div><div className="mono when text-[11px]">{r.min.toLocaleString()} XP</div></div>)}</div>
          </li>
        </ul>
      </section>

      <section id="arena" className="hw mt-7">
        <h2 className="text-lg font-bold">The Arena</h2>
        <p className="mt-2">Every live battle on Perped, sorted so the good ones are easy to find, with a way to jump into each.</p>
        <ul className="hw-list mt-3">
          <li><b>☠ Nemesis</b> (shown when any are running): battles between sworn rivals, pinned to the top with the series score and which meeting this is.</li>
          <li><b>🔥 High stakes:</b> 20× or more, big positions, or someone close to liquidation.</li>
          <li><b>👥 Following:</b> your battles, and battles of people you follow or your rivals.</li>
          <li><b>💀 Bloodbath:</b> battles where the two sides are more than 7 ROI points apart. At the top is <b>The Pit</b>, the most one-sided fight right now, with both health bars live.</li>
          <li><b>🗡 Finish them / 🛟 Save them:</b> on every Bloodbath battle. Finish backs the winner, Save backs the loser for a comeback. One tap, size only, at their leverage.</li>
          <li><b>REKT and Revenge:</b> liquidations stay in Bloodbath for six hours as tombstones. <b>🩸 Revenge</b> quick-fades the winner&rsquo;s newest open trade; if they have none, they become your nemesis and you&rsquo;re pinged when they next trade. The <b>kill feed</b> lists the last day&rsquo;s liquidations.</li>
          <li><b>Body count:</b> this week&rsquo;s 🗡 Butcher (most people perped) and 🪦 Most rekt.</li>
          <li><b>Last stand:</b> if you&rsquo;re 20% down in a battle you get one alert: cut it, or double down. Your followers get one too.</li>
          <li id="fight-night"><b>🥊 Fight Night:</b> every night from 9 to 10pm Bangkok time (14:00–15:00 UTC), the hour everyone piles into the Arena at once. <b>Every battle that starts inside the hour pays double XP</b> to whoever earns XP from it (losses still cost the usual amount). When it opens you get an alert (and a phone push if alerts are on), Home shows the three biggest live battles with nemesis matches first, and the countdown in the Arena header turns gold and reads LIVE. An hour before, Home shows a countdown so you can line up your fades.</li>
          <li><b>Side with / Run it back:</b> on a live battle you&rsquo;re watching, Side with copies either fighter in one tap. On a battle you just finished, Run it back (or Revenge) quick-fades your opponent&rsquo;s next trade.</li>
        </ul>
      </section>

      <section id="risk" className="hw mt-7">
        <h2 className="text-lg font-bold">What can still go wrong</h2>
        <p className="mt-2">&ldquo;Perped cannot take your money&rdquo; is true. It is not the same as &ldquo;you cannot lose money.&rdquo;</p>
        <ul className="hw-list mt-3">
          <li><b>Leverage.</b> At 40×, a 2.5% move against you is a total loss of margin. This is the exchange working as designed, and it is the most common way people lose on perps. Start low.</li>
          <li><b>Copying is not advice.</b> A trader&rsquo;s rank, streak or past results say nothing about their next trade. The person you copy may close while you are asleep.</li>
          <li><b>Bugs.</b> Perped is new software. A bug could mis-size an order or show a stale price. That is why every real trade links to the explorer and why we tell you to trade small until you have checked a few fills.</li>
          <li><b>Your wallet.</b> Lose the keys and the account is unrecoverable by anyone. Sign a malicious transaction on another site and the funds in that wallet are at risk regardless of Perped.</li>
          <li><b>Hyperliquid itself.</b> If the chain halts, trading halts everywhere on it. It has a strong record, but it is not a bank and nothing here is insured.</li>
          <li><b>Regulation.</b> Crypto perpetuals are unregulated in most places and prohibited in some, including the United States and the United Kingdom. It is on you to know whether you may use Hyperliquid where you live.</li>
          <li><b>Impostors.</b> Anyone can clone a site&rsquo;s look. Check the address bar. The real Perped never asks for a seed phrase, a transfer, or an approval beyond the two permissions above.</li>
        </ul>
      </section>

      <section id="promise" className="hw mt-7">
        <h2 className="text-lg font-bold">What we commit to</h2>
        <ul className="hw-list">
          <li>We will never hold user funds, run a deposit address, or custody keys. If that ever changed it would be announced first and be opt-in.</li>
          <li>Every fee rate is published here and on the trade ticket. We will not raise a rate without notice, and the on-chain cap you approved cannot be exceeded by us at all.</li>
          <li>Every real-money post links to its on-chain record. We do not edit receipts, including our own.</li>
          <li>Demo is always labelled. We will not pass off simulated results as real.</li>
          <li>When something breaks, we say so in the app and in public, not quietly.</li>
        </ul>
        <p className="mt-3">If you take one thing from this page: your trust should rest on Hyperliquid&rsquo;s design and on your own wallet, not on us. We built Perped so that it has to be that way.</p>
        <p className="muted mt-3 text-[13px]">Perped is an independent builder on Hyperliquid, not affiliated with Hyperliquid Labs. Questions or something that looks wrong: message <a href="https://x.com/perped_" target="_blank" rel="noreferrer">@perped_ on X</a>.</p>
      </section>
    </main>
  );
}
