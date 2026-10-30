import { SHARE_BACKGROUNDS, HERO_BACKGROUNDS } from "@/lib/share-backgrounds";

/** GET /api/share-bg/:key → the background image, same-origin, cached for a day. Lets the share canvas export without CORS taint. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const bg = [...SHARE_BACKGROUNDS, ...HERO_BACKGROUNDS].find((b) => b.key === key);
  if (!bg) return new Response("not found", { status: 404 });
  const res = await fetch(bg.url, { next: { revalidate: 86_400 } });
  if (!res.ok) return new Response("upstream", { status: 502 });
  return new Response(res.body, { headers: { "content-type": res.headers.get("content-type") ?? "image/png", "cache-control": "public, max-age=86400, s-maxage=604800, immutable" } });
}
