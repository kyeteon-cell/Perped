"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";
import { useMarkets } from "@/lib/hooks/useMarkets";
import { useMids } from "@/lib/hooks/useMids";
import { Avatar, CoinMark, Icon, I } from "@/components/ui";
import type { FeedRow } from "@/lib/feed";
import { fmtPct } from "@/lib/format";

type Mode = "post" | "call" | "poll";

function ComposeInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { profile, authedFetch, authenticated, login } = useSession();
  const { markets } = useMarkets();
  const { mids } = useMids();
  const [mode, setMode] = useState<Mode>((sp.get("mode") as Mode) || "post");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // post
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState<number | null>(sp.get("attach") ? Number(sp.get("attach")) : null);
  const { data: myOpen } = useSWR<{ posts: FeedRow[] }>(profile ? `/api/posts?handle=${profile.handle}&kind=trade&status=open` : null);
  // call
  const [coin, setCoin] = useState(sp.get("coin") ?? "SOL");
  const [dir, setDir] = useState<"long" | "short">("long");
  const [target, setTarget] = useState("");
  const [invalid, setInvalid] = useState("");
  const [hours, setHours] = useState(72);
  const [back, setBack] = useState(true);
  // poll
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["Yes", "No"]);
  const [closeH, setCloseH] = useState(24);
  const [settleOn, setSettleOn] = useState(false);
  const [settlePx, setSettlePx] = useState("");
  const [settleOp, setSettleOp] = useState<"gte" | "lte">("gte");

  const mid = mids[coin] ?? markets.find((m) => m.name === coin)?.mid ?? 0;
  const tgt = Number(target), inv = Number(invalid);
  const tgtPct = mid && tgt ? ((tgt - mid) / mid) * 100 : 0;
  const invPct = mid && inv ? ((inv - mid) / mid) * 100 : 0;
  const callValid = tgt > 0 && (dir === "long" ? tgt > mid : tgt < mid) && (!inv || (dir === "long" ? inv < mid : inv > mid));

  const publish = async () => {
    if (!authenticated) return login();
    if (!profile) return setErr("Pick a handle first.");
    setErr(null);
    setBusy(true);
    let payload: Record<string, unknown>;
    if (mode === "post") {
      if (!body.trim()) { setBusy(false); return setErr("Write something."); }
      payload = { kind: "text", body: body.trim(), coin: attach ? myOpen?.posts.find((p) => p.post.id === attach)?.post.coin : undefined };
    } else if (mode === "call") {
      if (!callValid) { setBusy(false); return setErr(dir === "long" ? "Target must be above the current price and invalidation below." : "Target must be below the current price and invalidation above."); }
      payload = { kind: "call", coin, side: dir, targetPx: tgt, invalidPx: inv || undefined, deadline: new Date(Date.now() + hours * 3600_000).toISOString(), body: body.trim() || undefined };
    } else {
      const clean = opts.map((o) => o.trim()).filter(Boolean);
      if (!q.trim() || clean.length < 2) { setBusy(false); return setErr("A question and at least two options."); }
      payload = { kind: "poll", body: q.trim(), options: clean, closesAt: new Date(Date.now() + closeH * 3600_000).toISOString(), settle: settleOn && Number(settlePx) > 0 ? { coin, op: settleOp, px: Number(settlePx) } : null };
    }
    const r = await authedFetch("/api/posts", { method: "POST", body: JSON.stringify(payload) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Couldn't post");
    if (mode === "call" && back) return router.push(`/trade?coin=${coin}&side=${dir}&backs=${j.post.id}`);
    router.push("/");
  };

  const top = ["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE"];

  return (
    <div className="fade-in" data-tint="brand">
      <header className="hairline flex items-center justify-between gap-2 px-4 py-3">
        <button className="chip" onClick={() => router.back()}>Cancel</button>
        <div className="modes" style={{ display: "inline-grid", gridTemplateColumns: "repeat(3, auto)", padding: 3 }}>
          {(["post", "call", "poll"] as Mode[]).map((m) => <button key={m} className={`capitalize ${mode === m ? "on" : ""}`} style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => setMode(m)}>{m}</button>)}
        </div>
        <button className="copy" onClick={publish} disabled={busy}>{busy ? "…" : mode === "post" ? "Post" : mode === "call" ? "Publish call" : "Start poll"}</button>
      </header>

      <div className="px-5 py-4">
        {profile && <div className="mb-3.5 flex items-center gap-3"><Avatar handle={profile.handle} url={profile.avatarUrl} /><div><div className="name">{profile.handle}</div><div className="when">Everyone can see this</div></div></div>}

        {mode === "post" && (
          <>
            <textarea className="w-full resize-none border-0 bg-transparent p-0 text-[17px] leading-relaxed outline-none" rows={5} placeholder="What are you seeing?" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
            {attach && myOpen?.posts.find((p) => p.post.id === attach) && (
              <div className="card mt-3 flex items-center gap-3 p-3.5">
                <CoinMark coin={myOpen.posts.find((p) => p.post.id === attach)!.post.coin!} size="sm" />
                <div className="flex-1"><b>{myOpen.posts.find((p) => p.post.id === attach)!.post.coin} {myOpen.posts.find((p) => p.post.id === attach)!.post.side} {myOpen.posts.find((p) => p.post.id === attach)!.post.leverage}×</b><div className="when">Attached · live</div></div>
                <button className="chip" onClick={() => setAttach(null)}>Remove</button>
              </div>
            )}
            {!attach && (myOpen?.posts.length ?? 0) > 0 && (
              <div className="seg mt-3">{myOpen!.posts.slice(0, 4).map((p) => <button key={p.post.id} className="chip" onClick={() => setAttach(p.post.id)}>Attach {p.post.coin} {p.post.side}</button>)}</div>
            )}
          </>
        )}

        {mode === "call" && (
          <>
            <div className="eyebrow mb-2">Market</div>
            <div className="seg">{[...new Set([coin, ...top])].map((c) => <button key={c} className={`chip ${c === coin ? "on" : ""}`} onClick={() => setCoin(c)}><CoinMark coin={c} size="xs" />{c}</button>)}</div>
            <div className="mono when mt-2">now {mid ? mid.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "…"}</div>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5"><button className={`btn ${dir === "long" ? "long" : ""}`} style={{ padding: 12 }} onClick={() => setDir("long")}>Up</button><button className={`btn ${dir === "short" ? "short" : ""}`} style={{ padding: 12 }} onClick={() => setDir("short")}>Down</button></div>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <div><div className="eyebrow mb-2">Target</div><input className="field mono" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={mid ? (dir === "long" ? (mid * 1.1).toFixed(2) : (mid * 0.9).toFixed(2)) : ""} />{tgt > 0 && <div className={`mt-1.5 text-xs font-semibold ${tgtPct >= 0 ? "green" : "red"}`}>{fmtPct(tgtPct, 1)} from here</div>}</div>
              <div><div className="eyebrow mb-2">Invalid {dir === "long" ? "below" : "above"}</div><input className="field mono" inputMode="decimal" value={invalid} onChange={(e) => setInvalid(e.target.value)} placeholder="optional" />{inv > 0 && <div className={`mt-1.5 text-xs font-semibold ${invPct >= 0 ? "green" : "red"}`}>{fmtPct(invPct, 1)}</div>}</div>
            </div>
            <div className="eyebrow mb-2 mt-3.5">Deadline</div>
            <div className="seg">{[[24, "24 h"], [72, "3 days"], [168, "1 week"]].map(([h, l]) => <button key={h} className={`chip ${hours === h ? "on" : ""}`} onClick={() => setHours(h as number)}>{l}</button>)}</div>
            <textarea className="field mt-3.5 resize-none" rows={3} placeholder="Why? One or two sentences." value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} />
            <label className="mt-3.5 flex items-center gap-2.5 text-sm font-semibold"><input type="checkbox" checked={back} onChange={(e) => setBack(e.target.checked)} style={{ accentColor: "var(--brand)", width: 18, height: 18 }} />Back it with a trade<span className="when ml-auto">Opens the ticket after · earns Backed</span></label>
            <div className="warn mt-3">Calls resolve automatically against Hyperliquid prices. Once posted they can't be edited or deleted; they count toward your hit rate.</div>
          </>
        )}

        {mode === "poll" && (
          <>
            {!profile?.verified && <div className="warn mb-3">Polls are for verified traders: 10+ closed trades and a linked X account. You can still draft one.</div>}
            <textarea className="w-full resize-none border-0 bg-transparent p-0 text-[17px] font-bold leading-relaxed outline-none" rows={2} placeholder="Ask a question" value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} />
            <div className="eyebrow mb-2 mt-3.5">Options</div>
            {opts.map((o, i) => <input key={i} className="field mb-2" value={o} onChange={(e) => setOpts((a) => a.map((x, j) => (j === i ? e.target.value : x)))} maxLength={40} />)}
            {opts.length < 4 && <button className="chip" onClick={() => setOpts((a) => [...a, ""])}><Icon d={I.plus} size={14} />Add option</button>}
            <div className="eyebrow mb-2 mt-4">Closes</div>
            <div className="seg">{[[6, "6 h"], [24, "24 h"], [72, "3 days"], [168, "1 week"]].map(([h, l]) => <button key={h} className={`chip ${closeH === h ? "on" : ""}`} onClick={() => setCloseH(h as number)}>{l}</button>)}</div>
            <label className="mt-3.5 flex items-center gap-2.5 text-sm font-semibold"><input type="checkbox" checked={settleOn} onChange={(e) => setSettleOn(e.target.checked)} style={{ accentColor: "var(--brand)", width: 18, height: 18 }} />Settle on price<span className="when ml-auto">option 1 wins if true</span></label>
            {settleOn && (
              <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="seg">{top.map((c) => <button key={c} className={`chip ${c === coin ? "on" : ""}`} onClick={() => setCoin(c)}>{c}</button>)}</div>
                <button className="chip" onClick={() => setSettleOp(settleOp === "gte" ? "lte" : "gte")}>{settleOp === "gte" ? "≥" : "≤"}</button>
                <input className="field mono" inputMode="decimal" placeholder={mid ? String(mid) : "price"} value={settlePx} onChange={(e) => setSettlePx(e.target.value)} />
              </div>
            )}
          </>
        )}
        {err && <p className="red mt-3 text-sm">{err}</p>}
      </div>
    </div>
  );
}

export default function ComposePage() {
  return <Suspense fallback={<p className="muted p-5 text-sm">Loading…</p>}><ComposeInner /></Suspense>;
}
