"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { SHARE_BACKGROUNDS, HERO_BACKGROUNDS } from "@/lib/share-backgrounds";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";

/** One fighter as the card needs it. */
export type ShareFighter = { handle: string; avatarUrl: string | null; demo: boolean; side: "long" | "short"; lev: number; roi: number; pnl: number; entry: number; exit: number | null; lead: boolean };
export type BattleShareData = { coin: string; price: number; status: "LIVE FADE" | "CHASE ON" | "SETTLED"; age: string; faderHandle: string; a: ShareFighter; b: ShareFighter; box: null | { title: string; headline: string; headlineValue?: { text: string; good: boolean }; line: string }; gap: number; leaderHandle: string; share: number; url: string };

/** Backgrounds: the fight-night photo the in-app card uses first, then the brand photos. */
const BGS: { key: string; name: string }[] = [
  ...HERO_BACKGROUNDS.map((h) => ({ key: h.key, name: h.name })),
  ...SHARE_BACKGROUNDS.filter((s) => s.url).map((s) => ({ key: s.key, name: s.name })),
];

const cache = new Map<string, Promise<HTMLImageElement | null>>();
function img(src: string) {
  if (!cache.has(src)) cache.set(src, new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }));
  return cache.get(src)!;
}
const avatarSrc = (u: string | null) => (!u ? null : u.startsWith("/") ? u : `/api/img?u=${encodeURIComponent(u)}`);

const G = "#05e091", R = "#fd6267", GOLD = "#f2b63a", VIOLET = "#a78bfa";
const sans = `"Nunito", system-ui, sans-serif`, mono = `"Barlow", "Nunito", system-ui, sans-serif`;

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function center(g: CanvasRenderingContext2D, text: string, x: number, y: number) { g.fillText(text, x - g.measureText(text).width / 2, y); }

/** Draws the battle scorecard as it looks in the app, on the chosen background. 1080×1350 (4:5, fits X and Instagram). */
async function draw(d: BattleShareData, bgKey: string) {
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  await document.fonts?.ready;
  // Background: photo cover-fit, darkened so the card reads on any image.
  g.fillStyle = "#0b0c0e"; g.fillRect(0, 0, W, H);
  const bg = await img(`/api/share-bg/${bgKey}`);
  if (bg) { const s = Math.max(W / bg.width, H / bg.height); g.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s); }
  const scrim = g.createLinearGradient(0, 0, 0, H); scrim.addColorStop(0, "rgba(5,6,8,.55)"); scrim.addColorStop(.5, "rgba(5,6,8,.45)"); scrim.addColorStop(1, "rgba(5,6,8,.78)");
  g.fillStyle = scrim; g.fillRect(0, 0, W, H);
  // Gold rim like the in-app card
  g.strokeStyle = "rgba(242,182,58,.85)"; g.lineWidth = 6; rr(g, 3, 3, W - 6, H - 6, 46); g.stroke();

  // Header
  g.font = `900 34px ${sans}`; g.fillStyle = VIOLET;
  g.beginPath(); g.arc(62, 82, 7, 0, Math.PI * 2); g.fill();
  g.fillText(`${d.status} · ${d.age}`.toUpperCase().split("").join(String.fromCharCode(8202)), 84, 94);
  g.font = `800 40px ${mono}`; g.fillStyle = "#fff";
  const right = `${d.coin}  ${fmtPrice(d.price)}`; g.fillText(right, W - 56 - g.measureText(right).width, 96);

  // Fighters
  const cols = [270, 810];
  for (const [i, f] of [d.a, d.b].entries()) {
    const cx = cols[i], cy = 300, r = 118;
    if (f.lead) { g.save(); g.shadowColor = GOLD; g.shadowBlur = 60; g.fillStyle = "rgba(242,182,58,.35)"; g.beginPath(); g.arc(cx, cy, r + 18, 0, Math.PI * 2); g.fill(); g.restore(); }
    g.lineWidth = 10; g.strokeStyle = f.lead ? GOLD : f.side === "long" ? G : R; g.beginPath(); g.arc(cx, cy, r + 10, 0, Math.PI * 2); g.stroke();
    const src = avatarSrc(f.avatarUrl), av = src ? await img(src) : null;
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    if (av) { const s = Math.max((r * 2) / av.width, (r * 2) / av.height); g.drawImage(av, cx - (av.width * s) / 2, cy - (av.height * s) / 2, av.width * s, av.height * s); }
    else { const gr = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r); gr.addColorStop(0, "#fff"); gr.addColorStop(1, "#858a92"); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); g.fillStyle = "#0b0c0e"; g.font = `900 100px ${sans}`; center(g, f.handle.slice(0, 1).toUpperCase(), cx, cy + 36); }
    g.restore();
    g.fillStyle = f.lead ? GOLD : "#fff"; g.font = `800 52px ${sans}`; center(g, f.handle.length > 14 ? f.handle.slice(0, 13) + "…" : f.handle, cx, 498);
    // demo/real tag
    g.font = `900 26px ${sans}`; const tag = f.demo ? "DEMO" : "REAL", tw = g.measureText(tag).width + 40;
    g.fillStyle = f.demo ? "#c98a05" : "#2563eb"; rr(g, cx - tw / 2, 524, tw, 44, 22); g.fill(); g.fillStyle = f.demo ? "#2a1c00" : "#fff"; center(g, tag, cx, 556);
    // side pill
    g.font = `800 36px ${sans}`; const st = `●  ${f.side === "long" ? "Long" : "Short"} ${f.lev}×`, sw = g.measureText(st).width + 64;
    g.fillStyle = f.side === "long" ? "#e6fbf2" : "#fdeced"; rr(g, cx - sw / 2, 592, sw, 70, 35); g.fill();
    g.fillStyle = f.side === "long" ? "#04b877" : "#e5484d"; center(g, st, cx, 640);
    // ROI, $ and entry
    g.font = `800 104px ${mono}`; g.fillStyle = f.roi >= 0 ? G : R; center(g, fmtPct(f.roi, 1), cx, 772);
    g.font = `700 38px ${mono}`; center(g, fmtUsd(f.pnl, { sign: true }), cx, 824);
    g.font = `600 32px ${sans}`; g.fillStyle = "rgba(255,255,255,.75)"; center(g, `in at ${fmtPrice(f.entry)}${f.exit != null ? ` · out ${fmtPrice(f.exit)}` : ""}`, cx, 872);
  }
  g.font = `900 64px ${sans}`; g.fillStyle = "#fff"; center(g, "VS", W / 2, 300);
  g.font = `600 32px ${sans}`; g.fillStyle = "rgba(255,255,255,.75)"; center(g, `${d.faderHandle} faded`, W / 2, 352);

  // Bank & chase / verdict box
  let y = 912;
  if (d.box) {
    g.fillStyle = "rgba(245,246,248,.94)"; rr(g, 56, y, W - 112, 196, 32); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 3; rr(g, 56, y, W - 112, 196, 32); g.stroke();
    g.fillStyle = "#6e727a"; g.font = `900 26px ${sans}`; g.fillText(d.box.title.toUpperCase(), 96, y + 52);
    g.fillStyle = "#0f1012"; g.font = `800 42px ${sans}`; g.fillText(d.box.headline, 96, y + 112);
    if (d.box.headlineValue) { const hw = g.measureText(d.box.headline + " ").width; g.fillStyle = d.box.headlineValue.good ? "#04b877" : "#e5484d"; g.font = `800 42px ${mono}`; g.fillText(d.box.headlineValue.text, 96 + hw, y + 112); }
    g.fillStyle = "#33363c"; g.font = `600 30px ${sans}`; g.fillText(d.box.line.length > 58 ? d.box.line.slice(0, 57) + "…" : d.box.line, 96, y + 162);
    y += 236;
  } else y += 40;

  // Tug bar with bead
  const tx = 56, tw = W - 112, th = 22, split = tx + (tw * Math.max(4, Math.min(96, d.share))) / 100;
  g.fillStyle = d.a.side === "long" ? G : R; rr(g, tx, y, split - tx, th, th / 2); g.fill();
  g.fillStyle = d.b.side === "long" ? G : R; rr(g, split, y, tx + tw - split, th, th / 2); g.fill();
  const bead = g.createRadialGradient(split - 6, y + th / 2 - 6, 2, split, y + th / 2, 22); bead.addColorStop(0, "#fff"); bead.addColorStop(.6, "#c9ccd1"); bead.addColorStop(1, "#858a92");
  g.fillStyle = bead; g.beginPath(); g.arc(split, y + th / 2, 22, 0, Math.PI * 2); g.fill();

  // Gap
  y += 140;
  g.font = `800 120px ${mono}`; const gt = `${d.gap.toFixed(1)}%`, gw = g.measureText(gt).width;
  g.font = `800 40px ${sans}`; const lt = `${d.leaderHandle} ahead`, lw = g.measureText(lt).width;
  const gx = (W - gw - 24 - lw) / 2;
  g.save(); g.shadowColor = "rgba(242,182,58,.6)"; g.shadowBlur = 30; g.font = `800 120px ${mono}`; g.fillStyle = "#fff"; g.fillText(gt, gx, y); g.restore();
  g.font = `800 40px ${sans}`; g.fillStyle = GOLD; g.fillText(lt, gx + gw + 24, y - 6);

  // Footer
  const logo = await img("/api/share-bg/logo-wordmark");
  if (logo) { const lh = 64, lw2 = (logo.width / logo.height) * lh; g.drawImage(logo, 56, H - 56 - lh, lw2, lh); }
  g.font = `800 34px ${sans}`; g.fillStyle = "#fff"; const ft = "Pick a side · perped.pro"; g.fillText(ft, W - 56 - g.measureText(ft).width, H - 72);
  return c;
}

export function BattleShare({ data, onClose }: { data: BattleShareData; onClose: () => void }) {
  const [bg, setBg] = useState(() => { try { return localStorage.getItem("perped:battle-bg") || "hero-bulls"; } catch { return "hero-bulls"; } });
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Freeze the numbers when the sheet opens so the card doesn't redraw every tick.
  const [frozen] = useState(data);
  const key = useMemo(() => bg, [bg]);
  useEffect(() => {
    let off = false;
    setPng(null);
    draw(frozen, key).then((c) => { if (!off) setPng(c.toDataURL("image/png")); }).catch(() => setMsg("Couldn't draw the card"));
    try { localStorage.setItem("perped:battle-bg", key); } catch {}
    return () => { off = true; };
  }, [frozen, key]);

  const share = async () => {
    if (!png) return;
    setBusy(true);
    try {
      const blob = await (await fetch(png)).blob();
      const file = new File([blob], `perped-${frozen.a.handle}-vs-${frozen.b.handle}.png`, { type: "image/png" });
      const text = `${frozen.a.handle} vs ${frozen.b.handle} on ${frozen.coin}. Pick a side on Perped ${frozen.url}`;
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (navigator.share) await navigator.share({ text, url: frozen.url });
      else { const a = document.createElement("a"); a.href = png; a.download = file.name; a.click(); setMsg("Image saved"); }
    } catch { /* cancelled */ }
    setBusy(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(frozen.url); setMsg("Link copied"); } catch {} };

  return (
    <Sheet label="Share this fade" onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="text-lg font-extrabold" data-sheet-handle>Share this fade</div>
        <div className="bshare-prev mt-3">{png ? <img src={png} alt="Fade scorecard" /> : <div className="skel" style={{ aspectRatio: "4 / 5", borderRadius: 18 }} />}</div>
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
