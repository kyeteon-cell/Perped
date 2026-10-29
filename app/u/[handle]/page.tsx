"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { Header } from "@/components/Header";
import { FeedPost, type FeedItem } from "@/components/FeedPost";
import { useMids } from "@/lib/hooks/useMids";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { makeExchangeClient, closePosition } from "@/lib/hl-exchange";
import { fmtUsd, fmtPct } from "@/lib/format";
import type { User, Stats } from "@/lib/schema";
import type { AssetPosition } from "@/lib/hl-info";

type ProfileRes = { user: User; stats: Stats | null; followers: number; following: number; positions: AssetPosition[]; accountValue: number | null };

export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const { data, mutate } = useSWR<ProfileRes>(`/api/profile/${handle}`, { refreshInterval: 20_000 });
  const { data: feed, mutate: mutateFeed } = useSWR<{ posts: FeedItem[] }>(`/api/posts?handle=${handle}`);
  const { mids } = useMids();
  const { profile, walletClient, authedFetch } = useSession();
  const { markets } = useMarkets();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isMe = profile?.handle === handle;
  const s = data?.stats;

  const close = async (p: AssetPosition) => {
    if (!walletClient) return;
    const asset = markets.find((m) => m.name === p.coin);
    const mid = mids[p.coin];
    if (!asset || !mid) return setErr("Market data not ready");
    setBusy(p.coin);
    setErr(null);
    const res = await closePosition(makeExchangeClient(walletClient), asset, Number(p.szi), mid);
    if (!res.ok) {
      setBusy(null);
      return setErr(res.error ?? "Close failed");
    }
    // Mark our open posts on this coin as closed at the fill price.
    const exitPx = res.avgPx ?? mid;
    const mine = (feed?.posts ?? []).filter((i) => i.post.coin === p.coin && i.post.status === "open");
    await Promise.all(mine.map((i) => authedFetch(`/api/posts/${i.post.id}/close`, { method: "POST", body: JSON.stringify({ exitPx }) })));
    setBusy(null);
    mutate();
    mutateFeed();
  };

  if (!data) return (<><Header title={`@${handle}`} /><p className="muted text-sm">Loading…</p></>);
  if ("error" in (data as unknown as Record<string, unknown>)) return (<><Header title="Not found" /><p className="muted">No trader with that handle.</p></>);

  return (
    <>
      <Header title={`@${data.user.handle}`} />

      <section className="panel p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-14 place-items-center rounded-full text-xl font-black" style={{ background: "var(--panel-2)" }}>{data.user.handle.slice(0, 2).toUpperCase()}</div>
          <div className="flex-1">
            <div className="muted text-xs">{data.followers} followers · {data.following} following</div>
            {data.user.bio && <p className="mt-1 text-sm">{data.user.bio}</p>}
            <p className="muted mt-1 font-mono text-[11px]">{data.user.address.slice(0, 8)}…{data.user.address.slice(-6)} · verified on-chain ✓</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="PnL 7d" value={fmtUsd(Number(s?.realizedPnl7d ?? 0), { sign: true, compact: true })} tone={Number(s?.realizedPnl7d ?? 0)} />
          <Stat label="PnL all" value={fmtUsd(Number(s?.realizedPnlAll ?? 0), { sign: true, compact: true })} tone={Number(s?.realizedPnlAll ?? 0)} />
          <Stat label="Win rate" value={fmtPct(Number(s?.winRate ?? 0), 0)} />
        </div>
        {isMe && data.accountValue != null && <p className="muted mt-3 text-center text-xs">Account value {fmtUsd(data.accountValue)} · deposit USDC to your wallet address above (Arbitrum → Hyperliquid bridge)</p>}
      </section>

      {data.positions.length > 0 && (
        <section className="mt-3 space-y-2">
          <h2 className="muted text-xs font-semibold uppercase tracking-wide">Open positions</h2>
          {data.positions.map((p) => {
            const szi = Number(p.szi);
            const mid = mids[p.coin];
            const upnl = Number(p.unrealizedPnl);
            return (
              <div key={p.coin} className="panel flex items-center justify-between p-3">
                <div>
                  <div className="font-bold"><span className={szi > 0 ? "green" : "red"}>{szi > 0 ? "▲" : "▼"}</span> {p.coin} <span className="muted text-xs">{p.leverage.value}×</span></div>
                  <div className="muted text-xs">{Math.abs(szi)} @ {p.entryPx ? `$${Number(p.entryPx).toLocaleString()}` : "—"} · mark {mid ? `$${mid.toLocaleString()}` : "…"}</div>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold ${upnl >= 0 ? "green" : "red"}`}>{fmtUsd(upnl, { sign: true })}</div>
                  {isMe && <button onClick={() => close(p)} disabled={busy === p.coin} className="btn btn-ghost mt-1 !px-3 !py-1 text-xs">{busy === p.coin ? "Closing…" : "Close"}</button>}
                </div>
              </div>
            );
          })}
          {err && <p className="red text-xs">{err}</p>}
        </section>
      )}

      <section className="mt-4 space-y-3">
        <h2 className="muted text-xs font-semibold uppercase tracking-wide">Trades</h2>
        {(feed?.posts ?? []).length === 0 && <p className="muted text-sm">No trades posted yet.</p>}
        {(feed?.posts ?? []).map((item) => <FeedPost key={item.post.id} item={item} mid={mids[item.post.coin]} onChanged={() => mutateFeed()} />)}
      </section>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="rounded-xl p-2" style={{ background: "var(--panel-2)" }}>
      <div className="muted text-[11px]">{label}</div>
      <div className={`font-mono text-sm font-bold ${tone == null ? "" : tone >= 0 ? "green" : "red"}`}>{value}</div>
    </div>
  );
}
