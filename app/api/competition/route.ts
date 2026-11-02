import { ensureSchema } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { getCompBoard, getCompMe } from "@/lib/competition";

export const dynamic = "force-dynamic";

/** GET /api/competition → the countdown (goal, count, top recruiters) and, when signed in, your own status. */
export async function GET(req: Request) {
  await ensureSchema();
  try {
    const board = await getCompBoard();
    const auth = await getAuth(req).catch(() => null);
    const me = auth ? await getCompMe(auth.privyId, board.startAt).catch(() => null) : null;
    return Response.json({ ...board, me }, { headers: { "cache-control": "private, max-age=20" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
