"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/hl-info";

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type Mode = "candles" | "line";
const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Trading-grade chart (TradingView lightweight-charts): candles or line, volume, six intervals,
 * pinch-zoom and drag to pan, crosshair with OHLC, live last candle from the WebSocket mid.
 */
export function PriceChart({ coin, livePx }: { coin: string; livePx?: number }) {
  const [interval, setInterval_] = useState<Interval>(() => { try { return (localStorage.getItem("perped-chart-iv") as Interval) || "15m"; } catch { return "15m"; } });
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem("perped-chart") as Mode) || "candles"; } catch { return "candles"; } });
  const [legend, setLegend] = useState<Candle | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const main = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);
  const vol = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastRef = useRef<Candle | null>(null);

  const { data } = useSWR<{ candles: Candle[] }>(`/api/markets/${coin}/candles?interval=${interval}&limit=500`, {
    refreshInterval: interval === "1m" ? 15_000 : interval === "5m" ? 30_000 : 60_000,
  });
  const candles = data?.candles ?? [];
  const up = candles.length > 1 ? candles[candles.length - 1].c >= candles[0].o : true;

  // Build the chart once per mode; data and theme are applied in the effects below.
  useEffect(() => {
    const el = box.current; if (!el) return;
    const green = cssVar("--green", "#16a34a"), red = cssVar("--red", "#dc2626"), text = cssVar("--muted", "#888"), line = cssVar("--line", "#eee");
    const ch = createChart(el, {
      width: el.clientWidth, height: 260,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10 },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line, scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: { borderColor: line, timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 7 },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    const s = mode === "candles"
      ? ch.addCandlestickSeries({ upColor: green, downColor: red, borderVisible: false, wickUpColor: green, wickDownColor: red })
      : ch.addAreaSeries({ lineColor: green, topColor: green + "44", bottomColor: green + "00", lineWidth: 2 });
    const v = ch.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
    ch.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = ch; main.current = s; vol.current = v;

    ch.subscribeCrosshairMove((p) => {
      if (!p.time || !p.seriesData.size) return setLegend(lastRef.current);
      const d = p.seriesData.get(s) as { open?: number; high?: number; low?: number; close?: number; value?: number } | undefined;
      const vd = p.seriesData.get(v) as { value?: number } | undefined;
      if (!d) return;
      const t = (p.time as number) * 1000;
      setLegend({ t, o: d.open ?? d.value ?? 0, h: d.high ?? d.value ?? 0, l: d.low ?? d.value ?? 0, c: d.close ?? d.value ?? 0, v: vd?.value ?? 0 });
    });
    const ro = new ResizeObserver(() => ch.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); ch.remove(); chart.current = null; main.current = null; vol.current = null; };
  }, [mode]);

  // Push data whenever candles or interval change.
  useEffect(() => {
    const s = main.current, v = vol.current; if (!s || !v || !candles.length) return;
    const green = cssVar("--green", "#16a34a"), red = cssVar("--red", "#dc2626");
    if (mode === "candles") (s as ISeriesApi<"Candlestick">).setData(candles.map((c) => ({ time: (c.t / 1000) as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c })));
    else {
      const col = up ? green : red;
      (s as ISeriesApi<"Area">).applyOptions({ lineColor: col, topColor: col + "44", bottomColor: col + "00" });
      (s as ISeriesApi<"Area">).setData(candles.map((c) => ({ time: (c.t / 1000) as UTCTimestamp, value: c.c })));
    }
    v.setData(candles.map((c) => ({ time: (c.t / 1000) as UTCTimestamp, value: c.v, color: (c.c >= c.o ? green : red) + "55" })));
    lastRef.current = candles[candles.length - 1];
    setLegend((l) => l ?? lastRef.current);
  }, [candles, mode, up]);

  // Live tick: move the last candle with the WebSocket mid.
  useEffect(() => {
    const s = main.current, last = lastRef.current; if (!s || !last || !livePx) return;
    const upd = { ...last, c: livePx, h: Math.max(last.h, livePx), l: Math.min(last.l, livePx) };
    lastRef.current = upd;
    if (mode === "candles") (s as ISeriesApi<"Candlestick">).update({ time: (upd.t / 1000) as UTCTimestamp, open: upd.o, high: upd.h, low: upd.l, close: upd.c });
    else (s as ISeriesApi<"Area">).update({ time: (upd.t / 1000) as UTCTimestamp, value: upd.c });
    setLegend((l) => (l && l.t === upd.t ? upd : l));
  }, [livePx, mode]);

  const setIv = (iv: Interval) => { setInterval_(iv); setLegend(null); try { localStorage.setItem("perped-chart-iv", iv); } catch {} };
  const setModeP = (m: Mode) => { setMode(m); try { localStorage.setItem("perped-chart", m); } catch {} };
  const digits = (legend?.c ?? 0) >= 1000 ? 1 : (legend?.c ?? 0) >= 10 ? 2 : (legend?.c ?? 0) >= 1 ? 3 : 5;
  const f = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const ch = legend && legend.o ? ((legend.c - legend.o) / legend.o) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="seg">{(["candles", "line"] as Mode[]).map((m) => <button key={m} onClick={() => setModeP(m)} className={`chip ${m === mode ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }}>{m === "candles" ? "Candles" : "Line"}</button>)}</div>
        <div className="flex gap-1">{INTERVALS.map((iv) => <button key={iv} onClick={() => setIv(iv)} className={`chip uppercase ${iv === interval ? "on" : ""}`} style={{ padding: "6px 8px", fontSize: 11 }}>{iv}</button>)}</div>
      </div>
      {legend && (
        <div className="mono mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
          <span>{new Date(legend.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span>O <b style={{ color: "var(--text)" }}>{f(legend.o)}</b></span>
          <span>H <b style={{ color: "var(--text)" }}>{f(legend.h)}</b></span>
          <span>L <b style={{ color: "var(--text)" }}>{f(legend.l)}</b></span>
          <span>C <b style={{ color: legend.c >= legend.o ? "var(--green)" : "var(--red)" }}>{f(legend.c)} {ch >= 0 ? "+" : ""}{ch.toFixed(2)}%</b></span>
        </div>
      )}
      <div className="relative mt-1.5">
        <div ref={box} className="w-full" style={{ height: 260 }} />
        {!candles.length && <p className="muted absolute inset-0 grid place-items-center text-sm">Loading chart…</p>}
      </div>
      <p className="faint mt-1 text-[11px]">Hyperliquid mainnet · pinch to zoom, drag to pan</p>
    </div>
  );
}
