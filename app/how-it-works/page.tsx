import Link from "next/link";
import { BUILDER_FEE_STANDARD_TENTHS_BPS, BUILDER_FEE_REFERRED_TENTHS_BPS, BUILDER_FEE_TOP_TENTHS_BPS, BUILDER_MAX_FEE_TENTHS_BPS, TOP_TIER_RANK, REFERRAL_SHARE_PCT, REFERRAL_TOP_SHARE_PCT, REFERRAL_TOP_THRESHOLD, HL_NETWORK } from "@/lib/config";
import { tenthsBpsToLabel } from "@/lib/fees";

export const metadata = { title: "How Perped works · where your money is, fees, risks" };

const F = (t: number) => tenthsBpsToLabel(t);

/** /how-it-works — the trust page. Plain answers to "is this a scam", "where is my money", "what does it cost". */
export default function HowItWorks() {
  const sections: { id: string; title: string; body: React.ReactNode }[] = [
    {
      id: "what", title: "What Perped is",
      body: (
        <>
          <p>Perped is a social front-end for <b>Hyperliquid</b>, the on-chain perpetuals exchange. Every trade you make here is placed on Hyperliquid, in your own account, under your own wallet. Perped adds the social layer: your position becomes a post, other people can copy it or fade it (take the other side), and the price decides who was right.</p>
          <p className="mt-2">Perped is not an exchange, a broker, or a fund. We never take a position against you and we never hold your money.</p>
        </>
      ),
    },
    {
      id: "money", title: "Where your money is",
      body: (
        <ul className="hw-list">
          <li><b>Your funds stay on Hyperliquid, in your wallet&rsquo;s account.</b> Perped has no deposit address of its own and no ability to move your funds. The only thing Perped can do with your wallet&rsquo;s permission is place and cancel orders for you — the same permission any Hyperliquid front-end asks for.</li>
          <li><b>Deposits and withdrawals go directly between your wallet and Hyperliquid</b> (USDC on Arbitrum). Perped just links you to them.</li>
          <li><b>Every real trade is verifiable.</b> Tap &ldquo;Verified on Hyperliquid&rdquo; on any real-money post and you&rsquo;ll see that account&rsquo;s fills on Hyperliquid&rsquo;s own explorer. Nobody can edit a receipt.</li>
          <li><b>Demo money is simulated.</b> Demo and guest accounts trade $10,000 of practice money at live Hyperliquid prices. Nothing is placed on-chain and nothing can be withdrawn. Demo posts are always marked <span className="demo-tag">Demo</span>.</li>
          {HL_NETWORK !== "mainnet" && <li><b>Real-money trading is currently on Hyperliquid&rsquo;s testnet</b> while we finish testing. Prices shown are mainnet; orders go to testnet. We&rsquo;ll say clearly when mainnet is on.</li>}
        </ul>
      ),
    },
    {
      id: "fees", title: "What it costs",
      body: (
        <>
          <p>Hyperliquid charges its own trading fees (see their docs). On top of that, Perped adds a small <b>builder fee</b> per fill, which is how Perped makes money. It is shown on the trade ticket before you confirm, and is collected by Hyperliquid, not by us directly.</p>
          <table className="hw-table mt-3">
            <tbody>
              <tr><td>Standard</td><td className="mono">{F(BUILDER_FEE_STANDARD_TENTHS_BPS)}</td><td>of notional, per fill</td></tr>
              <tr><td>Joined through an invite</td><td className="mono">{F(BUILDER_FEE_REFERRED_TENTHS_BPS)}</td><td>for life</td></tr>
              <tr><td>Top {TOP_TIER_RANK} on the leaderboard</td><td className="mono">{F(BUILDER_FEE_TOP_TENTHS_BPS)}</td><td>while you&rsquo;re ranked</td></tr>
              <tr><td>Hard cap you approve once</td><td className="mono">{F(BUILDER_MAX_FEE_TENTHS_BPS)}</td><td>Perped can never charge more</td></tr>
            </tbody>
          </table>
          <p className="mt-3">Example: a $250 margin trade at 40× is $10,000 of notional. At {F(BUILDER_FEE_STANDARD_TENTHS_BPS)} the Perped fee is <span className="mono">${((10000 * BUILDER_FEE_STANDARD_TENTHS_BPS) / 100000).toFixed(2)}</span> to open and the same to close.</p>
          <p className="mt-2"><b>Invites.</b> Share a challenge or invite link and anyone who joins through it pays the reduced rate. You earn {REFERRAL_SHARE_PCT}% of the Perped fee on everything they trade, rising to {REFERRAL_TOP_SHARE_PCT}% once {REFERRAL_TOP_THRESHOLD} of your invitees are active. Earnings show in Settings and are paid in USDC.</p>
          <p className="mt-2">Demo trading is free.</p>
        </>
      ),
    },
    {
      id: "risk", title: "The risks, plainly",
      body: (
        <ul className="hw-list">
          <li><b>Leverage cuts both ways.</b> At 40×, a 2.5% move against you is a 100% loss of your margin — the position is liquidated by Hyperliquid and the margin is gone. Most people should start far lower.</li>
          <li><b>Copying someone is not advice.</b> Leaderboards show past results. A 10-win streak says nothing about the next trade.</li>
          <li><b>Crypto perps are unregulated in most places and prohibited in some.</b> It is your responsibility to know whether you may use Hyperliquid where you live. Perped is not available to residents of the United States, the United Kingdom, Ontario, or any sanctioned jurisdiction.</li>
          <li><b>Software has bugs.</b> Perped is new. Trade with amounts you can afford to lose, check the fill on Hyperliquid, and tell us if anything looks wrong.</li>
          <li><b>Your wallet is your account.</b> Lose the keys, lose the account. Perped cannot recover it.</li>
        </ul>
      ),
    },
    {
      id: "demo", title: "Demo vs real",
      body: (
        <ul className="hw-list">
          <li><b>Guest, X, Google or email sign-in</b> gives you a demo account: $10,000 of practice money, real prices, public posts, streaks and leaderboards. No wallet needed.</li>
          <li><b>Connect a wallet</b> (Settings → Go live) to trade real money. Your demo history stays; real posts are marked <span className="real-tag">Real</span> and the leaderboard can be filtered to real accounts only.</li>
          <li>Demo and real trades are never mixed in a ranking without being labelled.</li>
        </ul>
      ),
    },
    {
      id: "battles", title: "Battles, duels and ranks",
      body: (
        <ul className="hw-list">
          <li><b>A battle starts when someone fades a trade</b> (takes the other side of the same coin). It settles when both positions are closed: the higher leverage-adjusted ROI wins; under 0.5% apart is a draw. A liquidation loses on the spot. If one side closes and the other sits open for 24 hours, the open side is marked at the live price.</li>
          <li><b>A duel</b> is a timed head-to-head you accept by link: whoever is ahead when the clock runs out wins.</li>
          <li><b>XP never goes down.</b> Battle win +120 (+60 for a 20%+ margin, +80 for beating someone two ranks above you), loss +25, draw +50. Duel +150 / +30. One-hour call +15 / +5. Closed trade +10 / +3. Liquidations earn nothing.</li>
          <li><b>Ranks:</b> Paper Hands → Degen (200) → Wick Hunter (600) → Knife Catcher (1,400) → Whale Fader (3,000) → Liquidator (6,000) → Market Maker (11,000) → Perpetrator (20,000). Your rank shows next to your name everywhere. Demo and real accounts earn XP the same way; the leaderboard still separates them.</li>
        </ul>
      ),
    },
    {
      id: "who", title: "Who runs this",
      body: (
        <p>Perped is an independent builder on Hyperliquid, not affiliated with Hyperliquid Labs. Questions, bugs, or something that looks wrong: message <a href="https://x.com/perped" target="_blank" rel="noreferrer">@perped on X</a>. Our fee rate and referral terms are public on this page and in the code that runs the app.</p>
      ),
    },
  ];
  return (
    <main className="px-5 pb-12 pt-6">
      <Link href="/" className="when">← Back</Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">How Perped works</h1>
      <p className="muted mt-1">Where your money is, what it costs, and what can go wrong. No small print.</p>
      <div className="mt-4 flex flex-wrap gap-1.5">{sections.map((s) => <a key={s.id} href={`#${s.id}`} className="chip" style={{ padding: "6px 10px", fontSize: 12 }}>{s.title}</a>)}</div>
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="hw mt-6">
          <h2 className="text-lg font-bold">{s.title}</h2>
          <div className="mt-2 text-[14px] leading-relaxed">{s.body}</div>
        </section>
      ))}
    </main>
  );
}
