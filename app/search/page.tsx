"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Avatar, Badges, CoinMark, ticker } from "@/components/ui";
import { FollowButton } from "@/components/FollowButton";
import { useSession } from "@/lib/hooks/useSession";
import { crowdLabel, fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { rankFor } from "@/lib/rank";
import type { MarketItem } from "@/components/MarketStats";

type U = { handle: string; avatarUrl: string | null; xp: number; role: string | null; founderSeat: number | null; founderStatus: string | null; verified: boolean; isBot?: boolean; closedTrades?: number; winRate?: number; battlesWon?: number; battlesLost?: number; why?: string };
type Recent = { t: "coin" | "user"; v: string; a?: string | null };
type Filter = "all" | "coins" | "traders";
const RECENT_KEY = "perped:recent-search";

function loadRecent(): Recent[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(0, 8); } catch { return []; } }

/** Highlight the part of a name that matches what was typed. */
function Hl({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="s-hl">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** /search: coins and traders together, with suggestions before you type. */
export default function SearchPage() {
  const router = useRouter();
  const { authedFetch, profile } = useSession();
  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [recent, setRecent] = useState<Recent[]>([]);
  const [showAll, setShowAll] = useState<Filter | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setRecent(loadRecent()); input.current?.focus(); }, []);
  // Debounce typing so each keystroke doesn't hit the server.
  useEffect(() => { const t = setTimeout(() => setQ(raw.trim()), 160); return () => clearTimeout(t); }, [raw]);

  // "@ka" searches traders only, "$ka" coins only.
  const mode: Filter = q.startsWith("@") ? "traders" : q.startsWith("$") ? "coins" : filter;
  const term = q.replace(/^[@$]/, "");

  const { data: mk } = useSWR<{ markets: MarketItem[] }>("/api/markets", { refreshInterval: 60_000 });
  const { data: found, isLoading } = useSWR<{ users: U[] }>(term && mode !== "coins" ? `/api/search?q=${encodeURIComponent(term)}` : null, { keepPreviousData: true });
  const { data: sug } = useSWR<{ traders: U[] }>(!term ? "/api/search/suggest" : null, async (u: string) => (await authedFetch(u)).json(), { revalidateOnFocus: false });

  const markets = mk?.markets ?? [];
  const coins = useMemo(() => {
    if (!term || mode === "traders") return [];
    const t = term.toUpperCase();
    return markets.filter((m) => m.name.toUpperCase().includes(t))
      .sort((a, b) => Number(b.name.toUpperCase() === t) - Number(a.name.toUpperCase() === t) || Number(b.name.toUpperCase().startsWith(t)) - Number(a.name.toUpperCase().startsWith(t)) || b.volume24h - a.volume24h);
  }, [markets, term, mode]);
  const users = mode === "coins" ? [] : found?.users ?? [];
  const movers = useMemo(() => [...markets].filter((m) => m.volume24h >= 1_000_000).sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 8), [markets]);

  // Top result: an exact handle or ticker wins; otherwise the strongest of each.
  const exactCoin = coins.find((c) => c.name.toUpperCase() === term.toUpperCase());
  const exactUser = users.find((u) => u.handle === term.toLowerCase());
  const top: { t: "coin"; c: MarketItem } | { t: "user"; u: U } | null = exactUser ? { t: "user", u: exactUser } : exactCoin ? { t: "coin", c: exactCoin } : null;
  const restUsers = users.filter((u) => !(top?.t === "user" && top.u.handle === u.handle));
  const restCoins = coins.filter((c) => !(top?.t === "coin" && top.c.name === c.name));

  const remember = (r: Recent) => {
    const next = [r, ...recent.filter((x) => !(x.t === r.t && x.v === r.v))].slice(0, 8);
    setRecent(next); try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };
  const goCoin = (c: string) => { remember({ t: "coin", v: c }); router.push(`/markets/${c}`); };
  const goUser = (u: { handle: string; avatarUrl?: string | null }) => { remember({ t: "user", v: u.handle, a: u.avatarUrl ?? null }); router.push(`/u/${u.handle}`); };
  const onEnter = () => {
    if (top) return top.t === "user" ? goUser(top.u) : goCoin(top.c.name);
    if (restUsers[0] && mode !== "coins") return goUser(restUsers[0]);
    if (restCoins[0]) goCoin(restCoins[0].name);
  };

  const userLine = (u: U) => {
    const r = rankFor(u.xp ?? 0).title;
    if (u.why) return `${r} · ${u.why}`;
    const fights = (u.battlesWon ?? 0) + (u.battlesLost ?? 0);
    return [r, fights ? `${u.battlesWon}–${u.battlesLost} in fades` : null, u.closedTrades ? `${Math.round(u.winRate ?? 0)}% win rate` : null, u.isBot ? "bot" : null].filter(Boolean).join(" · ");
  };
  const UserRow = ({ u }: { u: U }) => (
    <div className="s-row">
      <button type="button" className="s-main" onClick={() => goUser(u)}>
        <Avatar handle={u.handle} url={u.avatarUrl} size={40} link={false} xp={u.xp} />
        <span className="s-mid"><span className="s-nm"><span className="truncate"><Hl text={u.handle} q={term} /></span><Badges u={u} /></span><span className="s-sub">{userLine(u)}</span></span>
      </button>
      {profile?.handle !== u.handle && <FollowButton handle={u.handle} compact />}
    </div>
  );
  const CoinRow = ({ c }: { c: MarketItem }) => (
    <button type="button" className="s-row s-main" onClick={() => goCoin(c.name)}>
      <CoinMark coin={c.name} />
      <span className="s-mid"><span className="s-nm"><Hl text={ticker(c.name)} q={term} /></span><span className="s-sub">Volume {fmtUsd(c.volume24h, { compact: true })} · {c.maxLeverage}× max</span></span>
      <span className="s-px"><b className="mono">{fmtPrice(c.mid)}</b><small className={`mono ${c.change24h >= 0 ? "green" : "red"}`}>{fmtPct(c.change24h, 1)}</small></span>
    </button>
  );
  const cap = (k: Filter) => (showAll === k ? Infinity : 4);

  return (
    <div className="search fade-in" data-tint="blue">
      <div className="s-top">
        <label className="s-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={input} value={raw} onChange={(e) => { setRaw(e.target.value); setShowAll(null); }} onKeyDown={(e) => e.key === "Enter" && onEnter()}
            placeholder="Search coins and traders" aria-label="Search coins and traders" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="search" />
          {raw && <button type="button" className="s-clear" aria-label="Clear" onClick={() => { setRaw(""); input.current?.focus(); }}>×</button>}
        </label>
        <button type="button" className="s-cancel" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>Cancel</button>
      </div>
      <div className="s-segs" role="tablist">
        {(["all", "coins", "traders"] as Filter[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={mode === f} className={mode === f ? "on" : ""} onClick={() => { setFilter(f); if (q.startsWith("@") || q.startsWith("$")) setRaw(term); }}>
            {f === "all" ? "All" : f === "coins" ? "Coins" : "Traders"}{term && f === "coins" && mode !== "traders" ? ` · ${coins.length}` : ""}{term && f === "traders" && mode !== "coins" && found ? ` · ${users.length}` : ""}
          </button>
        ))}
      </div>

      {!term ? (
        <>
          {recent.length > 0 && <>
            <div className="s-sec"><b>Recent</b><button type="button" onClick={() => { setRecent([]); try { localStorage.removeItem(RECENT_KEY); } catch {} }}>Clear</button></div>
            <div className="s-recent">{recent.map((r) => (
              <button key={`${r.t}${r.v}`} type="button" onClick={() => (r.t === "coin" ? goCoin(r.v) : goUser({ handle: r.v, avatarUrl: r.a }))}>
                {r.t === "coin" ? <CoinMark coin={r.v} size="xs" /> : <Avatar handle={r.v} url={r.a ?? undefined} size={20} link={false} />}{r.t === "coin" ? ticker(r.v) : r.v}
              </button>
            ))}</div>
          </>}
          {mode !== "traders" && movers.length > 0 && <>
            <div className="s-sec"><b>Moving now</b><span>24h</span></div>
            <div className="s-movers">{movers.map((m) => {
              const why = crowdLabel(m.funding8h) ?? (m.oiChange24h != null && Math.abs(m.oiChange24h) >= 5 ? `OI ${fmtPct(m.oiChange24h, 1)}` : `Vol ${fmtUsd(m.volume24h, { compact: true })}`);
              return (
                <button key={m.name} type="button" className="s-mover" onClick={() => goCoin(m.name)}>
                  <CoinMark coin={m.name} size="sm" /><b>{ticker(m.name)}</b><small className={`mono ${m.change24h >= 0 ? "green" : "red"}`}>{fmtPct(m.change24h, 1)}</small><em>{why}</em>
                </button>
              );
            })}</div>
          </>}
          {mode !== "coins" && (sug?.traders.length ?? 0) > 0 && <>
            <div className="s-sec"><b>Traders to watch</b><span>this week</span></div>
            {sug!.traders.map((u) => <UserRow key={u.handle} u={u} />)}
          </>}
          <p className="s-hint">Tip: start with @ for traders or $ for coins.</p>
        </>
      ) : (
        <>
          {top && (
            <div className="s-top1"><div className="s-tag">Top result</div>{top.t === "user" ? <UserRow u={top.u} /> : <CoinRow c={top.c} />}</div>
          )}
          {mode !== "coins" && restUsers.length > 0 && <>
            <div className="s-sec"><b>Traders</b><span>by rank</span></div>
            {restUsers.slice(0, mode === "traders" ? Infinity : cap("traders")).map((u) => <UserRow key={u.handle} u={u} />)}
            {mode === "all" && showAll !== "traders" && restUsers.length > 4 && <button type="button" className="s-more" onClick={() => setShowAll("traders")}>See all {users.length} traders</button>}
          </>}
          {mode !== "traders" && restCoins.length > 0 && <>
            <div className="s-sec"><b>Coins</b><span>by volume</span></div>
            {restCoins.slice(0, mode === "coins" ? 40 : cap("coins")).map((c) => <CoinRow key={c.name} c={c} />)}
            {mode === "all" && showAll !== "coins" && restCoins.length > 4 && <button type="button" className="s-more" onClick={() => setShowAll("coins")}>See all {coins.length} coins</button>}
          </>}
          {!top && !restUsers.length && !restCoins.length && !(isLoading && mode !== "coins") && (
            <p className="s-hint" style={{ textAlign: "center", padding: "32px 16px" }}>Nothing matches “{term}”.{mode !== "all" && <> <button type="button" className="underline" onClick={() => { setFilter("all"); setRaw(term); }}>Search everything</button></>}</p>
          )}
        </>
      )}
      <div style={{ height: 120 }} />
      <Link href="/markets" className="sr-only">All markets</Link>
    </div>
  );
}
