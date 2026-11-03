import { staffFrom } from "@/lib/staff";
import { APP_URL } from "@/lib/config";
import { TELEGRAM_ON, tgGetMe, tgSetWebhook } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** GET /api/admin/telegram → is the bot configured, and who is it. */
export async function GET(req: Request) {
  const staff = await staffFrom(req);
  if (!staff) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ configured: TELEGRAM_ON, bot: TELEGRAM_ON ? await tgGetMe() : null });
}

/** POST /api/admin/telegram → point the bot's webhook at this deployment (run once after setting the token). */
export async function POST(req: Request) {
  const staff = await staffFrom(req);
  if (!staff || staff.role !== "owner") return Response.json({ error: "owner only" }, { status: 401 });
  if (!TELEGRAM_ON) return Response.json({ error: "Set TELEGRAM_BOT_TOKEN first" }, { status: 400 });
  const ok = await tgSetWebhook(`${APP_URL}/api/telegram/webhook`);
  return Response.json({ ok: ok != null, url: `${APP_URL}/api/telegram/webhook`, bot: await tgGetMe() });
}
