import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { MIGRATION_SQL } from "./migrate.sql";

// One connection pool per server process (survives Next.js hot reloads in dev).
const globalForDb = globalThis as unknown as { __perpedSql?: ReturnType<typeof postgres>; __perpedMigrated?: Promise<void> };

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!globalForDb.__perpedSql) {
    globalForDb.__perpedSql = postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
  }
  return globalForDb.__perpedSql;
}

/**
 * Auto-migrate: the schema SQL is idempotent (create/alter … if not exists), so every server process
 * runs it once on first use. New columns and tables appear on the next deploy with no manual step.
 * Set AUTO_MIGRATE=0 to turn this off and use /api/setup instead.
 */
export function ensureSchema(): Promise<void> {
  if (process.env.AUTO_MIGRATE === "0") return Promise.resolve();
  if (!globalForDb.__perpedMigrated) {
    globalForDb.__perpedMigrated = getSql()
      .unsafe(MIGRATION_SQL)
      .then(() => undefined)
      .catch((e) => {
        console.error("[perped] auto-migrate failed:", e instanceof Error ? e.message : e);
        globalForDb.__perpedMigrated = undefined; // try again on the next request
      });
  }
  return globalForDb.__perpedMigrated;
}

export const db = drizzle(getSql(), { schema });
export { schema };
