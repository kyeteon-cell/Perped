import { z } from "zod";
import { ensureSchema } from "@/lib/db";
import { staffFrom } from "@/lib/staff";
import { getCompSettings, setCompSettings } from "@/lib/competition";

export const dynamic = "force-dynamic";

/** GET → stored settings (incl. unpublished details). Owner only (your account, or the server key). */
export async function GET(req: Request) {
  await ensureSchema();
  const s = await staffFrom(req);
  if (s?.role !== "owner") return Response.json({ error: "owner only" }, { status: 403 });
  return Response.json(await getCompSettings());
}

const Body = z.object({
  goal: z.number().int().min(1).max(100_000).optional(),
  details: z.string().max(2000).nullable().optional(),
  detailsUrl: z.string().url().max(500).nullable().optional(),
  hidden: z.boolean().optional(),
  /** Count fades from this moment (e.g. launch, so everyone who has already faded counts). */
  startAt: z.string().datetime().optional(),
  /** Restart the count from now. */
  restart: z.boolean().optional(),
});

/** POST {goal?, details?, detailsUrl?, hidden?, restart?} → update the competition. Owner only. */
export async function POST(req: Request) {
  await ensureSchema();
  const s = await staffFrom(req);
  if (s?.role !== "owner") return Response.json({ error: "owner only" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { restart, ...patch } = parsed.data;
  return Response.json(await setCompSettings({ ...patch, ...(restart ? { startAt: new Date().toISOString() } : {}) }));
}
