"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import type { FeedRow } from "@/lib/feed";
import { fmtPct, fmtUsd, fmtPrice, pnlForPosition } from "@/lib/format";
import { APP_URL } from "@/lib/config";
import { ticker } from "./ui";
import { SHARE_BACKGROUNDS } from "@/lib/share-backgrounds";
import { useSession } from "@/lib/hooks/useSession";

/* ---------- themes: photo backgrounds, loaded same-origin ---------- */


export type ShareTheme = (typeof SHARE_BACKGROUNDS)[number];
const THEMES = SHARE_BACKGROUNDS;
const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadBg(key: string) {
  if (!imgCache.has(key)) imgCache.set(key, new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `/api/share-bg/${key}`; }));
  return imgCache.get(key)!;
}

/* ---------- drawing ---------- */

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

type CardData = { kind: string; title: string; headline: string; sub: string; lines: string[]; handle: string; loss: boolean; url: string; tag: string };

function cardData(item: FeedRow, mid?: number, shareUrl?: string): CardData {
  const { post, author } = item;
  const handle = author?.handle ?? "Perped";
  const origin = typeof window !== "undefined" && /localhost/.test(APP_URL) ? window.location.origin : APP_URL;
  const url = shareUrl ?? `${origin}/post/${post.id}`;
  const tag = author?.isDemo || post.paper ? "DEMO" : "REAL";
  if (post.kind === "trade") {
    const entry = Number(post.entryPx), size = Number(post.size), lev = post.leverage ?? 1;
    const open = post.status === "open";
    const mark = open ? (mid ?? entry) : Number(post.exitPx ?? entry);
    const { pnl, pct } = pnlForPosition(post.side!, entry, mark, size);
    const roi = pct * lev;
    const held = post.closedAt ? Math.max(1, Math.round((new Date(post.closedAt).getTime() - new Date(post.createdAt).getTime()) / 3_600_000)) : 0;
    const battle = (post.meta as { battle?: { won: boolean | null; vs?: string; myRoi: number; theirRoi: number } } | null)?.battle;
    return {
      kind: open ? "LIVE TRADE" : battle ? (battle.won === true ? "BATTLE WON" : battle.won === false ? "BATTLE LOST" : "BATTLE DRAWN") : "CLOSED TRADE", handle, url, tag, loss: pnl < 0,
      title: `${ticker(post.coin!, true)} · ${post.side === "long" ? "Long" : "Short"} ${lev}×`,
      headline: fmtPct(roi, 1),
      sub: `${fmtUsd(pnl, { sign: true })}${open ? " unrealised" : " banked"}`,
      lines: [`${fmtPrice(entry)} → ${fmtPrice(mark)}`, open ? `${item.copyCount} copied · ${item.fadeCount} faded` : `Held ${held}h · ${item.copyCount} copied · ${item.fadeCount} faded`, ...(battle ? [battle.won === true ? `Perped @${battle.vs} · ${fmtPct(battle.myRoi, 1)} vs ${fmtPct(battle.theirRoi, 1)}` : battle.won === false ? `Perped by @${battle.vs} · ${fmtPct(battle.myRoi, 1)} vs ${fmtPct(battle.theirRoi, 1)}` : `Drew with @${battle.vs}`] : [])],
    };
  }
  if (post.kind === "call") {
    const open = post.callStatus === "open";
    return {
      kind: open ? "PRICE CALL" : post.callStatus === "hit" ? "CALL · HIT" : "CALL · MISSED", handle, url, tag, loss: post.callStatus === "missed",
      title: `${ticker(post.coin!, true)} ${post.side === "long" ? "↑" : "↓"}`,
      headline: fmtPrice(post.targetPx), sub: open ? `by ${post.deadline ? new Date(post.deadline).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "deadline"}` : `resolved at ${fmtPrice(post.resolvedPx)}`,
      lines: [post.body ?? "", `${item.likes} agree · ${item.dislikes} disagree · ${item.commentCount} replies`].filter(Boolean),
    };
  }
  if (post.kind === "poll") {
    const total = item.pollCounts.reduce((a, b) => a + b, 0);
    return { kind: "POLL", handle, url, tag, loss: false, title: post.body ?? "", headline: `${total}`, sub: "votes", lines: (post.options ?? []).map((o, i) => `${o} — ${total ? Math.round((item.pollCounts[i] / total) * 100) : 0}%`) };
  }
  return { kind: post.kind === "system" ? (post.systemType ?? "PERPED").toUpperCase().replace("_", " ") : "POST", handle, url, tag, loss: post.systemType === "liquidation", title: "", headline: "", sub: "", lines: [post.body ?? ""] };
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/); const out: string[] = []; let line = "";
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}

export async function drawCard(theme: ShareTheme, d: CardData): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const light = theme.scrim === "light";
  const brandNew = ["mercury", "liquid", "paper"].includes(theme.key);
  if (light) {
    const bg = g.createRadialGradient(W / 2, H * 0.4, 100, W / 2, H * 0.4, H);
    bg.addColorStop(0, "#ffffff"); bg.addColorStop(1, "#ecedf0"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  } else try {
    const im = await loadBg(theme.key);
    const s = Math.max(W / im.width, H / im.height); const w = im.width * s, h = im.height * s;
    g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  } catch { g.fillStyle = "#0b0b0f"; g.fillRect(0, 0, W, H); }
  // scrim so text always reads
  const sc = theme.scrim === "left" ? g.createLinearGradient(0, 0, W, 0) : theme.scrim === "full" ? g.createLinearGradient(0, 0, 0, H) : g.createLinearGradient(0, 0, 0, H);
  if (theme.scrim === "left") { sc.addColorStop(0, "rgba(0,0,0,.78)"); sc.addColorStop(0.6, "rgba(0,0,0,.35)"); sc.addColorStop(1, "rgba(0,0,0,0)"); }
  else if (theme.scrim === "full") { sc.addColorStop(0, "rgba(0,0,0,.55)"); sc.addColorStop(1, "rgba(0,0,0,.55)"); }
  else { sc.addColorStop(0, "rgba(0,0,0,.8)"); sc.addColorStop(0.55, "rgba(0,0,0,.45)"); sc.addColorStop(1, "rgba(0,0,0,.1)"); }
  if (!light) {
    g.fillStyle = sc; g.fillRect(0, 0, W, H);
    // bottom scrim so the footer reads over bright chrome
    const bs = g.createLinearGradient(0, H - 460, 0, H); bs.addColorStop(0, "rgba(0,0,0,0)"); bs.addColorStop(1, "rgba(0,0,0,.78)");
    g.fillStyle = bs; g.fillRect(0, H - 460, W, 460);
  }
  if (d.loss) { g.fillStyle = "rgba(190,18,60,.28)"; g.fillRect(0, 0, W, H); }
  const col = { fg: theme.textColor, muted: theme.muted, accent: d.loss ? (brandNew ? (light ? "#E5484D" : "#FD6267") : "#fb7185") : theme.accent, mono: theme.textColor };
  if (!light) { g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 14; g.shadowOffsetY = 2; }
  // Use the app's own faces (next/font exposes them as CSS variables on <html>).
  try { await document.fonts.ready; } catch {}
  const root = getComputedStyle(document.documentElement);
  const sans = `${root.getPropertyValue("--font-sans") || ""}, -apple-system, 'Helvetica Neue', Arial, sans-serif`.replace(/^,\s*/, "");
  const mono = `${root.getPropertyValue("--font-mono") || ""}, 'Barlow', system-ui, sans-serif`.replace(/^,\s*/, "");
  // header
  try {
    const logo = await loadBg("logo-wordmark");
    const lw = 340, lh = (logo.height / logo.width) * lw;
    g.save(); g.shadowColor = light ? "rgba(0,0,0,.18)" : "rgba(0,0,0,.6)"; g.drawImage(logo, 72, 186 - lh, lw, lh); g.restore();
  } catch { g.fillStyle = col.fg; g.font = `800 54px ${sans}`; g.fillText("perped.", 80, 180); }
  g.font = `700 26px ${sans}`; g.fillStyle = col.muted; g.fillText(d.kind, 80, 225);
  // tag
  g.font = `900 24px ${sans}`; const tw = g.measureText(d.tag).width + 36;
  roundRect(g, W - 80 - tw, 150, tw, 44, 22); g.fillStyle = d.tag === "DEMO" ? "#f5b50a" : "#22c55e"; g.fill();
  g.fillStyle = d.tag === "DEMO" ? "#1a1200" : "#fff"; g.fillText(d.tag, W - 80 - tw + 18, 181);
  // handle
  g.fillStyle = col.fg; g.font = `600 44px ${sans}`; g.fillText(`@${d.handle}`, 80, 340);
  // title
  let y = 440;
  if (d.title) { g.font = `800 64px ${sans}`; for (const l of wrap(g, d.title, W - 160).slice(0, 2)) { g.fillText(l, 80, y); y += 74; } }
  // headline
  if (d.headline) {
    y += 40; g.fillStyle = col.accent; g.font = `600 ${d.headline.length > 8 ? 150 : 210}px ${mono}`; g.fillText(d.headline, 80, y + 150); y += 190;
    g.fillStyle = col.muted; g.font = `500 44px ${sans}`; g.fillText(d.sub, 80, y + 40); y += 110;
  } else y += 20;
  // lines
  g.fillStyle = col.fg; g.font = `500 40px ${d.kind.includes("TRADE") ? mono : sans}`;
  for (const line of d.lines) for (const l of wrap(g, line, W - 160).slice(0, 4)) { g.fillText(l, 80, y + 40); y += 56; }
  // footer
  g.save(); g.shadowColor = "transparent";
  g.strokeStyle = light ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.22)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(80, H - 200); g.lineTo(W - 80, H - 200); g.stroke(); g.restore();
  let fx = 80;
  try {
    const icon = await loadBg("icon-512");
    g.save(); roundRect(g, 80, H - 168, 96, 96, 24); g.clip(); g.drawImage(icon, 80, H - 168, 96, 96); g.restore(); fx = 200;
  } catch {}
  const path = d.url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
  g.fillStyle = col.fg; g.font = `800 44px ${sans}`; g.fillText("perped.pro", fx, H - 118);
  const dw = g.measureText("perped.pro").width;
  if (path && path !== "/") { g.fillStyle = col.muted; g.font = `600 30px ${sans}`; g.fillText(path, fx + dw + 6, H - 118); }
  g.fillStyle = col.muted; g.font = `500 26px ${sans}`;
  g.fillText("Verified on Hyperliquid · every trade is a post", fx, H - 78);
  return c;
}

/* ---------- sheet ---------- */

/** Share any post as an image: five backgrounds, native share, save, X, copy link. */
export function ShareSheet({ item, mid, onClose }: { item: FeedRow; mid?: number; onClose: () => void }) {
  const [themeId, setThemeId] = useState<string>(() => { try { return localStorage.getItem("perped:share-theme") || "mercury"; } catch { return "mercury"; } });
  const [img, setImg] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const { profile } = useSession();
  // Open trades and calls share as a challenge: the link lands on /c/:id, takes the other side in one tap,
  // and carries the sharer's referral so they earn on everything the newcomer trades.
  const origin = typeof window !== "undefined" ? window.location.origin : APP_URL;
  const challengeable = (item.post.kind === "trade" && item.post.status === "open") || (item.post.kind === "call" && item.post.callStatus === "open");
  const refQ = profile ? `?ref=${profile.handle}` : "";
  const challengeUrl = challengeable ? `${origin}/c/${item.post.id}${refQ}` : undefined;
  // Freeze the price when the sheet opens so the card isn't redrawn on every tick.
  const [mid0] = useState(mid);
  const data = useMemo(() => cardData(item, mid0, challengeUrl), [item, mid0, challengeUrl]);
  const mine = !!profile && item.author?.id === profile.id;
  const theme = THEMES.find((t) => t.key === themeId) ?? THEMES[0];
  useEffect(() => {
    let live = true;
    drawCard(theme, data).then((c) => { if (!live) return; try { setImg(c.toDataURL("image/png")); localStorage.setItem("perped:share-theme", theme.key); } catch { setImg(""); } }).catch(() => setImg(""));
    return () => { live = false; };
  }, [theme, data]);

  const text = challengeable
    ? (mine ? `I'm ${item.post.side} ${data.title}. Think I'm wrong? Fade me on Perped:` : `@${data.handle} is ${item.post.side} ${data.title}. Fade them with me on Perped:`)
    : `${data.handle} · ${data.kind.toLowerCase()} · ${data.title} ${data.headline} on Perped`;
  const file = async () => { const blob = await (await fetch(img)).blob(); return new File([blob], `perped-${item.post.id}.png`, { type: "image/png" }); };
  const nativeShare = async () => {
    try {
      const f = await file();
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [f] }))) { await navigator.share({ files: [f], text, url: data.url }); return; }
      if (navigator.share) { await navigator.share({ text, url: data.url }); return; }
      save();
    } catch { /* cancelled */ }
  };
  const save = () => { const a = document.createElement("a"); a.download = `perped-${item.post.id}.png`; a.href = img; a.click(); };
  const copyLink = async () => { try { await navigator.clipboard.writeText(data.url); setMsg(challengeable ? "Challenge link copied" : "Link copied"); setTimeout(() => setMsg(null), 1500); } catch {} };
  const shareX = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(data.url)}`;

  return (
    <Sheet label="Share" onClose={onClose}>
        <div className="flex flex-col items-center gap-3.5 px-5 pb-5">
          {img ? <img src={img} alt="Share card preview" className="share-prev" /> : <div className="share-prev" />}
          <div className="themes">
            {THEMES.map((t) => <button key={t.key} type="button" className={`theme-dot ${t.key === themeId ? "on" : ""}`} onClick={() => setThemeId(t.key)} aria-label={t.name}><i style={t.scrim === "light" ? { background: "linear-gradient(160deg,#fff,#e6e7ea)" } : { backgroundImage: `url(/api/share-bg/${t.key})` }} /><span>{t.name}</span></button>)}
          </div>
          <div className="grid w-full grid-cols-2 gap-2.5">
            <button className="btn brand" style={{ padding: 12 }} onClick={nativeShare}>{challengeable ? "Challenge a friend" : "Share"}</button>
            <button className="btn ghostline" style={{ padding: 12 }} onClick={save}>Save image</button>
            <a className="btn ink" style={{ padding: 12 }} href={shareX} target="_blank" rel="noreferrer">Post to X</a>
            <button className="btn ghostline" style={{ padding: 12 }} onClick={copyLink}>{msg ?? (challengeable ? "Copy challenge link" : "Copy link")}</button>
          </div>
          <p className="faint text-center text-xs">{challengeable ? (profile ? "Your link is an invite: anyone who joins through it gets reduced fees, and you earn a cut of every fee they ever pay." : "Cards show the real numbers. Losses too.") : "Cards show the real numbers. Losses too. Nobody edits a receipt."}</p>
        </div>
    </Sheet>
  );
}
