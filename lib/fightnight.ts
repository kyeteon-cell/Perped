/** Fight Night: every day 21:00–22:00 Bangkok = 14:00–15:00 UTC. Battles that start inside it pay double XP. */
export const FN_HOUR_UTC = 14;
export const FN_XP_MULT = 2;

export function isFightNight(at: Date | string | number = Date.now()) {
  return new Date(at).getUTCHours() === FN_HOUR_UTC;
}

/** Next start (or the current one if live) and its end. */
export function fightNightWindow(now = new Date()) {
  const start = new Date(now); start.setUTCHours(FN_HOUR_UTC, 0, 0, 0);
  let end = new Date(start.getTime() + 3_600_000);
  if (now >= end) { start.setUTCDate(start.getUTCDate() + 1); end = new Date(start.getTime() + 3_600_000); }
  return { start, end, live: now >= start && now < end };
}
