import postgres from "postgres";
import { MIGRATION_SQL } from "@/lib/migrate.sql";

/**
 * GET /api/setup?key=<CRON_SECRET> → creates every table and index if missing. Safe to run repeatedly.
 * Replaces `npm run db:push` for phone-only operation.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "DATABASE_URL not set" }, { status: 500 });
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    await sql.unsafe(MIGRATION_SQL);
    const tables = await sql<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    return Response.json({ ok: true, tables: tables.map((t) => t.table_name) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    await sql.end();
  }
}
