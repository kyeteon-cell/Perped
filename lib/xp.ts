import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { notify } from "./feed";
import { rankFor } from "./rank";

/** Add (or remove) XP, log it, and tell the person when it moves them up or down a rank. XP never goes below 0. */
export async function awardXp(userId: string, delta: number, reason: string, ref?: string) {
  if (!delta) return null;
  const [before] = await db.select({ xp: schema.users.xp, handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!before) return null;
  const [after] = await db.update(schema.users).set({ xp: sql`greatest(0, ${schema.users.xp} + ${delta})` }).where(eq(schema.users.id, userId)).returning({ xp: schema.users.xp });
  await db.insert(schema.xpLog).values({ userId, delta, reason, ref });
  const was = rankFor(before.xp), now = rankFor(after.xp);
  if (now.level > was.level) {
    await notify(userId, "rank", `Ranked up: ${now.title}`, `Level ${now.level}. ${now.next ? `${now.toNext} XP to ${now.next.title}.` : "Top of the ladder."}`, `/u/${before.handle}`);
  } else if (now.level < was.level) {
    await notify(userId, "rank", `Dropped to ${now.title}`, `Losses cost XP at ${was.title} and above. ${now.next ? `${now.toNext} XP to get ${now.next.title} back.` : ""}`, `/u/${before.handle}`);
  }
  return after.xp;
}
