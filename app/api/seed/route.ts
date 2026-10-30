import { ensureBots, seedHistory, purgeBots } from "@/lib/bots";

/**
 * GET /api/seed?key=<CRON_SECRET>            → create the six demo traders and backfill two weeks of activity
 * GET /api/seed?key=<CRON_SECRET>&action=purge → remove everything bot-created
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("key") !== process.env.CRON_SECRET) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    if (url.searchParams.get("action") === "purge") return Response.json({ ok: true, purged: await purgeBots() });
    await ensureBots();
    const posts = await seedHistory();
    return Response.json({ ok: true, bots: 6, posts });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
