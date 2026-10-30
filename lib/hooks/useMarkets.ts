"use client";

import useSWR from "swr";
import type { MarketRow } from "@/lib/hl-info";

export type Market = MarketRow;

export function useMarkets() {
  const { data, error, isLoading } = useSWR<{ markets: MarketRow[] }>("/api/markets", { refreshInterval: 60_000 });
  return { markets: data?.markets ?? [], error, isLoading };
}
