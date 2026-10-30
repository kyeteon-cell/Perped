import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth, unauthorized } from "@/lib/auth";

const Body = z.object({
  showLiquidations: z.boolean().optional(),
  showSizes: z.boolean().optional(),
  allowCopy: z.boolean().optional(),
  allowFade: z.boolean().optional(),
  showBottomBoard: z.boolean().optional(),
  acceptDuels: z.boolean().optional(),
  defaultLeverage: z.number().int().min(1).max(10).optional(),
  pnlDisplay: z.enum(["pct", "usd", "roi"]).optional(),
  xHandle: z.string().max(30).nullable().optional(),
  isDemo: z.boolean().optional(),
  resetDemo: z.boolean().optional(),
});

/** PATCH /api/me/settings → update any subset of settings. */
export async function PATCH(req: Request) {
  const auth = await getAuth(req);
  if (!auth) return unauthorized();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { resetDemo, ...patch } = parsed.data;
  const set: Record<string, unknown> = { ...patch };
  if (resetDemo) set.demoBalance = "1000";
  const [row] = await db.update(schema.users).set(set).where(eq(schema.users.id, auth.privyId)).returning();
  return Response.json({ profile: row });
}
