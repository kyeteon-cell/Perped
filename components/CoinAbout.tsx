import { COIN_ABOUT, siteLabel } from "@/lib/coin-about";
import { Icon, I } from "./ui";

/** What the coin is, in a sentence or two, with a link out to the project's own site. Hidden for coins we have no blurb for yet. */
export function CoinAbout({ coin }: { coin: string }) {
  const a = COIN_ABOUT[coin];
  if (!a?.about) return null;
  return (
    <section className="coin-about">
      <div className="coin-about-head">
        <small>About</small>
        <b>{a.name}</b>
      </div>
      <p>{a.about}</p>
      {a.url && (
        <a className="coin-about-link" href={a.url} target="_blank" rel="noopener noreferrer nofollow">
          {siteLabel(a.url)}
          <Icon d={I.ext} size={14} />
        </a>
      )}
    </section>
  );
}

/** Project name for the market header, e.g. "Ethereum". */
export function coinName(coin: string) {
  return COIN_ABOUT[coin]?.name ?? null;
}
