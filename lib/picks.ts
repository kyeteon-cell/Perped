import { sql } from "drizzle-orm";
import { db } from "./db";
import { awardXp } from "./xp";
import { notify } from "./feed";

/**
 * Pick a winner: anyone not in a fade can back one side for free. When it settles, a right pick pays XP
 * (more for backing the side fewer people picked). Picks close as soon as either fighter closes, so nobody
 * can wait for a banked result and pick the obvious side. Pick XP is capped per day so it can't be farmed.
 */
export const PICK_XP = 5, PICK_UPSET_XP = 10, PICK_DAILY_CAP = 50;
const rows = (x: unknown) => ((x as { rows?: unknown[] }).rows ?? (x as unknown[])) as Record<string, unknown>[];

export async function payPicks(battle: { id: number; faderId: string; targetId: string; winnerId: string | null; coin: string; faderPostId: number }) {
  const list = rows(await db.execute(sql`update battle_picks set paid = true where battle_id = ${battle.id} and not paid returning user_id, pick`));
  if (!list.length || !battle.winnerId) return 0;
  const side = battle.winnerId === battle.faderId ? "fader" : "target";
  const nSide = list.filter((p) => p.pick === side).length;
  const upset = nSide * 2 < list.length; // the winners were the minority
  const xp = upset ? PICK_UPSET_XP : PICK_XP;
  let paid = 0;
  for (const p of list) {
    if (p.pick !== side) continue;
    const uid = String(p.user_id);
    if (uid.startsWith("bot:")) continue;
    const [t] = rows(await db.execute(sql`select coalesce(sum(delta), 0)::int as n from xp_log where user_id = ${uid} and reason = 'pick_win' and created_at > now() - interval '1 day'`));
    const room = PICK_DAILY_CAP - Number(t?.n ?? 0);
    if (room <= 0) continue;
    const got = Math.min(xp, room);
    await awardXp(uid, got, "pick_win", `battle:${battle.id}`).catch(() => null);
    await notify(uid, "pick", `Your pick won: +${got} XP`, `${battle.coin} fade${upset ? " · you called the upset" : ""}`, `/battle/${battle.faderPostId}`).catch(() => null);
    paid++;
  }
  return paid;
}
