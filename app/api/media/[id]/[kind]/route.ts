import { and, eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/media/:userId/:kind → the uploaded avatar or banner, long-cached (the URL carries a version). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; kind: string }> }) {
  await ensureSchema();
  const { id, kind } = await ctx.params;
  if (kind !== "avatar" && kind !== "banner") return new Response("not found", { status: 404 });
  const [row] = await db.select().from(schema.userMedia).where(and(eq(schema.userMedia.userId, decodeURIComponent(id)), eq(schema.userMedia.kind, kind))).limit(1);
  if (!row) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(row.data, "base64"), { headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable" } });
}
