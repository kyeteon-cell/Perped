// Full-site sweep on a phone-sized browser: every page, key interactions, console/page errors, failed requests,
// main-thread freezes (long tasks), and every internal link checked for a dead end. Prints one JSON report.
import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL ?? "https://perped.pro";
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 13"] });
await ctx.addInitScript(() => {
  try { localStorage.setItem("perped:intro-seen", "1"); localStorage.setItem("perped:arena-intro", "1"); } catch {}
  // Record main-thread blocks (the "freeze" a user feels).
  window.__long = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true }); } catch {}
});

const report = { pages: [], deadLinks: [], interactions: [] };
const links = new Set();
const api = async (p) => { const r = await fetch(BASE + p).catch(() => null); return r && r.ok ? r.json().catch(() => null) : null; };
const feed = await api("/api/posts?limit=20");
const anyPost = feed?.posts?.find((x) => x.post.kind === "trade")?.post.id;
const fade = feed?.posts?.find((x) => x.post.kind === "trade" && x.post.fadedFromId)?.post.id;
const PAGES = ["/", "/markets", "/markets/BTC", "/markets/SKHX", "/trade", "/trade?coin=SKHX", "/arena", "/leaderboard", "/search", "/notifications", "/settings", "/invite", "/founder", "/how-it-works", "/intro", "/u/kilo", "/u/contrarian_kate", "/duels", "/rivalry/kilo/contrarian_kate", "/onboarding", "/admin", "/crews",
  ...(anyPost ? [`/post/${anyPost}`] : []), ...(fade ? [`/battle/${fade}`] : [])];

async function visit(path, act) {
  const page = await ctx.newPage();
  const errs = [], failed = [], bad = [];
  page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("requestfailed", (r) => { const u = r.url(); if (!/hyperliquid\.xyz\/coins|\/api\/track|privy|walletconnect|google|coinbase/.test(u)) failed.push(u.replace(BASE, "")); });
  page.on("response", (r) => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400 && r.status() !== 401) bad.push(`${r.status()} ${u.replace(BASE, "")}`); });
  const t0 = Date.now();
  let status = 0;
  try { const r = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 }); status = r?.status() ?? 0; } catch (e) { errs.push("goto: " + String(e).slice(0, 120)); }
  await page.waitForTimeout(5000);
  let acted = null;
  if (act) { try { acted = await act(page); } catch (e) { acted = "FAILED: " + String(e).slice(0, 160); } }
  const long = await page.evaluate(() => window.__long ?? []).catch(() => []);
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
  for (const h of hrefs) if (h && h.startsWith("/") && !h.startsWith("//")) links.add(h.split("#")[0]);
  const blank = await page.evaluate(() => (document.body?.innerText ?? "").trim().length < 40).catch(() => true);
  report.pages.push({ path, status, ms: Date.now() - t0, blank, longTasks: long.filter((x) => x > 200), worstBlockMs: Math.max(0, ...long), errors: [...new Set(errs)].slice(0, 6), failed: [...new Set(failed)].slice(0, 6), bad: [...new Set(bad)].slice(0, 8), acted });
  await page.close();
}

for (const p of PAGES) await visit(p);

// Interactions that people reported freezing or showing the wrong numbers.
await visit("/trade", async (page) => {
  const out = [];
  const legend = async () => (await page.locator(".pc-legend, [class*='legend']").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 90);
  const price = async () => (await page.locator(".block .mono.text-lg").first().innerText().catch(() => ""));
  for (const step of ["Stocks", "chip:1", "chip:2", "Crypto", "chip:1", "Stocks", "chip:3"]) {
    const t = Date.now();
    if (step.startsWith("chip:")) await page.locator(".seg").nth(1).locator("button").nth(Number(step.slice(5))).click({ timeout: 5000 });
    else await page.getByRole("button", { name: step, exact: true }).first().click({ timeout: 5000 });
    await page.waitForTimeout(2500);
    out.push({ step, ms: Date.now() - t, coin: (await page.locator(".block .text-\\[22px\\]").first().innerText().catch(() => "")), price: await price(), legend: await legend() });
  }
  return out;
});
await visit("/markets", async (page) => {
  const out = [];
  for (const g of ["Stocks", "Crypto", "All"]) { await page.getByRole("button", { name: g, exact: true }).first().click({ timeout: 5000 }).catch(() => out.push("no " + g)); await page.waitForTimeout(1500); out.push({ g, rows: await page.locator("a[href^='/markets/']").count() }); }
  return out;
});

// Dead links: every internal link seen anywhere.
for (const l of links) {
  if (/^\/(api|_next)\//.test(l)) continue;
  const r = await fetch(BASE + l, { redirect: "manual" }).catch(() => null);
  const s = r?.status ?? 0;
  if (!r || s >= 400) report.deadLinks.push(`${s} ${l}`);
}
report.linksChecked = links.size;
console.log("SWEEP_REPORT_START");
console.log(JSON.stringify(report, null, 1));
console.log("SWEEP_REPORT_END");
await b.close();
