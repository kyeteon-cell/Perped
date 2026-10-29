"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { makeExchangeClient, approveBuilderFee } from "@/lib/hl-exchange";
import { getMaxBuilderFee } from "@/lib/hl-info";
import { BUILDER_ADDRESS, BUILDER_CONFIGURED, BUILDER_FEE_TENTHS_BPS, BUILDER_MAX_FEE_RATE } from "@/lib/config";

/**
 * One-time approval of the Perped builder fee. Hyperliquid requires the user to sign this
 * before any order can carry our builder code. Renders nothing once approved.
 */
export function BuilderApproval({ onApproved }: { onApproved?: () => void }) {
  const { address, walletClient } = useSession();
  const [approved, setApproved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !BUILDER_CONFIGURED) return;
    getMaxBuilderFee(address, BUILDER_ADDRESS).then((f) => setApproved(f >= BUILDER_FEE_TENTHS_BPS));
  }, [address]);

  if (!BUILDER_CONFIGURED || approved !== false || !walletClient) return null;

  const approve = async () => {
    setBusy(true);
    setErr(null);
    try {
      await approveBuilderFee(makeExchangeClient(walletClient));
      setApproved(true);
      onApproved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel space-y-2 p-4" style={{ borderColor: "var(--accent)" }}>
      <p className="text-sm font-semibold">One-time setup</p>
      <p className="muted text-sm">Approve a max {BUILDER_MAX_FEE_RATE} builder fee so Perped can route your trades. You sign once, can revoke anytime, and it only applies to trades placed here.</p>
      {err && <p className="red text-xs">{err}</p>}
      <button onClick={approve} disabled={busy} className="btn btn-accent w-full">{busy ? "Waiting for signature…" : `Approve ${BUILDER_MAX_FEE_RATE} fee`}</button>
    </div>
  );
}
