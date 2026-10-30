import { newGuestToken } from "@/lib/guest";
import { DEMO_ENABLED } from "@/lib/config";

/** POST /api/guest → a fresh guest identity for demo mode. No sign-up, no third party. */
export async function POST() {
  if (!DEMO_ENABLED) return Response.json({ error: "demo mode is off" }, { status: 403 });
  try {
    const { token } = newGuestToken();
    return Response.json({ token });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
