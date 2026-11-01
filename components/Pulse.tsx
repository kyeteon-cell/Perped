"use client";

import { Glyph } from "./Glyph";
import { Tug } from "./Tug";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fmtPct, fmtUsd, pnlForPosition } from "@/lib/format";
import { Avatar, CoinMark, ticker } from "./ui";
import type { Pulse as PulseData, PulseTrader } from "@/app/api/pulse/route";

/* ---------- helpers ---------- */

function live(t: PulseTrader, mids: Record<string, number>, coin: string) {
  const mid = mids[coin] ?? t.entryPx;
  const { pnl, pct } = pnlForPosition(t.side, t.entryPx, mid, t.size);
  return { pnl, pct, roi: pct * t.leverage };
}

/** A number that animates towards its target and flashes on change. */
function Ticking({ value, fmt, className }: { value: number; fmt: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<"" | "fu" | "fd">("");
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    setFlash(value > prev.current ? "fu" : "fd");
    const from = prev.current, to = value, start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 500);
      setShown(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    prev.current = value;
    const t = setTimeout(() => setFlash(""), 600);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [value]);
  return <span className={`mono tabular-nums ${className ?? ""} ${flash}`}>{fmt(shown)}</span>;
}

function Side({ side }: { side: "long" | "short" }) {
  return <span className={`lbl ${side}`} style={{ padding: "2px 8px", fontSize: 10 }}><i />{side === "long" ? "Long" : "Short"}</span>;
}

/* ---------- cards ---------- */

function DuelCard({ d, mids }: { d: PulseData["duels"][number]; mids: Record<string, number> }) {
  const a = live(d.a, mids, d.coin), b = live(d.b, mids, d.coin);
  const total = Math.abs(a.roi) + Math.abs(b.roi) || 1;
  const aShare = Math.max(8, Math.min(92, 50 + ((a.roi - b.roi) / total) * 50));
  const left = Math.max(0, new Date(d.settlesAt).getTime() - Date.now());
  const leftTxt = left > 86_400_000 ? `${Math.round(left / 86_400_000)}d` : left > 3_600_000 ? `${Math.round(left / 3_600_000)}h` : `${Math.max(1, Math.round(left / 60_000))}m`;
  const leader = a.roi >= b.roi ? d.a : d.b;
  return (
    <Link href={`/post/${d.a.postId}`} className="pcard duel-live">
      <div className="pc-head"><span className="pc-tag gold"><Glyph n="swords" /> Duel · {ticker(d.coin)}</span><span className="when">{fmtUsd(d.stakeUsd, { compact: true })} · {leftTxt} left</span></div>
      <div className="duel-body" style={{ marginTop: 12 }}>
        <div className="duelist">
          <div className={`avring ${a.roi >= b.roi ? "lead" : ""}`}><Avatar handle={d.a.handle} url={d.a.avatarUrl} size={44} link={false} /></div>
          <div className="name mt-1.5 truncate text-[13px]">{d.a.handle}{d.a.isDemo && <span className="demo-tag ml-1">D</span>}</div>
          <Side side={d.a.side} />
          <Ticking value={a.roi} fmt={(n) => fmtPct(n, 1)} className={`block text-lg font-bold ${a.roi >= 0 ? "green" : "red"}`} />
        </div>
        <div className="duel-mid">
          <div className="vs">VS</div>
          <Tug share={aShare} left={d.a.side} right={d.b.side} />
          <div className="when text-[11px]">{leader.handle} leads</div>
        </div>
        <div className="duelist">
          <div className={`avring ${b.roi > a.roi ? "lead" : ""}`}><Avatar handle={d.b.handle} url={d.b.avatarUrl} size={44} link={false} /></div>
          <div className="name mt-1.5 truncate text-[13px]">{d.b.handle}{d.b.isDemo && <span className="demo-tag ml-1">D</span>}</div>
          <Side side={d.b.side} />
          <Ticking value={b.roi} fmt={(n) => fmtPct(n, 1)} className={`block text-lg font-bold ${b.roi >= 0 ? "green" : "red"}`} />
        </div>
      </div>
    </Link>
  );
}

function BoardCard({ title, tag, rows, mids, up }: { title: string; tag: string; rows: PulseTrader[]; mids: Record<string, number>; up: boolean }) {
  return (
    <div className={`pcard board ${up ? "up" : "down"}`}>
      <div className="pc-head"><span className={`pc-tag ${up ? "green" : "red"}`}>{up ? "▲" : "▼"} {title}</span><span className="when">{tag}</span></div>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((t, i) => {
          const l = live(t, mids, t.coin);
          const w = Math.min(100, Math.abs(l.roi));
          return (
            <Link key={t.postId} href={`/post/${t.postId}`} className="brow" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="rk">{i + 1}</span>
              <Avatar handle={t.handle} url={t.avatarUrl} size={26} link={false} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13px]"><b className="truncate">{t.handle}</b>{t.isDemo && <span className="demo-tag">Demo</span>}<CoinMark coin={t.coin} size="xs" /><span className="muted">{t.leverage}×</span></span>
                <span className="bbar"><i style={{ width: `${w}%`, background: l.roi >= 0 ? "var(--green)" : "var(--red)" }} /></span>
              </span>
              <Ticking value={l.roi} fmt={(n) => fmtPct(n, 1)} className={`text-[14px] font-bold ${l.roi >= 0 ? "green" : "red"}`} />
            </Link>
          );
        })}
        {!rows.length && <div className="muted py-4 text-center text-sm">Nothing open yet</div>}
      </div>
    </div>
  );
}

function FadeCard({ f, mids }: { f: PulseData["fades"][number]; mids: Record<string, number> }) {
  const fl = live(f.fader, mids, f.coin), tl = live(f.target, mids, f.coin);
  const faderWinning = fl.roi > tl.roi;
  return (
    <Link href={`/battle/${f.fader.postId}`} className={`pcard fadec ${faderWinning ? "fader-wins" : "target-wins"}`}>
      <div className="pc-head"><span className="pc-tag violet">Fade · {ticker(f.coin)}</span><span className="when">{faderWinning ? "fader winning" : "getting perped"}</span></div>
      <div className="mt-3 flex items-center gap-3">
        <div className="text-center">
          <div className={`avring ${faderWinning ? "lead" : "losing"}`}><Avatar handle={f.fader.handle} url={f.fader.avatarUrl} size={40} link={false} /></div>
          <div className="mt-1 truncate text-[12px] font-bold">{f.fader.handle}</div>
          <Ticking value={fl.roi} fmt={(n) => fmtPct(n, 1)} className={`block text-[15px] font-bold ${fl.roi >= 0 ? "green" : "red"}`} />
        </div>
        <div className="flex-1 text-center">
          <div className="muted text-[11px]">faded</div>
          <div className="arrow">→</div>
          <div className="muted text-[11px]"><Side side={f.fader.side} /> vs <Side side={f.target.side} /></div>
        </div>
        <div className="text-center">
          <div className={`avring ${faderWinning ? "losing" : "lead"}`}><Avatar handle={f.target.handle} url={f.target.avatarUrl} size={40} link={false} /></div>
          <div className="mt-1 truncate text-[12px] font-bold">{f.target.handle}</div>
          <Ticking value={tl.roi} fmt={(n) => fmtPct(n, 1)} className={`block text-[15px] font-bold ${tl.roi >= 0 ? "green" : "red"}`} />
        </div>
      </div>
    </Link>
  );
}

function StreakCard({ s }: { s: PulseData["streaks"] }) {
  return (
    <div className="pcard streak">
      <div className="pc-head"><span className="pc-tag brand"><Glyph n="flame" /> On a streak</span><span className="when">calls in a row</span></div>
      <div className="mt-3 flex flex-col gap-2">
        {s.map((r, i) => (
          <Link key={r.handle} href={`/u/${r.handle}`} className="brow" style={{ animationDelay: `${i * 80}ms` }}>
            <Avatar handle={r.handle} url={r.avatarUrl} size={26} link={false} />
            <b className="flex-1 truncate text-[13px]">{r.handle}</b>
            <span className="flames">{Array.from({ length: Math.min(5, r.streak) }, (_, i) => <Glyph key={i} n="flame" tone="gold" />)}<b className="mono ml-1">{r.streak}</b></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---------- the strip ---------- */

/**
 * "Pulse": the live, animated strip at the top of Home. Who's duelling, who's up, who's down,
 * who faded whom and who's winning that, who's on a streak. Numbers tick with every price update,
 * the rail auto-advances every few seconds and pauses while you're touching it.
 */
export function Pulse({ mids }: { mids: Record<string, number> }) {
  const { data } = useSWR<PulseData>("/api/pulse", { refreshInterval: 30_000 });
  const rail = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const [idx, setIdx] = useState(0);

  const open = useMemo(() => data?.open ?? [], [data]);
  const ranked = useMemo(() => {
    const rows = open.filter((t) => t.coin && mids[t.coin]).map((t) => ({ t, roi: live(t, mids, t.coin).roi }));
    rows.sort((a, b) => b.roi - a.roi);
    return { up: rows.filter((r) => r.roi > 0).slice(0, 4).map((r) => r.t), down: rows.filter((r) => r.roi < 0).slice(-4).reverse().map((r) => r.t) };
  }, [open, mids]);

  const cards: React.ReactNode[] = [];
  (data?.duels ?? []).slice(0, 3).forEach((d) => cards.push(<DuelCard key={`d${d.id}`} d={d} mids={mids} />));
  cards.push(<BoardCard key="up" title="Up right now" tag="live ROI" rows={ranked.up} mids={mids} up />);
  (data?.fades ?? []).slice(0, 3).forEach((f) => cards.push(<FadeCard key={`f${f.fader.postId}`} f={f} mids={mids} />));
  cards.push(<BoardCard key="down" title="Down bad" tag="live ROI" rows={ranked.down} mids={mids} up={false} />);
  if (data?.streaks?.length) cards.push(<StreakCard key="s" s={data.streaks} />);

  // Auto-advance.
  useEffect(() => {
    const id = setInterval(() => {
      const el = rail.current; if (!el || paused.current || cards.length < 2) return;
      const w = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 10 : 300;
      const next = (Math.round(el.scrollLeft / w) + 1) % cards.length;
      el.scrollTo({ left: next * w, behavior: "smooth" });
      setIdx(next);
    }, 6000);
    return () => clearInterval(id);
  }, [cards.length]);

  if (!data) return <div className="pulse-skel" aria-hidden />;
  if (!cards.length) return null;

  return (
    <section className="pulse" aria-label="Live pulse">
      <div className="flex items-center justify-between px-5"><span className="eyebrow flex items-center gap-2"><i className="livedot" />Pulse</span><span className="when">{(data.duels.length ? `${data.duels.length} duel${data.duels.length > 1 ? "s" : ""} · ` : "")}{open.length} open</span></div>
      <div
        ref={rail}
        className="prail"
        onTouchStart={() => { paused.current = true; }}
        onTouchEnd={() => { setTimeout(() => { paused.current = false; }, 8000); }}
        onScroll={(e) => { const el = e.currentTarget; const w = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 10 : 300; setIdx(Math.round(el.scrollLeft / w)); }}
      >
        {cards}
      </div>
      <div className="pdots">{cards.map((_, i) => <i key={i} className={i === idx ? "on" : ""} />)}</div>
    </section>
  );
}
