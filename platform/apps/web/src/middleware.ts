import { NextRequest, NextResponse } from "next/server";

// Runs on every request before any cache. Checks maintenance mode by hitting
// the internal API directly and redirects all non-static traffic to the
// maintenance screen when enabled. Skips auth routes so the API itself still
// works while maintenance is active.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never intercept: API proxied routes, static files, Next internals, manifest
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/sounds") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/game-thumbs") ||
    pathname === "/maintenance"
  ) {
    return NextResponse.next();
  }

  try {
    const base = process.env.INTERNAL_API_URL ?? "http://localhost:4000";
    const res = await fetch(`${base}/api/platform/settings`, {
      cache: "no-store",
      headers: { "x-internal": "1" },
      signal: AbortSignal.timeout(2000), // 2s timeout — never block page load
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.maintenanceMode === true) {
        const url = req.nextUrl.clone();
        url.pathname = "/maintenance";
        return NextResponse.rewrite(url);
      }
    }
  } catch {
    // If the API is unreachable, let the request through — don't break the site.
  }

  return NextResponse.next();
}

export const config = {
  // Run on all page routes; skip static assets handled above
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
