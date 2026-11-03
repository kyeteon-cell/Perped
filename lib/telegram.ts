// Perped's Telegram bot: one bot (TELEGRAM_BOT_TOKEN) that crew owners add to their group. It posts the
// owner's trades and calls into the group with Copy / Fade buttons that carry the owner's referral.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
export const TELEGRAM_ON = !!TOKEN;
export const TELEGRAM_BOT_USERNAME = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "");
/** Telegram echoes this header on every webhook call, so random POSTs to the webhook are ignored. */
export const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

export type TgButton = { text: string; url: string };

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!TOKEN) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal, cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!j?.ok) { console.error(`[telegram] ${method} failed:`, j?.description ?? r.status); return null; }
    return j.result ?? null;
  } catch (e) {
    console.error(`[telegram] ${method} error:`, e instanceof Error ? e.message : e);
    return null;
  } finally { clearTimeout(timer); }
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Send an HTML message, optionally with one row of link buttons. Returns false when the bot isn't set up or Telegram refused. */
export async function tgSend(chatId: string, html: string, buttons: TgButton[] = []): Promise<boolean> {
  const r = await call("sendMessage", {
    chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
  });
  return r != null;
}

/** Point Telegram at our webhook (run once from the admin page after setting the token). */
export async function tgSetWebhook(url: string) {
  return call("setWebhook", { url, secret_token: TELEGRAM_WEBHOOK_SECRET || undefined, allowed_updates: ["message", "channel_post", "my_chat_member"], drop_pending_updates: true });
}

export async function tgGetMe() {
  return call<{ id: number; username: string; first_name: string }>("getMe", {});
}
