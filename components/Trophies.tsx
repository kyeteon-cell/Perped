"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Sheet } from "./Sheet";
import { HERO_BACKGROUNDS, SHARE_BACKGROUNDS } from "@/lib/share-backgrounds";
import { TROPHIES, TROPHY, TIER_LABEL, TIER_RANK, emblemUrl, type Trophy } from "@/lib/trophies";
import { referralLink } from "@/lib/fees";
import type { TrophyRow } from "@/app/api/achievements/[handle]/route";

export function Emblem({ t, locked = false, size = 56 }: { t: Trophy; locked?: boolean; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={emblemUrl(t, locked)} width={size} height={size} alt={`${t.name} trophy`} className={`emblem ${locked ? "locked" : ""}`} draggable={false} />;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const rareText = (r: number | null) => (r == null ? "" : r < 1 ? "under 1% of players have this" : `${r}% of players have this`);

/** The trophy case on a profile: unlocked first, then locked with progress. Tap one for details and sharing. */
export function TrophyCase({ handle }: { handle: string }) {
  const { data } = useSWR<{ trophies: TrophyRow[] }>(`/api/achievements/${handle}`);
  const [open, setOpen] = useState<string | null>(null);
  // Opened from a notification or feed card: /u/kilo?trophy=giant_slayer
  useEffect(() => {
    try { const k = new URLSearchParams(window.location.search).get("trophy"); if (k && TROPHY[k]) { setOpen(k); document.getElementById("trophies")?.scrollIntoView({ behavior: "smooth", block: "start" }); } } catch {}
  }, []);
  if (!data) return <div id="trophies" className="trophies"><div className="skel" style={{ height: 160, borderRadius: 20 }} /></div>;
  const R = new Map(data.trophies.map((r) => [r.key, r]));
  // Bronze through to obsidian, unlocked first.
  const byTier = (a: Trophy, b: Trophy) => TIER_RANK[a.tier] - TIER_RANK[b.tier];
  const got = TROPHIES.filter((t) => R.get(t.key)?.unlocked).sort(byTier);
  const locked = TROPHIES.filter((t) => !R.get(t.key)?.unlocked).sort(byTier);
  const row = open ? R.get(open) : null;
  return (
    <section id="trophies" className="trophies">
      <div className="flex items-center justify-between"><span className="eyebrow">Trophies</span><span className="when"><b style={{ color: "var(--text)" }}>{got.length}</b> of {TROPHIES.length}</span></div>
      <div className="tro-meter"><i style={{ width: `${(got.length / TROPHIES.length) * 100}%` }} /></div>
      {got.length > 0 && (
        <>
          <div className="tro-sub got"><span className="tro-tick" aria-hidden>✓</span>Unlocked · {got.length}</div>
          <div className="tro-grid">
            {got.map((t) => <button key={t.key} className={`tro got ${t.tier}`} onClick={() => setOpen(t.key)}><span className="tro-em"><Emblem t={t} size={64} /><span className="tro-check" aria-label="Unlocked">✓</span></span><b>{t.name}</b><span>{TIER_LABEL[t.tier]}{R.get(t.key)?.paper ? " · Demo" : ""}</span></button>)}
          </div>
        </>
      )}
      {locked.length > 0 && (
        <>
          <div className="tro-sub"><span className="tro-lockic" aria-hidden><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg></span>Locked · {locked.length}</div>
          <div className="tro-grid">
            {locked.map((t) => {
              const r = R.get(t.key), pct = Math.min(100, Math.round(((r?.value ?? 0) / t.goal) * 100));
              return <button key={t.key} className="tro locked" onClick={() => setOpen(t.key)}><span className="tro-em"><Emblem t={t} locked size={64} /><span className="tro-lock" aria-label="Locked"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg></span></span><b>{t.name}</b><span className="tro-bar"><i style={{ width: `${pct}%` }} /></span></button>;
            })}
          </div>
        </>
      )}
      {open && row && <TrophySheet t={TROPHY[open]} row={row} handle={handle} onClose={() => setOpen(null)} />}
    </section>
  );
}

function progressText(t: Trophy, v: number) {
  if (t.metric === "bestRoi") return `Best closed trade so far: ${v >= 0 ? "+" : ""}${Math.round(v)}% ROI`;
  if (t.metric === "prophet") return "Needs at least 20 resolved calls with 70% hit";
  if (t.metric === "season0") return "Only while real money hasn't opened";
  return `${Math.min(v, t.goal)} of ${t.goal}`;
}

export function TrophySheet({ t, row, handle, onClose }: { t: Trophy; row: TrophyRow; handle: string; onClose: () => void }) {
  const [share, setShare] = useState(false);
  return (
    <Sheet label={t.name} onClose={onClose}>
      <div className="tro-sheet px-5 pb-6">
        <div className={`tro-hero ${row.unlocked ? t.tier : "locked"}`}><Emblem t={t} locked={!row.unlocked} size={150} /></div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2"><span className={`tro-tier ${t.tier}`}>{TIER_LABEL[t.tier]}{row.paper ? " · Demo" : ""}</span><span className={`tro-status ${row.unlocked ? "got" : ""}`}>{row.unlocked ? "✓ Unlocked" : "Locked"}</span></div>
          <h2 className="mt-2 text-[24px] font-extrabold">{t.name}</h2>
          <p className="muted mt-1 text-[14px]">{t.desc}</p>
          <p className="when mt-2">{row.unlocked ? `Unlocked ${when(row.at)} · ${rareText(row.rarity)}` : `${progressText(t, row.value)} · ${rareText(row.rarity)}`}</p>
        </div>
        {row.unlocked && <button className="btn ink mt-4 w-full" style={{ padding: 13, fontSize: 15 }} onClick={() => setShare(true)}>Share this trophy</button>}
      </div>
      {share && <TrophyShare t={t} row={row} handle={handle} onClose={() => setShare(false)} />}
    </Sheet>
  );
}

// ---------- share card ----------
const BGS: { key: string; name: string }[] = [
  ...HERO_BACKGROUNDS.map((h) => ({ key: h.key, name: h.name })),
  ...SHARE_BACKGROUNDS.filter((s) => s.url).map((s) => ({ key: s.key, name: s.name })),
];
const TIER_COLOR: Record<string, string> = { bronze: "#e0a36a", silver: "#dfe4ea", gold: "#f2b63a", obsidian: "#b8a6ff" };
const sans = `"Nunito", system-ui, sans-serif`, mono = `"Barlow", "Nunito", system-ui, sans-serif`;
const cache = new Map<string, Promise<HTMLImageElement | null>>();
function img(src: string) {
  if (!cache.has(src)) cache.set(src, new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }));
  return cache.get(src)!;
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(" "); let line = "", yy = y;
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > max && line) { g.fillText(line, x - g.measureText(line).width / 2, yy); line = w; yy += lh; } else line = t; }
  if (line) g.fillText(line, x - g.measureText(line).width / 2, yy);
}

async function drawTrophy(t: Trophy, row: TrophyRow, handle: string, bgKey: string, origin: string) {
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  await document.fonts?.ready;
  g.fillStyle = "#0b0c0e"; g.fillRect(0, 0, W, H);
  const bg = await img(`/api/share-bg/${bgKey}`);
  if (bg) { const s = Math.max(W / bg.width, H / bg.height); g.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s); }
  const scrim = g.createLinearGradient(0, 0, 0, H); scrim.addColorStop(0, "rgba(5,6,8,.55)"); scrim.addColorStop(.5, "rgba(5,6,8,.6)"); scrim.addColorStop(1, "rgba(5,6,8,.9)");
  g.fillStyle = scrim; g.fillRect(0, 0, W, H);
  const col = TIER_COLOR[t.tier];
  g.strokeStyle = col; g.lineWidth = 6; rr(g, 3, 3, W - 6, H - 6, 46); g.stroke();
  // Tag
  g.font = `900 30px ${sans}`; const tag = `TROPHY UNLOCKED${row.paper ? " · DEMO" : ""}`.split("").join(String.fromCharCode(8202));
  g.fillStyle = col; g.fillText(tag, W / 2 - g.measureText(tag).width / 2, 110);
  // Emblem with glow
  const em = await img(emblemUrl(t));
  g.save(); g.shadowColor = col; g.shadowBlur = 90; g.fillStyle = "rgba(0,0,0,0)"; if (em) g.drawImage(em, W / 2 - 250, 170, 500, 500); g.restore();
  if (em) g.drawImage(em, W / 2 - 250, 170, 500, 500);
  // Name, tier, description
  g.fillStyle = "#fff"; g.font = `900 92px ${sans}`; const nm = t.name; g.fillText(nm, W / 2 - g.measureText(nm).width / 2, 790);
  g.font = `900 34px ${sans}`; g.fillStyle = col; const tl = TIER_LABEL[t.tier].toUpperCase(); g.fillText(tl, W / 2 - g.measureText(tl).width / 2, 850);
  g.font = `700 38px ${sans}`; g.fillStyle = "rgba(255,255,255,.82)"; wrap(g, t.desc, W / 2, 920, 820, 50);
  // Who and how rare
  g.font = `800 36px ${sans}`; g.fillStyle = "#fff"; const by = `${handle} · ${when(row.at)}`; g.fillText(by, W / 2 - g.measureText(by).width / 2, 1050);
  if (row.rarity != null) { g.font = `700 30px ${sans}`; g.fillStyle = "rgba(255,255,255,.6)"; const rt = rareText(row.rarity); g.fillText(rt, W / 2 - g.measureText(rt).width / 2, 1098); }
  // Footer: logo, invite code + link
  const logo = await img("/api/share-bg/logo-wordmark");
  if (logo) { const lh = 60, lw = (logo.width / logo.height) * lh; g.drawImage(logo, 56, H - 56 - lh, lw, lh); }
  const inv = referralLink(origin, handle).replace(/^https?:\/\//, "");
  g.font = `800 26px ${sans}`; g.fillStyle = "rgba(255,255,255,.65)"; const cl = "JOIN WITH CODE"; const cw = g.measureText(cl).width;
  g.font = `900 34px ${mono}`; const code = handle.toUpperCase(); const kw = g.measureText(code).width;
  const bx = W - 56 - (cw + 16 + kw + 32);
  g.font = `800 26px ${sans}`; g.fillText(cl, bx, H - 118);
  g.fillStyle = "#f2b63a"; rr(g, bx + cw + 16, H - 152, kw + 32, 50, 14); g.fill();
  g.font = `900 34px ${mono}`; g.fillStyle = "#1a1300"; g.fillText(code, bx + cw + 32, H - 115);
  g.font = `800 30px ${sans}`; g.fillStyle = "#fff"; g.fillText(inv, W - 56 - g.measureText(inv).width, H - 66);
  return c;
}

export function TrophyShare({ t, row, handle, onClose }: { t: Trophy; row: TrophyRow; handle: string; onClose: () => void }) {
  const [bg, setBg] = useState(() => { try { return localStorage.getItem("perped:trophy-bg") || "hero-chrome"; } catch { return "hero-chrome"; } });
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://perped.pro";
  const invite = referralLink(origin, handle);
  useEffect(() => {
    let off = false; setPng(null);
    drawTrophy(t, row, handle, bg, origin).then((c) => { if (!off) setPng(c.toDataURL("image/png")); }).catch(() => setMsg("Couldn't draw the card"));
    try { localStorage.setItem("perped:trophy-bg", bg); } catch {}
    return () => { off = true; };
  }, [t, row, handle, bg, origin]);
  const share = async () => {
    if (!png) return;
    setBusy(true);
    try {
      const blob = await (await fetch(png)).blob();
      const file = new File([blob], `perped-${handle}-${t.key}.png`, { type: "image/png" });
      const text = `Unlocked ${t.name} on Perped. ${t.desc} Join with my code ${handle}: ${invite}`;
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (navigator.share) await navigator.share({ text, url: invite });
      else { const a = document.createElement("a"); a.href = png; a.download = file.name; a.click(); setMsg("Image saved"); }
    } catch { /* cancelled */ }
    setBusy(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(invite); setMsg("Invite link copied"); } catch {} };
  return (
    <Sheet label={`Share ${t.name}`} onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="text-lg font-extrabold" data-sheet-handle>Share {t.name}</div>
        <div className="bshare-prev mt-3">{png ? <img src={png} alt={`${t.name} trophy card`} /> : <div className="skel" style={{ aspectRatio: "4 / 5", borderRadius: 18 }} />}</div>
        <div className="eyebrow mt-4">Background</div>
        <div className="themes mt-2">{BGS.map((b) => <button key={b.key} type="button" className={`theme-dot ${b.key === bg ? "on" : ""}`} onClick={() => setBg(b.key)} aria-label={b.name}><i style={{ backgroundImage: `url(/api/share-bg/${b.key})` }} /><span>{b.name}</span></button>)}</div>
        {msg && <p className="when mt-2 text-center">{msg}</p>}
        <div className="mt-4 grid grid-cols-[2fr_1fr] gap-2.5">
          <button className="btn ink" onClick={share} disabled={!png || busy}>{busy ? "Opening…" : "Share image"}</button>
          <button className="btn" onClick={copy}>Copy invite</button>
        </div>
      </div>
    </Sheet>
  );
}

/** Feed card for unlocks: "kilo unlocked Giant Slayer". Tap a trophy to open it on their profile. */
export function TrophyPost({ handle, keys, demo, at }: { handle: string; keys: string[]; demo: boolean; at: string }) {
  const ts = keys.map((k) => TROPHY[k]).filter(Boolean).sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  const top = ts[0];
  const { data } = useSWR<{ trophies: TrophyRow[] }>(top ? `/api/achievements/${handle}` : null);
  const [share, setShare] = useState<string | null>(null);
  if (!top) return null;
  const row = (k: string) => data?.trophies.find((r) => r.key === k) ?? { key: k, unlocked: true, at, paper: demo, value: 0, rarity: null };
  return (
    <div className={`tro-post ${top.tier}`}>
      <div className="tro-post-ems">{ts.slice(0, 4).map((t) => <a key={t.key} href={`/u/${handle}?trophy=${t.key}`}><Emblem t={t} size={ts.length > 1 ? 64 : 92} /></a>)}</div>
      <div className="min-w-0 flex-1">
        <span className={`tro-tier ${top.tier}`}>{ts.length > 1 ? `${ts.length} trophies` : TIER_LABEL[top.tier]}{demo ? " · Demo" : ""}</span>
        <div className="mt-1 text-[16px] font-extrabold leading-tight"><a href={`/u/${handle}`}>{handle}</a> unlocked {ts.map((t) => t.name).join(", ")}</div>
        {ts.length === 1 && <div className="when mt-0.5">{top.desc}</div>}
        <button className="tro-share" onClick={() => setShare(top.key)}>Share</button>
      </div>
      {share && <TrophyShare t={TROPHY[share]} row={row(share)} handle={handle} onClose={() => setShare(null)} />}
    </div>
  );
}
