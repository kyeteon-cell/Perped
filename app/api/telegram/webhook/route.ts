import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { APP_URL } from "@/lib/config";
import { escapeHtml, tgSend, TELEGRAM_WEBHOOK_SECRET } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Chat = { id: number; title?: string; type: string; username?: string };
type Msg = { chat: Chat; text?: string };
type Update = { message?: Msg; channel_post?: Msg; my_chat_member?: { chat: Chat; new_chat_member?: { status?: string } } };

/**
 * POST /api/telegram/webhook ← Telegram. A crew owner adds the bot to their group (or channel) and sends
 * `/link CODE` from the crew page; that ties the chat to the crew. Removing the bot unlinks it.
 */
export async function POST(req: Request) {
  if (TELEGRAM_WEBHOOK_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== TELEGRAM_WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
  await ensureSchema();
  const u = (await req.json().catch(() => null)) as Update | null;
  if (!u) return Response.json({ ok: true });
  try {
    const left = u.my_chat_member;
    if (left && ["left", "kicked"].includes(left.new_chat_member?.status ?? "")) {
      await db.update(schema.crews).set({ tgChatId: null, tgChatTitle: null }).where(eq(schema.crews.tgChatId, String(left.chat.id)));
      return Response.json({ ok: true });
    }
    const m = u.message ?? u.channel_post;
    const text = m?.text?.trim() ?? "";
    if (!m || !text.startsWith("/")) return Response.json({ ok: true });
    const [cmd, arg] = text.split(/\s+/, 2);
    const name = cmd.split("@")[0].toLowerCase();
    const chatId = String(m.chat.id);
    if (name === "/link") {
      const code = (arg ?? "").toUpperCase().replace(/[^A-F0-9]/g, "");
      const [crew] = code ? await db.select().from(schema.crews).where(eq(schema.crews.tgLinkCode, code)).limit(1) : [];
      if (!crew) { await tgSend(chatId, "That code didn't match a crew. Open your crew page on Perped, tap <b>Connect Telegram</b> and send the new code here."); return Response.json({ ok: true }); }
      const title = m.chat.title ?? (m.chat.username ? `@${m.chat.username}` : "this chat");
      await db.update(schema.crews).set({ tgChatId: chatId, tgChatTitle: title, tgLinkCode: null }).where(eq(schema.crews.id, crew.id));
      await tgSend(chatId, `Linked to <b>${escapeHtml(crew.name)}</b> on Perped. Trades and calls from the crew owner will show up here with Copy and Fade buttons.`, [{ text: "Open the crew", url: `${APP_URL}/crew/${crew.slug}` }]);
    } else if (name === "/start" || name === "/help") {
      await tgSend(chatId, "I post a Perped crew's trades and calls into this chat.\n\n1. Open your crew on Perped and tap <b>Connect Telegram</b>.\n2. Add me to your group or channel.\n3. Send <code>/link CODE</code> here with the code you were given.", [{ text: "Crews on Perped", url: `${APP_URL}/crews` }]);
    }
  } catch (e) {
    console.error("[telegram] webhook", e);
  }
  return Response.json({ ok: true });
}
