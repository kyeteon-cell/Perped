"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeedRow } from "@/lib/feed";
import { fmtPct, fmtUsd, fmtPrice, pnlForPosition } from "@/lib/format";
import { APP_URL } from "@/lib/config";
import { ticker } from "./ui";

/* ---------- themes ---------- */

export type ShareTheme = { id: string; name: string; paint: (g: CanvasRenderingContext2D, W: number, H: number, loss: boolean) => { fg: string; muted: string; accent: string; mono: string } };

const THEMES: ShareTheme[] = [
  {
    id: "mint", name: "Mint",
    paint(g, W, H, loss) {
      const gr = g.createLinearGradient(0, 0, W, H);
      if (loss) { gr.addColorStop(0, "#9f1239"); gr.addColorStop(0.55, "#7f1d1d"); gr.addColorStop(1, "#3b0a0a"); } else { gr.addColorStop(0, "#0f766e"); gr.addColorStop(0.55, "#065f46"); gr.addColorStop(1, "#052e2b"); }
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.12; g.fillStyle = "#fff"; g.beginPath(); g.arc(W * 0.85, H * 0.12, 260, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      return { fg: "#fff", muted: "rgba(255,255,255,.72)", accent: "#fff", mono: "#fff" };
    },
  },
  {
    id: "midnight", name: "Midnight",
    paint(g, W, H, loss) {
      g.fillStyle = "#0b1020"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 2;
      for (let x = 0; x <= W; x += 90) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y <= H; y += 90) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      const glow = g.createRadialGradient(W * 0.3, H * 0.55, 20, W * 0.3, H * 0.55, 620);
      glow.addColorStop(0, loss ? "rgba(244,63,94,.45)" : "rgba(34,197,94,.45)"); glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
      return { fg: "#fff", muted: "rgba(255,255,255,.6)", accent: loss ? "#fb7185" : "#4ade80", mono: "#fff" };
    },
  },
  {
    id: "sunset", name: "Sunset",
    paint(g, W, H) {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, "#ff7a3d"); gr.addColorStop(0.5, "#ff4d6d"); gr.addColorStop(1, "#7c2d9c");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(255,230,120,.9)"; g.beginPath(); g.arc(W * 0.78, H * 0.3, 190, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(0,0,0,.18)"; for (let i = 0; i < 7; i++) g.fillRect(0, H * 0.3 + 40 + i * 34, W, 10);
      return { fg: "#fff", muted: "rgba(255,255,255,.8)", accent: "#fff", mono: "#fff" };
    },
  },
  {
    id: "terminal", name: "Terminal",
    paint(g, W, H, loss) {
      g.fillStyle = "#050806"; g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(0,255,120,.05)"; for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
      const c = loss ? "#ff5f56" : "#39ff88";
      g.strokeStyle = c; g.lineWidth = 3; g.strokeRect(40, 40, W - 80, H - 80);
      g.fillStyle = c; g.font = "500 30px ui-monospace, Menlo, monospace"; g.fillText("> perped --receipt", 80, 110);
      return { fg: c, muted: loss ? "rgba(255,95,86,.7)" : "rgba(57,255,136,.7)", accent: c, mono: c };
    },
  },
  {
    id: "paper", name: "Paper",
    paint(g, W, H) {
      g.fillStyle = "#f7f3ea"; g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(0,0,0,.035)"; for (let i = 0; i < 400; i++) g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
      g.setLineDash([14, 12]); g.strokeStyle = "#1c1917"; g.lineWidth = 3; g.strokeRect(50, 50, W - 100, H - 100); g.setLineDash([]);
      // torn edge
      g.fillStyle = "#f7f3ea"; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 36) g.lineTo(x + 18, H - 28); g.lineTo(W, H); g.closePath(); g.fill();
      return { fg: "#1c1917", muted: "rgba(28,25,23,.6)", accent: "#1c1917", mono: "#1c1917" };
    },
  },
];

/* ---------- drawing ---------- */

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

type CardData = { kind: string; title: string; headline: string; sub: string; lines: string[]; handle: string; loss: boolean; url: string; tag: string };

function cardData(item: FeedRow, mid?: number): CardData {
  const { post, author } = item;
  const handle = author?.handle ?? "Perped";
  const url = `${APP_URL}/post/${post.id}`;
  const tag = author?.isDemo || post.paper ? "DEMO" : "REAL";
  if (post.kind === "trade") {
    const entry = Number(post.entryPx), size = Number(post.size), lev = post.leverage ?? 1;
    const open = post.status === "open";
    const mark = open ? (mid ?? entry) : Number(post.exitPx ?? entry);
    const { pnl, pct } = pnlForPosition(post.side!, entry, mark, size);
    const roi = pct * lev;
    const held = post.closedAt ? Math.max(1, Math.round((new Date(post.closedAt).getTime() - new Date(post.createdAt).getTime()) / 3_600_000)) : 0;
    return {
      kind: open ? "LIVE TRADE" : "CLOSED TRADE", handle, url, tag, loss: pnl < 0,
      title: `${ticker(post.coin!, true)} · ${post.side === "long" ? "Long" : "Short"} ${lev}×`,
      headline: fmtPct(roi, 1),
      sub: `${fmtUsd(pnl, { sign: true })}${open ? " unrealised" : " banked"}`,
      lines: [`${fmtPrice(entry)} → ${fmtPrice(mark)}`, open ? `${item.copyCount} copied · ${item.fadeCount} faded` : `Held ${held}h · ${item.copyCount} copied · ${item.fadeCount} faded`],
    };
  }
  if (post.kind === "call") {
    const open = post.callStatus === "open";
    return {
      kind: open ? "PRICE CALL" : post.callStatus === "hit" ? "CALL · HIT" : "CALL · MISSED", handle, url, tag, loss: post.callStatus === "missed",
      title: `${ticker(post.coin!, true)} ${post.side === "long" ? "↑" : "↓"}`,
      headline: fmtPrice(post.targetPx), sub: open ? `by ${post.deadline ? new Date(post.deadline).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "deadline"}` : `resolved at ${fmtPrice(post.resolvedPx)}`,
      lines: [post.body ?? "", `${item.likes} 👍 · ${item.dislikes} 👎 · ${item.commentCount} replies`].filter(Boolean),
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

export function drawCard(theme: ShareTheme, d: CardData): HTMLCanvasElement {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const col = theme.paint(g, W, H, d.loss);
  const sans = "-apple-system, 'Inter', 'Helvetica Neue', Arial, sans-serif";
  const mono = "ui-monospace, 'SF Mono', Menlo, monospace";
  // header
  g.fillStyle = col.fg; g.font = `800 54px ${sans}`; g.fillText("Perped", 80, 180);
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
  g.fillStyle = col.muted; g.font = `500 32px ${sans}`;
  g.fillText("Verified on Hyperliquid · every trade is a post", 80, H - 150);
  g.fillText(d.url.replace(/^https?:\/\//, ""), 80, H - 100);
  return c;
}

/* ---------- sheet ---------- */

/** Share any post as an image: five backgrounds, native share, save, X, copy link. */
export function ShareSheet({ item, mid, onClose }: { item: FeedRow; mid?: number; onClose: () => void }) {
  const [themeId, setThemeId] = useState<string>(() => { try { return localStorage.getItem("perped:share-theme") || "mint"; } catch { return "mint"; } });
  const [img, setImg] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const data = useMemo(() => cardData(item, mid), [item, mid]);
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  useEffect(() => { try { setImg(drawCard(theme, data).toDataURL("image/png")); localStorage.setItem("perped:share-theme", theme.id); } catch { setImg(""); } }, [theme, data]);

  const text = `${data.handle} · ${data.kind.toLowerCase()} · ${data.title} ${data.headline} on Perped`;
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
  const copyLink = async () => { try { await navigator.clipboard.writeText(data.url); setMsg("Link copied"); setTimeout(() => setMsg(null), 1500); } catch {} };
  const shareX = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(data.url)}`;

  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Share">
        <div className="grab" />
        <div className="flex flex-col items-center gap-3.5 px-5 pb-5">
          {img ? <img src={img} alt="Share card preview" className="share-prev" /> : <div className="share-prev" />}
          <div className="themes">
            {THEMES.map((t) => <button key={t.id} className={`theme-dot ${t.id} ${t.id === themeId ? "on" : ""}`} onClick={() => setThemeId(t.id)} aria-label={t.name}><span>{t.name}</span></button>)}
          </div>
          <div className="grid w-full grid-cols-2 gap-2.5">
            <button className="btn brand" style={{ padding: 12 }} onClick={nativeShare}>Share</button>
            <button className="btn" style={{ padding: 12 }} onClick={save}>Save image</button>
            <a className="btn ink" style={{ padding: 12 }} href={shareX} target="_blank" rel="noreferrer">Post to X</a>
            <button className="btn" style={{ padding: 12 }} onClick={copyLink}>{msg ?? "Copy link"}</button>
          </div>
          <p className="faint text-center text-xs">Cards show the real numbers. Losses too. Nobody edits a receipt.</p>
        </div>
      </div>
    </>
  );
}
