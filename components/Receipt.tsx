"use client";

import { useRef, useState } from "react";
import type { FeedRow } from "@/lib/feed";
import { fmtPct, fmtUsd, fmtPrice } from "@/lib/format";
import { Avatar, CoinMark, ticker } from "./ui";
import { APP_URL } from "@/lib/config";

/** Share card for a closed trade. Rendered as DOM; "Share to X" posts text + link, "Save image" uses canvas. */
export function Receipt({ item, onClose }: { item: FeedRow; onClose: () => void }) {
  const { post, author } = item;
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<"win" | "clean" | "roast">("win");
  const entry = Number(post.entryPx), exit = Number(post.exitPx ?? entry), lev = post.leverage ?? 1;
  const roi = ((exit - entry) / entry) * 100 * (post.side === "long" ? 1 : -1) * lev;
  const pnl = Number(post.realizedPnl ?? 0);
  const loss = pnl < 0;
  const held = post.closedAt ? Math.round((new Date(post.closedAt).getTime() - new Date(post.createdAt).getTime()) / 3_600_000) : 0;
  const text = `${author?.handle} ${post.side} ${ticker(post.coin!, true)} ${lev}× · ${fmtPct(roi, 1)} (${fmtUsd(pnl, { sign: true })}) · verified on Hyperliquid via Perped`;
  const url = `${APP_URL}/post/${post.id}`;
  const shareX = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  const save = async () => {
    // Draw a simple canvas version so the image can be saved without a DOM-to-image library.
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 1080, 1350);
    if (loss) { grad.addColorStop(0, "#9f1239"); grad.addColorStop(1, "#3b0a0a"); } else { grad.addColorStop(0, "#0f766e"); grad.addColorStop(1, "#052e2b"); }
    g.fillStyle = grad; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = "#fff"; g.font = "bold 56px sans-serif"; g.fillText("Perped", 80, 140);
    g.font = "600 48px sans-serif"; g.fillText(`${author?.handle} · ${post.side === "long" ? "Long" : "Short"} ${lev}×`, 80, 320);
    g.font = "bold 96px sans-serif"; g.fillText(post.coin ?? "", 80, 460);
    g.font = "600 220px monospace"; g.fillText(fmtPct(roi, 1), 80, 760);
    g.font = "48px monospace"; g.fillText(`${fmtPrice(entry)} → ${fmtPrice(exit)}   ${fmtUsd(pnl, { sign: true })}`, 80, 880);
    g.font = "40px sans-serif"; g.fillText(`Held ${held}h · ${item.copyCount} copied · ${item.fadeCount} faded`, 80, 980);
    g.globalAlpha = 0.7; g.font = "36px sans-serif"; g.fillText(`Verified on Hyperliquid · ${url.replace(/^https?:\/\//, "")}`, 80, 1260);
    const a = document.createElement("a"); a.download = `perped-${post.coin}-${post.id}.png`; a.href = c.toDataURL("image/png"); a.click();
  };

  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet">
        <div className="grab" />
        <div className="flex flex-col items-center gap-4 px-5 pb-4">
          <div ref={ref} className={`receipt ${loss ? "loss" : ""}`}>
            <div className="flex items-center justify-between"><span className="font-extrabold tracking-tight">Perped</span><span className="text-xs opacity-70">{post.closedAt ? new Date(post.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span></div>
            <div className="mt-4 flex items-center gap-2.5 text-sm">{author && <Avatar handle={author.handle} url={author.avatarUrl} size={32} />}<b>{author?.handle}</b><span className="lbl ml-auto" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}><i />{post.side === "long" ? "Long" : "Short"} {lev}×</span></div>
            <div className="mt-4 flex items-center gap-2.5 text-[22px] font-bold tracking-tight"><CoinMark coin={post.coin!} />{ticker(post.coin!, true)}</div>
            <div className="mono mt-1.5 text-[56px] font-semibold leading-none tracking-tighter">{style === "roast" && loss ? "got perped" : fmtPct(roi, 1)}</div>
            <div className="mono mt-3 flex justify-between text-sm opacity-90"><span>{fmtPrice(entry)} → {fmtPrice(exit)}</span><span>{fmtUsd(pnl, { sign: true })}</span></div>
            <div className="mt-3 flex justify-between text-sm opacity-90"><span>Held {held} h</span><span>{item.copyCount} copied · {item.fadeCount} faded</span></div>
            <div className="mt-4 text-[11px] opacity-60">Verified on Hyperliquid · {url.replace(/^https?:\/\//, "")}</div>
          </div>
          <div className="seg">{(["win", "clean", "roast"] as const).map((s) => <button key={s} className={`chip capitalize ${style === s ? "on" : ""}`} onClick={() => setStyle(s)}>{s === "win" ? (loss ? "Honest" : "Win style") : s}</button>)}</div>
          <div className="grid w-full grid-cols-2 gap-2.5"><a className="btn brand" style={{ padding: 12 }} href={shareX} target="_blank" rel="noreferrer">Share to X</a><button className="btn" style={{ padding: 12 }} onClick={save}>Save image</button></div>
          <p className="faint text-center text-xs">Receipts are generated for every closed trade. Losses too. Nobody edits a receipt.</p>
        </div>
      </div>
    </>
  );
}
