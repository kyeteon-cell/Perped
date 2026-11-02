import { NextResponse, type NextRequest } from "next/server";

/**
 * Numeric ids only for post / battle / duel routes. A bad id ("abc", 9e15) would otherwise reach Postgres
 * as NaN or overflow int4 and come back as a 500; it's simply "not found".
 */
export function middleware(req: NextRequest) {
  const seg = req.nextUrl.pathname.split("/")[3];
  if (seg && !(/^\d{1,10}$/.test(seg) && Number(seg) <= 2_147_483_647)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/posts/:id/:path*", "/api/battle/:id/:path*", "/api/duels/:id/:path*"] };
