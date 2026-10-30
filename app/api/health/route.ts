import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { ensureBots, seedHistory } from "@/lib/bots";
import { queryFeed } from "@/lib/feed";
import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { APP_NAME, BUILDER_CONFIGURED, HL_DATA_NETWORK, HL_NETWORK } from "@/lib/config";

export const revalidate = 0;

/** Ask Privy about our app: confirms the app id + secret pair works and lists the allowed origins. */
async function privyCheck(origin: string) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const secret = process.env.PRIVY_APP_SECRET ?? "";
  const out: Record<string, unknown> = { appIdSet: !!appId, secretSet: !!secret };
  if (!appId || !secret) { out.problem = !appId ? "NEXT_PUBLIC_PRIVY_APP_ID missing in Vercel env" : "PRIVY_APP_SECRET missing in Vercel env (login works but /api/me will 401)"; return out; }
  try {
    const res = await fetch(`https://auth.privy.io/api/v1/apps/${appId}`, {
      headers: { "privy-app-id": appId, authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}` },
      cache: "no-store",
    });
    out.credentialsValid = res.ok;
    if (!res.ok) { out.problem = `Privy rejected the app id/secret (HTTP ${res.status}). Re-copy both from dashboard.privy.io → App settings → Basics.`; return out; }
    const j = (await res.json()) as Record<string, unknown>;
    const origins = (j.allowed_origins ?? j.allowedOrigins ?? j.allowed_domains) as string[] | undefined;
    if (Array.isArray(origins)) {
      out.allowedOrigins = origins;
      out.thisOriginAllowed = origins.some((o) => o.replace(/\/$/, "") === origin);
      if (!out.thisOriginAllowed) out.problem = `${origin} is not in Privy's allowed origins. Add it at dashboard.privy.io → Settings → Domains (or Basics → Allowed origins).`;
    }
    const methods = (j.login_methods ?? j.loginMethods) as unknown;
    if (methods) out.loginMethods = methods;
  } catch (e) {
    out.problem = `Could not reach Privy: ${e instanceof Error ? e.message : String(e)}`;
  }
  return out;
}

/** GET /api/health → runs the idempotent schema migration and reports what's in the database. No key needed; reveals nothing sensitive. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureSchema();
  const origin = new URL(req.url).origin;
  const privy = await privyCheck(origin);
  try {
    const rows = (await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`)) as unknown as { table_name: string }[];
    const tables = Array.from(rows as Iterable<{ table_name: string }>).map((r) => r.table_name);
    const required = ["users", "posts", "stats", "referral_earnings", "referral_payouts"];
    const missing = required.filter((t) => !tables.includes(t));
    // Demo traders: seed on first visit so the feed is never empty (same as the bots cron does).
    let bots: unknown = "present";
    if (!missing.length && process.env.BOTS_PAUSED !== "1") {
      const [any] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isBot, true)).limit(1);
      if (!any) { await ensureBots(); bots = { seeded: true, posts: await seedHistory() }; }
    }
    // Smoke-test the feed query and count posts/bots so an empty Home can be diagnosed from here.
    let feed: unknown;
    try { const rows = await queryFeed({ limit: 3 }); feed = { ok: true, rows: rows.length, newest: rows[0]?.post.createdAt ?? null }; } catch (e) { feed = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
    const [counts] = (await db.execute(sql`select (select count(*) from posts) as posts, (select count(*) from users where is_bot) as bots, (select max(created_at) from posts where user_id in (select id from users where is_bot)) as last_bot_post`)) as unknown as { posts: string; bots: string; last_bot_post: string | null }[];
    return Response.json({ ok: missing.length === 0, feed, counts, botsPaused: process.env.BOTS_PAUSED === "1", app: APP_NAME, version: "0.4.0", trading: HL_NETWORK, prices: HL_DATA_NETWORK, builderConfigured: BUILDER_CONFIGURED, privy, bots, tables, missing });
  } catch (e) {
    return Response.json({ ok: false, privy, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
