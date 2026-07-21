import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { REFRESH_COOKIE, refreshCookieOptions } from "@/lib/auth-cookie";

/** Clears the httpOnly refresh cookie, ending the session server-side. */
export async function POST() {
  const store = await cookies();
  store.set(REFRESH_COOKIE, "", refreshCookieOptions(0));
  return NextResponse.json({ ok: true });
}
