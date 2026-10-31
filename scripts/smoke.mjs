// Smoke test the live app in a real (headless) phone-sized browser: every key page must load,
// render its main content, throw no JS errors, and become usable quickly. Screenshots go to smoke-out/.
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "https://perped-final.vercel.app";
mkdirSync("smoke-out", { recursive: true });

const pages = [
  { path: "/", wait: ".home-banner", name: "home" },
  { path: "/arena", wait: "text=Live battles", name: "arena" },
  { path: "/markets", wait: "text=BTC", name: "markets" },
  { path: "/intro", wait: ".intro", name: "intro" },
  { path: "/how-it-works", wait: "text=The Arena", name: "how-it-works" },
  { path: "/leaderboard", wait: "main, body", name: "leaderboard" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
// Don't let the first-visit intro overlay cover every page.
await ctx.addInitScript(() => { try { localStorage.setItem("perped:intro-seen", "1"); } catch {} });
let failed = 0;
// Results also go out as annotations so they show on the commit without opening the logs.
const note = (ok, msg) => console.log(`::${ok ? "notice" : "error"} title=${ok ? "PASS" : "FAIL"}::${msg.replace(/\n/g, " ")}`);

async function check(path, waitFor, name) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|privy|walletconnect|Content Security/i.test(m.text())) errors.push(m.text()); });
  const t0 = Date.now();
  try {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.locator(waitFor).first().waitFor({ timeout: 15000 });
  } catch (e) { errors.push(`did not render ${waitFor}: ${e.message.split("\n")[0]}`); }
  const ms = Date.now() - t0;
  await page.screenshot({ path: `smoke-out/${name}.png`, fullPage: false }).catch(() => {});
  const ok = !errors.length;
  console.log(`${ok ? "PASS" : "FAIL"} ${path} ${ms}ms${errors.length ? "\n   " + errors.join("\n   ") : ""}`);
  note(ok, `${path} ${ms}ms${errors.length ? " — " + errors.join(" | ") : ""}`);
  if (!ok) failed++;
  await page.close();
  return page;
}

for (const p of pages) await check(p.path, p.wait, p.name);

// A live battle page, found from the arena API.
try {
  const r = await (await fetch(BASE + "/api/arena")).json();
  const b = r.live?.[0] ?? r.recent?.[0];
  if (b) await check(`/battle/${b.faderPostId}`, "text=Margin/SL health", "battle");
} catch (e) { note(false, "could not load a battle: " + e.message); failed++; }

// The Bloodbath tab renders.
{
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/arena", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Bloodbath/ }).first().click({ timeout: 15000 }).catch((e) => errors.push(e.message));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "smoke-out/bloodbath.png" }).catch(() => {});
  console.log(`${errors.length ? "FAIL" : "PASS"} arena → Bloodbath tab${errors.length ? "\n   " + errors.join("\n   ") : ""}`);
  note(!errors.length, `arena → Bloodbath tab${errors.length ? " — " + errors.join(" | ") : ""}`);
  if (errors.length) failed++;
}

await browser.close();
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll smoke checks passed");
