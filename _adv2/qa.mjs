import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.BASE, SHARE = process.env.SHARE;
const src = fs.readFileSync(new URL("./shots.mjs", import.meta.url), "utf8");
// reuse the mock data from shots.mjs by eval of the data section
const dataPart = src.slice(src.indexOf("const av ="), src.indexOf("const browser"));
eval(dataPart.replace(/const /g, "globalThis."));
const browser = await chromium.launch();
for (const w of [360, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 200)));
  await page.goto(`${BASE}/?_vercel_share=${SHARE}`); await page.waitForTimeout(1200);
  await page.route("**/api/crews", (r) => json(r, { board, mine: { slug: "kilo-klips", name: "Kilo Klips", tag: "KILO", isOwner: true }, weekEndsAt: new Date(Date.now() + 3.4 * 86400e3).toISOString() }));
  await page.route("**/api/crews/kilo-klips", (r) => json(r, detail));
  await page.route("**/api/profile/*", async (r) => { const res = await r.fetch(); const b = await res.json().catch(() => null); if (b?.user) { b.crew = { slug: "kilo-klips", name: "Kilo Klips", tag: "KILO", isOwner: false }; b.hlRecord = rec; } return json(r, b); });
  for (const path of ["/crews", "/crew/kilo-klips", "/leaderboard", "/u/degenmaxi"]) {
    errs.length = 0;
    await page.goto(`${BASE}${path}`); await page.waitForTimeout(3000);
    if (path === "/leaderboard") { await page.getByRole("button", { name: "Crews" }).click(); await page.waitForTimeout(1000); }
    const r = await page.evaluate(() => {
      const out = { hscroll: document.documentElement.scrollWidth - window.innerWidth, overflow: [] };
      for (const el of document.querySelectorAll(".crew-hero *, .crew-war-hero *, .calc *, .hlr *, .crew-row *, .lb *, .crew-kpis *, .hlr-grid *")) {
        const b = el.getBoundingClientRect();
        if (b.width && (b.right > window.innerWidth + 1 || b.left < -1)) out.overflow.push(`${el.className || el.tagName}:${Math.round(b.left)}-${Math.round(b.right)}`);
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === "visible" && el.children.length === 0 && el.clientWidth > 0) out.overflow.push(`clip ${el.className || el.tagName}: "${el.textContent.slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
      }
      out.overflow = [...new Set(out.overflow)].slice(0, 12);
      return out;
    });
    console.log(w, path, JSON.stringify(r), errs.length ? "ERR " + JSON.stringify([...new Set(errs)].slice(0, 4)) : "");
  }
  await ctx.close();
}
await browser.close();
