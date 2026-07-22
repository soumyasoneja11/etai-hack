/**
 * Server-only helpers for the httpOnly refresh-token cookie (P1-8).
 *
 * The Supabase *refresh token* is long-lived and, if stolen, lets an attacker
 * mint access tokens indefinitely. We therefore keep it in an httpOnly cookie
 * that JavaScript cannot read (XSS-resistant), scoped to the /api/auth path so
 * it is only ever sent to our own same-origin refresh/logout route handlers.
 *
 * These helpers are imported exclusively from route handlers (server runtime),
 * so the values here never reach the browser bundle.
 */

export const REFRESH_COOKIE = "cs_refresh";

/** Resolve Supabase URL + anon key from server env (NEXT_PUBLIC_* also work). */
export function supabaseServerConfig(): { url: string; anonKey: string } {
  let url = (
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  ).trim();

  // Strip trailing slashes and redundant /auth/v1 path segments if user pasted full auth URL
  url = url.replace(/\/$/, "");
  if (url.endsWith("/auth/v1")) {
    url = url.slice(0, -"/auth/v1".length).replace(/\/$/, "");
  }

  const anonKey = (
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  ).trim();

  return { url, anonKey };
}

/** Cookie attributes for the refresh token (pass maxAge 0 to delete). */
export function refreshCookieOptions(maxAgeSec: number = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: maxAgeSec,
  };
}
