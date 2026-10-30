import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { MIGRATION_SQL } from "./migrate.sql";

// One connection pool per server process (survives Next.js hot reloads in dev).
const globalForDb = globalThis as unknown as { __perpedSql?: ReturnType<typeof postgres>; __perpedMigrated?: Promise<void> };

/**
 * Neon: prefer the pooled endpoint (PgBouncer, transaction mode) so hundreds of serverless instances share a
 * small number of real connections instead of each opening their own. Set NEON_POOLER=0 to keep the URL as is.
 */
function connectionUrl() {
  const raw = process.env.DATABASE_URL!;
  if (process.env.NEON_POOLER === "0" || !/\.neon\.tech/.test(raw) || /-pooler\./.test(raw)) return raw;
  return raw.replace(/@(ep-[a-z0-9-]+?)(\.[a-z0-9-]+\.aws\.neon\.tech)/, "@$1-pooler$2");
}

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!globalForDb.__perpedSql) {
    globalForDb.__perpedSql = postgres(connectionUrl(), { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  }
  return globalForDb.__perpedSql;
}

/** Cheap fingerprint of the migration SQL; the migration runs only when this changes. */
function schemaVersion() {
  let h = 0;
  for (let i = 0; i < MIGRATION_SQL.length; i++) h = (h * 31 + MIGRATION_SQL.charCodeAt(i)) | 0;
  return `v${(h >>> 0).toString(36)}`;
}

/**
 * Auto-migrate, safely: the schema SQL is idempotent, but ALTER TABLE takes exclusive locks and every cold
 * serverless instance used to run the whole script, so under load the ALTERs queued behind live queries and
 * every query queued behind the ALTERs. Now one instance runs it, once per schema change, under an advisory
 * lock with a short lock timeout; everyone else just reads the version row.
 */
export function ensureSchema(): Promise<void> {
  if (process.env.AUTO_MIGRATE === "0") return Promise.resolve();
  if (!globalForDb.__perpedMigrated) {
    const sql = getSql();
    const version = schemaVersion();
    globalForDb.__perpedMigrated = (async () => {
      await sql.unsafe(`create table if not exists schema_meta (key text primary key, value text not null, updated_at timestamptz not null default now())`);
      const rows = await sql.unsafe(`select value from schema_meta where key = 'version'`) as unknown as { value: string }[];
      if (rows[0]?.value === version) return;
      await sql.begin(async (tx) => {
        await tx.unsafe(`select pg_advisory_xact_lock(727001)`);
        const again = await tx.unsafe(`select value from schema_meta where key = 'version'`) as unknown as { value: string }[];
        if (again[0]?.value === version) return;
        await tx.unsafe(`set local lock_timeout = '8s'`);
        await tx.unsafe(`set local statement_timeout = '60s'`);
        await tx.unsafe(MIGRATION_SQL);
        await tx.unsafe(`insert into schema_meta (key, value, updated_at) values ('version', '${version}', now()) on conflict (key) do update set value = excluded.value, updated_at = now()`);
      });
    })().catch((e) => {
      console.error("[perped] auto-migrate failed:", e instanceof Error ? e.message : e);
      globalForDb.__perpedMigrated = undefined; // try again on the next request
    });
  }
  return globalForDb.__perpedMigrated;
}

// Lazy: nothing touches DATABASE_URL until the first real query, so `next build` (which imports every
// route to collect page data) never needs a database connection.
type Db = ReturnType<typeof drizzle<typeof schema>>;
let _db: Db | undefined;
function getDb(): Db {
  if (!_db) _db = drizzle(getSql(), { schema });
  return _db;
}
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});
export { schema };
