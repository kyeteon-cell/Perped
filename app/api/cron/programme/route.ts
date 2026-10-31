import { ensureSchema } from "@/lib/db";
import { expireIdleFounders, getWaitlistSettings, releaseWaitlist, setWaitlistSettings, weeklyEarningsAlert } from "@/lib/programme";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/programme → hourly: idle founder seats go back to the pool.
 * On Mondays at 14:00 UTC (9pm Bangkok) it also lets the next waitlist batch in, unless paused.
 */
export async function GET(req: Request) {
  await ensureSchema();
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const ok = req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("key") === secret;
  if (secret && !ok) return Response.json({ error: "unauthorized" }, { status: 401 });
  const expired = await expireIdleFounders().catch(() => 0);
  const now = new Date();
  let released = 0, alerted = 0;
  const forced = url.searchParams.get("release") === "1";
  if (forced || (now.getUTCDay() === 1 && now.getUTCHours() === 14)) {
    const wl = await getWaitlistSettings();
    const today = now.toISOString().slice(0, 10);
    if (wl.lastRelease !== today) {
      released = wl.paused ? 0 : await releaseWaitlist(wl.batch);
      await setWaitlistSettings({ lastRelease: today });
      alerted = await weeklyEarningsAlert().catch(() => 0);
    }
  }
  return Response.json({ ok: true, expired, released, alerted, at: now.toISOString() });
}
