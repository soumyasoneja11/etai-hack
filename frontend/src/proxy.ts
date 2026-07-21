import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route guard for the SOC console (P-fix: /dashboard had no auth gate, so in
 * mock mode the entire console was open with no login).
 *
 * Runs on the server before any /dashboard page renders and redirects
 * unauthenticated users to /auth/login. This is a UX gate; the real security
 * boundary is the backend, which still requires a valid Supabase JWT on every
 * /api/v1/* call. Proxy can read httpOnly cookies, so we look for either:
 *   - cs_refresh : the httpOnly refresh cookie set by /api/auth/login (real mode)
 *   - cs_session : a client-set flag written on login (covers mock mode, which
 *                  has no backend session)
 *
 * Renamed from `middleware.ts` per the Next.js 16 convention; guard logic is
 * unchanged.
 */
const AUTH_COOKIES = ["cs_refresh", "cs_session"];

export function proxy(req: NextRequest) {
  const isAuthed = AUTH_COOKIES.some((name) => req.cookies.has(name));
  if (isAuthed) {
    return NextResponse.next();
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/auth/login";
  loginUrl.search = "";
  loginUrl.searchParams.set(
    "redirect",
    req.nextUrl.pathname + req.nextUrl.search,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
