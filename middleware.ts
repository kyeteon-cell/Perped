import { NextResponse, type NextRequest } from "next/server";

/** Old addresses that should never be seen by the public: every page on them moves to perped.pro. */
const OLD_HOSTS = new Set(["perped-final.vercel.app"]);
const PUBLIC_ORIGIN = "https://perped.pro";
const GUEST_COOKIE = "perped_guest"; // same name as lib/guest.ts (that file uses Node crypto, so not imported here)
const ID_ROUTE = /^\/api\/(posts|battle|duels)\/[^/]+/;

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = (req.headers.get("host") ?? "").toLowerCase();

  // Pages on the old address move to perped.pro (308 keeps the path and query). APIs and crons stay put.
  // A demo guest carries their account across: the key rides in the #fragment (never sent to a server)
  // and perped.pro restores it on arrival, so testers don't lose their account in the move.
  if (OLD_HOSTS.has(host) && !pathname.startsWith("/api/")) {
    const gk = req.cookies.get(GUEST_COOKIE)?.value;
    const to = `${PUBLIC_ORIGIN}${pathname}${search}${gk ? `#gk=${encodeURIComponent(gk)}` : ""}`;
    return NextResponse.redirect(to, 308);
  }

  // Numeric ids only for post / battle / duel routes. A bad id ("abc", 9e15) would otherwise reach Postgres
  // as NaN or overflow int4 and come back as a 500; it's simply "not found".
  if (ID_ROUTE.test(pathname)) {
    const seg = pathname.split("/")[3];
    if (seg && !(/^\d{1,10}$/.test(seg) && Number(seg) <= 2_147_483_647)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|json|webmanifest)$).*)"] };
