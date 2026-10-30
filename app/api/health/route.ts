import { sql } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { APP_NAME, BUILDER_CONFIGURED, HL_DATA_NETWORK, HL_NETWORK } from "@/lib/config";

export const revalidate = 0;

/** GET /api/health → runs the idempotent schema migration and reports what's in the database. No key needed; reveals nothing sensitive. */
export async function GET() {
  await ensureSchema();
  try {
    const rows = (await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`)) as unknown as { table_name: string }[];
    const tables = Array.from(rows as Iterable<{ table_name: string }>).map((r) => r.table_name);
    const required = ["users", "posts", "stats", "referral_earnings", "referral_payouts"];
    const missing = required.filter((t) => !tables.includes(t));
    return Response.json({ ok: missing.length === 0, app: APP_NAME, version: "0.4.0", trading: HL_NETWORK, prices: HL_DATA_NETWORK, builderConfigured: BUILDER_CONFIGURED, tables, missing });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
