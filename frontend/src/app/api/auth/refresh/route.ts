import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  supabaseServerConfig,
} from "@/lib/auth-cookie";

/**
 * Silent token refresh. Reads the httpOnly refresh cookie, exchanges it with
 * Supabase for a fresh access token, rotates the stored refresh token, and
 * returns the new access token. 401 when there is no valid session.
 */
export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const { url, anonKey } = supabaseServerConfig();
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Supabase credentials are not configured on the server" },
      { status: 500 },
    );
  }

  const r = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    // Refresh token expired / rotated away / revoked — clear the stale cookie.
    store.set(REFRESH_COOKIE, "", refreshCookieOptions(0));
    return NextResponse.json(
      { error: data.error_description ?? "Session expired" },
      { status: 401 },
    );
  }

  // Supabase rotates refresh tokens on every use; persist the new one.
  if (data.refresh_token) {
    store.set(REFRESH_COOKIE, data.refresh_token, refreshCookieOptions());
  }

  return NextResponse.json({
    access_token: data.access_token,
    expires_at: data.expires_at ?? null,
  });
}
