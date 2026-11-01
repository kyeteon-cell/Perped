"use client";

import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { HERO_BACKGROUNDS, SHARE_BACKGROUNDS } from "@/lib/share-backgrounds";
import { rankFor } from "@/lib/rank";

/** What the profile card shows. Numbers are taken when the sheet opens. */
export type ProfileShareData = { handle: string; avatarUrl: string | null; verified: boolean; demo: boolean; xp: number; url: string };
type CardRange = "1d" | "7d" | "28d" | "1y" | "all";
type CardStats = { won: number; lost: number; drawn: number; form: ("W" | "L" | "D")[]; streak: number; bestStreak: number; closedTrades: number; tradesWon: number; pnl: number; callsHit: number; callsResolved: number; copied: number; faded: number; xp: number };
const RANGE_LABEL: Record<CardRange, [string, string]> = { "1d": ["1D", "LAST 24 HOURS"], "7d": ["7D", "LAST 7 DAYS"], "28d": ["28D", "LAST 28 DAYS"], "1y": ["1Y", "LAST 12 MONTHS"], all: ["All", "ALL TIME"] };

const BGS: { key: string; name: string }[] = [
  ...HERO_BACKGROUNDS.map((h) => ({ key: h.key, name: h.name })),
  ...SHARE_BACKGROUNDS.filter((s) => s.url).map((s) => ({ key: s.key, name: s.name })),
];
const G = "#05e091", R = "#fd6267", GOLD = "#f2b63a";
const sans = `"Nunito", system-ui, sans-serif`, mono = `"Barlow", "Nunito", system-ui, sans-serif`;

const cache = new Map<string, Promise<HTMLImageElement | null>>();
function img(src: string) {
  if (!cache.has(src)) cache.set(src, new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }));
  return cache.get(src)!;
}
const avatarSrc = (u: string | null) => (!u ? null : u.startsWith("/") ? u : `/api/img?u=${encodeURIComponent(u)}`);
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const money = (n: number) => `${n < 0 ? "-" : "+"}$${Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? (Math.abs(n) / 1e3).toFixed(1) + "K" : Math.abs(n).toFixed(0)}`;

/** The trader card: 1080×1350 (4:5), on the chosen background. */
async function draw(d: ProfileShareData, st: CardStats, range: CardRange, bgKey: string) {
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  await document.fonts?.ready;
  g.fillStyle = "#0b0c0e"; g.fillRect(0, 0, W, H);
  const bg = await img(`/api/share-bg/${bgKey}`);
  if (bg) { const s = Math.max(W / bg.width, H / bg.height); g.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s); }
  const scrim = g.createLinearGradient(0, 0, 0, H); scrim.addColorStop(0, "rgba(5,6,8,.35)"); scrim.addColorStop(.45, "rgba(5,6,8,.62)"); scrim.addColorStop(1, "rgba(5,6,8,.9)");
  g.fillStyle = scrim; g.fillRect(0, 0, W, H);
  // Chrome rim
  const rim = g.createLinearGradient(0, 0, W, H); rim.addColorStop(0, "#f1f4f7"); rim.addColorStop(.5, "#8e98a4"); rim.addColorStop(1, "#e9edf2");
  g.strokeStyle = rim; g.lineWidth = 6; rr(g, 3, 3, W - 6, H - 6, 46); g.stroke();

  const rank = rankFor(d.xp);
  // Period tag, top left
  g.font = `900 28px ${sans}`; const pt = RANGE_LABEL[range][1].split("").join(String.fromCharCode(8202)); const pw = g.measureText(pt).width + 40;
  g.fillStyle = "rgba(255,255,255,.12)"; rr(g, 48, 48, pw, 52, 26); g.fill(); g.fillStyle = "#fff"; g.fillText(pt, 68, 84);
  // Avatar + rank emblem
  const cx = W / 2, cy = 250, r = 120;
  g.lineWidth = 10; g.strokeStyle = GOLD; g.beginPath(); g.arc(cx, cy, r + 10, 0, Math.PI * 2); g.stroke();
  const src = avatarSrc(d.avatarUrl), av = src ? await img(src) : null;
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  if (av) g.drawImage(av, cx - r, cy - r, r * 2, r * 2); else { g.fillStyle = "#2a2f38"; g.fillRect(cx - r, cy - r, r * 2, r * 2); g.fillStyle = "#fff"; g.font = `900 110px ${sans}`; const t = d.handle[0]?.toUpperCase() ?? "?"; g.fillText(t, cx - g.measureText(t).width / 2, cy + 40); }
  g.restore();
  const emb = await img(`/api/share-bg/rank-${rank.level}`);
  if (emb) { g.save(); g.beginPath(); g.arc(cx + 92, cy + 88, 50, 0, Math.PI * 2); g.clip(); g.drawImage(emb, cx + 42, cy + 38, 100, 100); g.restore(); g.strokeStyle = "#0b0c0e"; g.lineWidth = 6; g.beginPath(); g.arc(cx + 92, cy + 88, 50, 0, Math.PI * 2); g.stroke(); }

  // Name, rank
  g.fillStyle = "#fff"; g.font = `900 76px ${sans}`;
  const name = d.handle + (d.verified ? " ✓" : ""); g.fillText(name, cx - g.measureText(name).width / 2, 470);
  g.font = `800 34px ${sans}`; g.fillStyle = GOLD;
  const sub = `${rank.title.toUpperCase()} · ${d.xp.toLocaleString("en-US")} XP${d.demo ? " · DEMO" : ""}`; g.fillText(sub, cx - g.measureText(sub).width / 2, 528);

  // Fade record, big
  const fights = st.won + st.lost, wr = fights ? Math.round((st.won / fights) * 100) : null;
  g.font = `900 140px ${mono}`;
  const wS = String(st.won), lS = String(st.lost), dash = " – ";
  const ww = g.measureText(wS).width, dw = g.measureText(dash).width, lw = g.measureText(lS).width;
  let x = cx - (ww + dw + lw) / 2;
  g.fillStyle = G; g.fillText(wS, x, 700); x += ww; g.fillStyle = "rgba(255,255,255,.5)"; g.fillText(dash, x, 700); x += dw; g.fillStyle = R; g.fillText(lS, x, 700);
  g.font = `800 32px ${sans}`; g.fillStyle = "rgba(255,255,255,.75)";
  const rec = `FADE RECORD${wr != null ? ` · ${wr}% WON` : ""}`; g.fillText(rec, cx - g.measureText(rec).width / 2, 752);
  // Form: last results
  const form = st.form.slice(-10);
  if (form.length) {
    const s = 34, gap = 12, tw = form.length * s + (form.length - 1) * gap; let fx = cx - tw / 2;
    for (const f of form) { g.fillStyle = f === "W" ? G : f === "L" ? R : "rgba(255,255,255,.35)"; rr(g, fx, 782, s, s, 9); g.fill(); g.fillStyle = "#0b0c0e"; g.font = `900 20px ${sans}`; g.fillText(f, fx + s / 2 - g.measureText(f).width / 2, 806); fx += s + gap; }
  }

  // Stat tiles
  const tiles: [string, string, string?][] = [
    ["STREAK", st.streak > 0 ? `${st.streak}` : "–", `best ${st.bestStreak}`],
    ["TRADES WON", st.closedTrades ? `${Math.round((st.tradesWon / st.closedTrades) * 100)}%` : "–", `${st.closedTrades} closed`],
    [d.demo ? "PNL · DEMO" : "PNL", st.closedTrades ? money(st.pnl) : "–", st.xp ? `${st.xp > 0 ? "+" : ""}${st.xp.toLocaleString("en-US")} XP` : undefined],
    ["CALLS HIT", st.callsResolved ? `${Math.round((st.callsHit / st.callsResolved) * 100)}%` : "–", `${st.callsHit}/${st.callsResolved}`],
    ["COPIED", `${st.copied}`, "times"],
    ["FADED", `${st.faded}`, "times"],
  ];
  const cols = 3, tw = 300, th = 150, gx = 30, top = 860, left = (W - (cols * tw + (cols - 1) * gx)) / 2;
  tiles.forEach(([k, v, s2], i) => {
    const tx = left + (i % cols) * (tw + gx), ty = top + Math.floor(i / cols) * (th + 24);
    g.fillStyle = "rgba(255,255,255,.08)"; rr(g, tx, ty, tw, th, 26); g.fill();
    g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 2; g.stroke();
    g.font = `800 24px ${sans}`; g.fillStyle = "rgba(255,255,255,.65)"; g.fillText(k, tx + 24, ty + 42);
    g.font = `900 54px ${mono}`; g.fillStyle = k.startsWith("PNL") && st.closedTrades ? (st.pnl >= 0 ? G : R) : "#fff"; g.fillText(v, tx + 24, ty + 102);
    if (s2) { g.font = `700 22px ${sans}`; g.fillStyle = "rgba(255,255,255,.55)"; g.fillText(s2, tx + 24, ty + 132); }
  });

  // Footer
  const logo = await img("/api/share-bg/logo-wordmark");
  if (logo) { const lh = 60, lw2 = (logo.width / logo.height) * lh; g.drawImage(logo, 56, H - 56 - lh, lw2, lh); }
  g.font = `800 30px ${sans}`; g.fillStyle = "#fff"; const ft = d.url.replace(/^https?:\/\//, ""); g.fillText(ft, W - 56 - g.measureText(ft).width, H - 72);
  return c;
}

export function ProfileShare({ data, onClose }: { data: ProfileShareData; onClose: () => void }) {
  const [bg, setBg] = useState(() => { try { return localStorage.getItem("perped:profile-bg") || "hero-chrome"; } catch { return "hero-chrome"; } });
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [frozen] = useState(data);
  const [range, setRange] = useState<CardRange>(() => { try { return (localStorage.getItem("perped:profile-range") as CardRange) || "all"; } catch { return "all"; } });
  // Stats for the chosen period, fetched once per period and kept while the sheet is open.
  const [stats, setStats] = useState<Partial<Record<CardRange, CardStats>>>({});
  useEffect(() => {
    if (stats[range]) return;
    let off = false;
    fetch(`/api/profile/${frozen.handle}/card?range=${range}`).then((r) => r.json()).then((j: CardStats) => { if (!off) setStats((s) => ({ ...s, [range]: j })); }).catch(() => setMsg("Couldn't load the stats"));
    return () => { off = true; };
  }, [range, frozen.handle, stats]);
  const st = stats[range];
  useEffect(() => {
    if (!st) { setPng(null); return; }
    let off = false;
    setPng(null);
    draw(frozen, st, range, bg).then((c) => { if (!off) setPng(c.toDataURL("image/png")); }).catch(() => setMsg("Couldn't draw the card"));
    try { localStorage.setItem("perped:profile-bg", bg); localStorage.setItem("perped:profile-range", range); } catch {}
    return () => { off = true; };
  }, [frozen, st, range, bg]);

  const share = async () => {
    if (!png) return;
    setBusy(true);
    try {
      const blob = await (await fetch(png)).blob();
      const file = new File([blob], `perped-${frozen.handle}.png`, { type: "image/png" });
      const text = st ? `${frozen.handle} on Perped, ${RANGE_LABEL[range][1].toLowerCase()}: ${st.won}–${st.lost} in fades. Fade me if you dare ${frozen.url}` : frozen.url;
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (navigator.share) await navigator.share({ text, url: frozen.url });
      else { const a = document.createElement("a"); a.href = png; a.download = file.name; a.click(); setMsg("Image saved"); }
    } catch { /* cancelled */ }
    setBusy(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(frozen.url); setMsg("Link copied"); } catch {} };

  return (
    <Sheet label="Share profile" onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="text-lg font-extrabold" data-sheet-handle>Share {frozen.handle}</div>
        <div className="bshare-prev mt-3">{png ? <img src={png} alt={`${frozen.handle}'s trader card`} /> : <div className="skel" style={{ aspectRatio: "4 / 5", borderRadius: 18 }} />}</div>
        <div className="eyebrow mt-4">Period</div>
        <div className="ps-range mt-2" role="tablist">{(Object.keys(RANGE_LABEL) as CardRange[]).map((k) => <button key={k} role="tab" aria-selected={range === k} className={range === k ? "on" : ""} onClick={() => setRange(k)}>{RANGE_LABEL[k][0]}</button>)}</div>
        <div className="eyebrow mt-4">Background</div>
        <div className="themes mt-2">
          {BGS.map((t) => <button key={t.key} type="button" className={`theme-dot ${t.key === bg ? "on" : ""}`} onClick={() => setBg(t.key)} aria-label={t.name}><i style={{ backgroundImage: `url(/api/share-bg/${t.key})` }} /><span>{t.name}</span></button>)}
        </div>
        {msg && <p className="when mt-2 text-center">{msg}</p>}
        <div className="mt-4 grid grid-cols-[2fr_1fr] gap-2.5">
          <button className="btn ink" onClick={share} disabled={!png || busy}>{busy ? "Opening…" : "Share image"}</button>
          <button className="btn" onClick={copy}>Copy link</button>
        </div>
      </div>
    </Sheet>
  );
}
