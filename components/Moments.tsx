"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { Avatar, ticker } from "./ui";
import { small } from "@/lib/img";
import { useSession } from "@/lib/hooks/useSession";
import { useLive, openComingSoon } from "@/lib/hooks/useLive";
import { RANKS, rankFor } from "@/lib/rank";
import { fmtUsd } from "@/lib/format";

const DepositSheet = dynamic(() => import("./DepositSheet").then((m) => m.DepositSheet), { ssr: false });

type Moment = { id: number; type: string; title: string; body: string | null; href: string | null };
type DemoWin = { id: number; coin: string | null; side: string | null; leverage: number | null; pnl: number };
type Stamp = { side: "long" | "short"; lev: number; coin: string; fade: string | null; k: number };

const LS_LAST = "perped:moment-last", LS_TRADE = "perped:d2r-last", LS_D2R_AT = "perped:d2r-at";
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const buzz = (p: number | number[]) => { try { if (!reduced()) navigator.vibrate?.(p); } catch {} };

/**
 * The app's big moments, mounted once in the layout so they play over any screen:
 *  - the "order filled" stamp when you open a trade (a slash + FADED when it's a fade),
 *  - full-screen ceremonies for ranking up, unlocking a trophy and winning a fade or duel,
 *  - after a winning demo trade, what it would have paid with real money.
 * The last moment shown is remembered on the device, so nothing ever replays.
 */
export function Moments() {
  const { profile, authedFetch } = useSession();
  const path = usePathname() ?? "/";
  const router = useRouter();
  const { allowed } = useLive();

  // ---- trade stamp
  const [stamp, setStamp] = useState<Stamp | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<Stamp, "k">;
      setStamp({ ...d, k: Date.now() }); buzz(d.fade ? [20, 30, 40] : 25);
    };
    window.addEventListener("perped:stamp", h);
    return () => window.removeEventListener("perped:stamp", h);
  }, []);
  useEffect(() => { if (!stamp) return; const t = setTimeout(() => setStamp(null), 1500); return () => clearTimeout(t); }, [stamp]);

  // ---- moments feed (only while the app is open and visible)
  const [vis, setVis] = useState(true);
  useEffect(() => { const f = () => setVis(document.visibilityState === "visible"); f(); document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, []);
  const after = useRef<number | null>(null);
  const afterTrade = useRef<number>(0);
  const pid = profile?.id ?? null;
  // Read the device's high-water mark straight from storage the first time (the fetch can fire before any effect).
  const mark = () => { if (after.current == null && pid) { after.current = Number(get(`${LS_LAST}:${pid}`) ?? -1); afterTrade.current = Number(get(LS_TRADE) ?? 0); } return after.current ?? -1; };
  useEffect(() => { after.current = null; }, [pid]);
  const key = pid && vis ? ["/api/me/moments", pid] : null;
  const { data } = useSWR<{ moments: Moment[]; latest: number; demoWin: DemoWin | null }>(key, async () => {
    const a = mark();
    return (await authedFetch(`/api/me/moments?after=${Math.max(0, a)}&afterTrade=${afterTrade.current}`)).json();
  }, { refreshInterval: 40_000, revalidateOnFocus: true, dedupingInterval: 10_000 });

  const [queue, setQueue] = useState<Moment[]>([]);
  const [d2r, setD2r] = useState<DemoWin | null>(null);
  const [deposit, setDeposit] = useState(false);
  const done = useRef<unknown>(null);
  useEffect(() => {
    if (!data || !pid || !Array.isArray(data.moments) || done.current === data) return;
    done.current = data; // each response is handled once, however often the profile object changes
    const prev = mark();
    const first = prev < 0;
    after.current = Math.max(prev, data.latest ?? 0);
    set(`${LS_LAST}:${pid}`, String(after.current));
    // First run on this device: start from now, don't replay history. After that, only moments newer than the last one shown.
    const fresh = first ? [] : [...data.moments].reverse().filter((m) => m.id > prev);
    if (fresh.length) setQueue((q) => [...q, ...fresh.filter((m) => !q.some((x) => x.id === m.id))].slice(-4));
    if (data.demoWin && data.demoWin.id > afterTrade.current) {
      afterTrade.current = data.demoWin.id; set(LS_TRADE, String(data.demoWin.id));
      // At most one "for real" moment every 6 hours, and never on the first run.
      const last = Number(get(LS_D2R_AT) ?? 0);
      if (!first && Date.now() - last > 6 * 3_600_000) { set(LS_D2R_AT, String(Date.now())); setD2r(data.demoWin); }
    }
  }, [data, pid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't interrupt a trade being set up or a sign-in.
  const quiet = /^\/(trade|onboarding|admin)/.test(path);
  const cur = !quiet ? queue[0] ?? null : null;
  useEffect(() => { if (cur) buzz(cur.type === "rank" ? [30, 60, 30, 60, 90] : [30, 50, 70]); }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => setQueue((q) => q.slice(1));
  const open = (href: string | null) => { next(); if (href) router.push(href); };

  return (
    <>
      {stamp && (
        <div key={stamp.k} className={`mo-stamp ${stamp.fade ? "fade" : ""}`} aria-live="polite">
          {stamp.fade && <i className="mo-slash" />}
          <span className={`mo-st ${stamp.side}`}>
            <small>{stamp.fade ? `Faded @${stamp.fade}` : "Order filled"}</small>
            <b>{stamp.side === "long" ? "Long" : "Short"} {stamp.lev}×</b>
            <em>{ticker(stamp.coin)}</em>
          </span>
        </div>
      )}
      {cur && profile && <Ceremony key={cur.id} m={cur} handle={profile.handle} avatarUrl={profile.avatarUrl ?? null} xp={profile.xp ?? 0} onClose={next} onOpen={() => open(cur.href)} />}
      {!cur && d2r && !quiet && (
        <div className="mo-d2r-bg" onClick={() => setD2r(null)}>
          <div className="mo-d2r" role="dialog" aria-label="What this would have paid" onClick={(e) => e.stopPropagation()}>
            <small>That was a demo trade</small>
            <p>With real money you&apos;d have banked</p>
            <b className="mono green"><Count to={d2r.pnl} /></b>
            <span className="when">{ticker(d2r.coin ?? "")} {d2r.side} {d2r.leverage ?? 1}× · same size, same prices</span>
            <div className="mo-d2r-acts">
              <button type="button" className="btn primary" onClick={() => { setD2r(null); if (allowed) setDeposit(true); else openComingSoon(); }}>{allowed ? "Fund a real account" : "Get early access to real money"}</button>
              <button type="button" className="btn" onClick={() => setD2r(null)}>Keep practising</button>
            </div>
          </div>
        </div>
      )}
      {deposit && <DepositSheet onClose={() => setDeposit(false)} />}
    </>
  );
}

/** A number that counts up from zero (used for the money moments). */
function Count({ to }: { to: number }) {
  const [v, setV] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (reduced()) return setV(to);
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 900); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{fmtUsd(v, { sign: true })}</>;
}

/** Full-screen moment: rank up (the rim changes metal in front of you), trophy (flip + glint), fade or duel won (confetti). */
function Ceremony({ m, handle, avatarUrl, xp, onClose, onOpen }: { m: Moment; handle: string; avatarUrl: string | null; xp: number; onClose: () => void; onOpen: () => void }) {
  // The rank comes from the alert itself ("Ranked up: X", "Level N."), not the cached profile, which can lag.
  const lvl = Number(/Level (\d+)/.exec(m.body ?? "")?.[1] ?? 0);
  const byAlert = m.type === "rank" && lvl ? RANKS.find((r) => r.level === lvl) : undefined;
  const now = byAlert ? { ...rankFor(byAlert.min), xp: Math.max(xp, byAlert.min) } : rankFor(xp);
  const prevLevel = Math.max(1, now.level - 1);
  const [morphed, setMorphed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMorphed(true), reduced() ? 0 : 900); return () => clearTimeout(t); }, []);
  const kind = m.type === "rank" ? "rank" : m.type === "achievement" ? "trophy" : "win";
  return (
    <div className={`mo-cer ${kind}`} role="dialog" aria-label={m.title} onClick={onClose}>
      {kind === "win" && <Confetti />}
      <div className="mo-card" onClick={(e) => e.stopPropagation()}>
        {kind === "rank" && (
          <div className={`mo-rank ${morphed ? "done" : ""}`}>
            <Avatar handle={handle} url={avatarUrl} size={104} link={false} xp={morphed ? now.xp : RANKS[prevLevel - 1].min} />
            <img className="mo-emblem" src={small(`/api/share-bg/rank-${now.level}`, 256)} alt="" width={120} height={120} />
          </div>
        )}
        {kind === "trophy" && <div className="mo-trophy"><span className="mo-flip"><TrophyGlyph /></span></div>}
        {kind === "win" && <div className="mo-win"><Avatar handle={handle} url={avatarUrl} size={88} link={false} xp={xp} /><span className="mo-crown" aria-hidden /></div>}
        <small className="mo-eyebrow">{kind === "rank" ? `Level ${now.level}` : kind === "trophy" ? "Trophy unlocked" : m.type === "duel" ? "Duel won" : "Fade won"}</small>
        <h2>{kind === "rank" ? now.title : m.title.replace(/^Trophy unlocked: /, "")}</h2>
        {m.body && <p>{m.body.replace(/ · tap to pin it to your profile$/, "")}</p>}
        <div className="mo-acts">
          {m.href && <button type="button" className="btn primary" onClick={onOpen}>{kind === "rank" ? "See your profile" : kind === "trophy" ? "View trophy" : "See the fight"}</button>}
          <button type="button" className="btn" onClick={onClose}>Nice</button>
        </div>
      </div>
    </div>
  );
}

function TrophyGlyph() {
  return (
    <svg viewBox="0 0 64 64" width="96" height="96" aria-hidden>
      <defs><linearGradient id="mo-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe9a8" /><stop offset=".5" stopColor="#f2b63a" /><stop offset="1" stopColor="#a8740a" /></linearGradient></defs>
      <path d="M18 8h28v10a14 14 0 0 1-28 0V8z" fill="url(#mo-g)" />
      <path d="M18 12H9a9 9 0 0 0 9 11M46 12h9a9 9 0 0 1-9 11" fill="none" stroke="url(#mo-g)" strokeWidth="4" strokeLinecap="round" />
      <rect x="28" y="31" width="8" height="12" rx="2" fill="url(#mo-g)" /><rect x="19" y="43" width="26" height="8" rx="3" fill="url(#mo-g)" />
    </svg>
  );
}

/** Gold and chrome confetti on a canvas, about two seconds, then it cleans itself up. */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || reduced()) return;
    const g = c.getContext("2d"); if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; g.scale(dpr, dpr);
    const cols = ["#f2b63a", "#ffe39a", "#c98a05", "#e9ecf1", "#b8bec8"];
    const P = Array.from({ length: 90 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .38, vx: (Math.random() - .5) * 11, vy: -Math.random() * 13 - 4, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, c: cols[(Math.random() * cols.length) | 0] }));
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      g.clearRect(0, 0, innerWidth, innerHeight);
      const life = (t - t0) / 2200;
      for (const p of P) { p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.globalAlpha = Math.max(0, 1 - life); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); }
      if (life < 1) raf = requestAnimationFrame(step); else g.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="mo-confetti" aria-hidden />;
}
