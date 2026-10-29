"use client";

import useSWR from "swr";
import type { PerpAsset } from "@/lib/hl-info";

export type Market = PerpAsset & { mid: number };

export function useMarkets() {
  const { data, error, isLoading } = useSWR<{ markets: Market[] }>("/api/markets", { refreshInterval: 60_000 });
  return { markets: data?.markets ?? [], error, isLoading };
}
