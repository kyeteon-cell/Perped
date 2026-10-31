import webpush from "web-push";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * Web Push. The VAPID key pair is made once and kept in the database (schema_meta), so it works with no
 * env setup; VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY override it if set.
 */
let keys: Promise<{ publicKey: string; privateKey: string }> | null = null;
export function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return Promise.resolve({ publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  keys ??= (async () => {
    const rows = (await db.execute(sql`select key, value from schema_meta where key in ('vapid_public', 'vapid_private')`)) as unknown as { key: string; value: string }[];
    const got = Object.fromEntries(Array.from(rows as Iterable<{ key: string; value: string }>).map((r) => [r.key, r.value]));
    if (got.vapid_public && got.vapid_private) return { publicKey: got.vapid_public, privateKey: got.vapid_private };
    const k = webpush.generateVAPIDKeys();
    // First writer wins; re-read so every instance uses the same pair.
    await db.execute(sql`insert into schema_meta (key, value) values ('vapid_public', ${k.publicKey}), ('vapid_private', ${k.privateKey}) on conflict (key) do nothing`);
    const again = (await db.execute(sql`select key, value from schema_meta where key in ('vapid_public', 'vapid_private')`)) as unknown as { key: string; value: string }[];
    const g2 = Object.fromEntries(Array.from(again as Iterable<{ key: string; value: string }>).map((r) => [r.key, r.value]));
    return { publicKey: g2.vapid_public ?? k.publicKey, privateKey: g2.vapid_private ?? k.privateKey };
  })().catch((e) => { keys = null; throw e; });
  return keys;
}

/** Send a push to every device a user has turned alerts on for. Dead subscriptions are removed. Never throws. */
export async function pushTo(userIds: string | string[], payload: { title: string; body?: string | null; href?: string | null; tag?: string }) {
  try {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (!ids.length) return 0;
    const subs = await db.select().from(schema.pushSubs).where(inArray(schema.pushSubs.userId, ids));
    if (!subs.length) return 0;
    const k = await vapidKeys();
    const data = JSON.stringify({ title: payload.title, body: payload.body ?? "", href: payload.href ?? "/notifications", tag: payload.tag });
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, {
          vapidDetails: { subject: "https://x.com/perped_", publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 3600, timeout: 4000, urgency: "high",
        });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.delete(schema.pushSubs).where(eq(schema.pushSubs.id, s.id)).catch(() => null);
      }
    }));
    return sent;
  } catch {
    return 0;
  }
}
