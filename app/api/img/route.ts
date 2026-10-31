/**
 * GET /api/img?u=https://… → re-serves a remote image (avatars) same-origin so share canvases can export it.
 * Images only, https only, no IP hosts, 4MB cap, cached a day.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u") ?? "";
  let u: URL;
  try { u = new URL(raw); } catch { return new Response("bad url", { status: 400 }); }
  if (u.protocol !== "https:" || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(":") || u.hostname === "localhost") return new Response("not allowed", { status: 400 });
  const r = await fetch(u, { next: { revalidate: 86_400 } }).catch(() => null);
  const type = r?.headers.get("content-type") ?? "";
  if (!r?.ok || !type.startsWith("image/")) return new Response("not an image", { status: 404 });
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 4_000_000) return new Response("too big", { status: 413 });
  return new Response(buf, { headers: { "content-type": type, "cache-control": "public, max-age=86400, s-maxage=86400" } });
}
