"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { Avatar, CoinMark } from "./ui";

const COINS = ["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE"];

/** One-tap composer at the top of the feed: type, optionally tag a coin, post. Calls and polls live on /compose. */
export function QuickPost({ onPosted }: { onPosted: () => void }) {
  const { authenticated, login, profile, authedFetch } = useSession();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [coin, setCoin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  if (!authenticated || !profile) return null;

  const post = async () => {
    const text = body.trim(); if (!text) return;
    setBusy(true); setErr(null);
    // Tag the coin by cashtag if none chosen (e.g. "$SOL looks heavy")
    const tag = coin ?? (text.match(/\$([A-Za-z]{2,10})\b/)?.[1]?.toUpperCase() ?? undefined);
    const r = await authedFetch("/api/posts", { method: "POST", body: JSON.stringify({ kind: "text", body: text, coin: tag }) });
    setBusy(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); return setErr(j.error ?? "Couldn't post"); }
    setBody(""); setCoin(null); setOpen(false); onPosted();
  };

  return (
    <div className={`qp ${open ? "open" : ""}`}>
      <div className="flex items-start gap-3">
        <Avatar handle={profile.handle} url={profile.avatarUrl} size={36} link={false} />
        <div className="min-w-0 flex-1">
          <textarea ref={ta} className="qp-ta" rows={open ? 3 : 1} placeholder="What's your read? $BTC, @someone…" value={body} maxLength={1000}
            onFocus={() => setOpen(true)} onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post(); }} />
          {open && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COINS.map((c) => <button key={c} type="button" className={`chip ${coin === c ? "on" : ""}`} style={{ padding: "5px 9px", fontSize: 12 }} onClick={() => setCoin(coin === c ? null : c)}><CoinMark coin={c} size="xs" />{c}</button>)}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <Link href="/compose?mode=call" className="chip" style={{ padding: "7px 11px", fontSize: 12 }}>Make a call</Link>
                <Link href="/compose?mode=poll" className="chip" style={{ padding: "7px 11px", fontSize: 12 }}>Poll</Link>
                <span className="when ml-auto">{body.length > 800 ? `${1000 - body.length}` : ""}</span>
                <button type="button" className="chip" onClick={() => { setOpen(false); setBody(""); setCoin(null); }}>Cancel</button>
                <button type="button" className="copy" disabled={busy || !body.trim()} onClick={post}>{busy ? "…" : "Post"}</button>
              </div>
              {err && <p className="red mt-2 text-xs">{err}</p>}
            </>
          )}
        </div>
      </div>
      {!authenticated && <button className="absolute inset-0" onClick={() => login()} aria-label="Log in to post" />}
    </div>
  );
}
