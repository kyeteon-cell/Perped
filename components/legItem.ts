import type { FeedRow } from "@/lib/feed";

/** Build the minimal feed item a quick sheet needs from a battle leg (arena rows and battle pages). */
export function legItem(p: { id: number; coin: string; side: "long" | "short"; leverage: number }, author: { handle: string; avatarUrl: string | null }): FeedRow {
  return { post: { id: p.id, kind: "trade", coin: p.coin, side: p.side, leverage: p.leverage, status: "open" }, author } as unknown as FeedRow;
}
