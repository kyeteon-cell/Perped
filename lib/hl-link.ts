// Client-safe pieces of the Hyperliquid import: the message a trader signs, and the record's shape.
export type HlRecord = {
  address: string;
  pnlAll: number; pnl30d: number; pnl7d: number;
  volumeAll: number; volume30d: number;
  accountValue: number;
  since: number | null; // first point in the account's history (ms)
  closes: number; wins: number; winRate: number; // from the most recent fills Hyperliquid returns (up to 2,000)
  best: { coin: string; pnl: number; time: number } | null;
  worst: { coin: string; pnl: number; time: number } | null;
  topCoins: { coin: string; volume: number }[];
  updatedAt: number;
};

export const linkMessage = (address: string, handle: string, issued: string) =>
  `Perped: link Hyperliquid wallet ${address.toLowerCase()} to @${handle}\nIssued: ${issued}\nThis only proves you own the wallet. It can't move funds.`;
