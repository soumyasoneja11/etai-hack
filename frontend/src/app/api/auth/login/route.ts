import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  supabaseServerConfig,
} from "@/lib/auth-cookie";

/**
 * Same-origin login proxy. Exchanges email/password with Supabase GoTrue,
 * stashes the refresh token in an httpOnly cookie, and returns only the
 * short-lived access token to the browser (held in memory client-side).
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 },
    );
  }

  const { url, anonKey } = supabaseServerConfig();
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Supabase credentials are not configured on the server" },
      { status: 500 },
    );
  }

  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    const message =
      data.error_description ?? data.msg ?? data.error ?? "Login failed";
    return NextResponse.json({ error: message }, { status: r.status || 401 });
  }

  const store = await cookies();
  store.set(REFRESH_COOKIE, data.refresh_token ?? "", refreshCookieOptions());

  return NextResponse.json({
    access_token: data.access_token,
    expires_at: data.expires_at ?? null,
  });
}
