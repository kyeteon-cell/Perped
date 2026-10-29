"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { TradeTicket, type CopySeed } from "@/components/TradeTicket";
import { HandlePicker } from "@/components/HandlePicker";
import { useSession } from "@/lib/hooks/useSession";

function TradeInner() {
  const sp = useSearchParams();
  const { authenticated, address, profile, profileLoading } = useSession();
  const copy = sp.get("copy");
  const seed: CopySeed | undefined = copy
    ? {
        coin: sp.get("coin") ?? "SOL",
        side: (sp.get("side") as "long" | "short") ?? "long",
        leverage: Number(sp.get("lev") ?? 2),
        copiedFromId: Number(copy),
        handle: sp.get("from") ?? "someone",
      }
    : undefined;

  return (
    <>
      <Header title="Trade" />
      {authenticated && address && !profileLoading && !profile ? <HandlePicker /> : <TradeTicket seed={seed} />}
    </>
  );
}

export default function TradePage() {
  return (
    <Suspense fallback={<p className="muted text-sm">Loading…</p>}>
      <TradeInner />
    </Suspense>
  );
}
