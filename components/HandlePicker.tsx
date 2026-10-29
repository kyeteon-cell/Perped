"use client";

import { useState } from "react";
import { useSession } from "@/lib/hooks/useSession";

/** First-run screen: choose a handle. Shown until the user has a profile. */
export function HandlePicker() {
  const { authedFetch, refreshMe, address } = useSession();
  const [handle, setHandle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await authedFetch("/api/me", { method: "POST", body: JSON.stringify({ handle: handle.toLowerCase() }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Something went wrong");
    await refreshMe();
  };

  return (
    <form onSubmit={submit} className="panel space-y-3 p-4">
      <h2 className="text-lg font-bold">Pick your handle</h2>
      <p className="muted text-sm">This is how you&apos;ll show up in the feed and on the leaderboard. Your trading wallet is ready: <span className="font-mono text-xs">{address?.slice(0, 6)}…{address?.slice(-4)}</span></p>
      <div className="flex items-center gap-2">
        <span className="muted">@</span>
        <input className="input" placeholder="yourname" value={handle} onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} maxLength={20} autoFocus />
      </div>
      {err && <p className="red text-sm">{err}</p>}
      <button className="btn btn-accent w-full" disabled={busy || handle.length < 3}>{busy ? "Saving…" : "Let's go"}</button>
    </form>
  );
}
