import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
const Body = z.object({ e: z.enum(["visit", "intro_done", "push_on", "quick_fade_open", "first_battle_card"]), anon: z.string().max(64).optional() });

/** POST /api/track {e, anon} → record one product event. Fire-and-forget from the client. */
export async function POST(req: Request) {
  await ensureSchema();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 204 });
  const auth = await getAuth(req).catch(() => null);
  await db.insert(schema.events).values({ name: parsed.data.e, anon: parsed.data.anon ?? null, userId: auth?.privyId ?? null }).catch(() => null);
  return new Response(null, { status: 204 });
}
