import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One connection pool per server process (survives Next.js hot reloads in dev).
const globalForDb = globalThis as unknown as { __perpedSql?: ReturnType<typeof postgres> };

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!globalForDb.__perpedSql) {
    globalForDb.__perpedSql = postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
  }
  return globalForDb.__perpedSql;
}

export const db = drizzle(getSql(), { schema });
export { schema };
