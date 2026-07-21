/**
 * CyberShield AI — Centralized API Client
 *
 * Switches between mock (internal Next.js API routes) and the real
 * Python backend based on environment variables:
 *
 *   NEXT_PUBLIC_USE_MOCK_API  — "true" | "1" → mock mode (opt-in; default OFF)
 *   NEXT_PUBLIC_API_BASE_URL  — B (correlation_response) URL (default http://127.0.0.1:8001)
 *
 * SECURITY: mock mode must be OPT-IN. An unset env var previously defaulted to
 * mock, which silently shipped fabricated data to production. The default is now
 * "false" (real backend), and next.config.ts fails the production build unless
 * NEXT_PUBLIC_USE_MOCK_API is explicitly set to "false".
 *
 * All responses follow the standard { success, data, error, meta } envelope
 * defined in shared/envelope.py and mirrored in types/api.ts.
 */

import type { ApiResponse, ApiErrorBody } from "@/types/api";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

// Mock mode is opt-in only: default to the real backend when unset.
const RAW_MOCK_FLAG = process.env.NEXT_PUBLIC_USE_MOCK_API ?? "false";

/** true when the frontend should use the internal Next.js API routes */
export const IS_MOCK_MODE =
  RAW_MOCK_FLAG === "true" || RAW_MOCK_FLAG === "1";

/** B (correlation_response) base URL — only used when IS_MOCK_MODE is false */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

// ---------------------------------------------------------------------------
// Bearer token management  (P1-8)
// ---------------------------------------------------------------------------
//
// STORAGE STRATEGY — in-memory access token + httpOnly refresh cookie.
//
// Previously the JWT lived in sessionStorage, which is readable by any injected
// script: a single XSS bug leaks the token. We instead keep the short-lived
// access token in a module-scoped variable (never in Web Storage, so it is not
// exfiltratable by a persisted `sessionStorage.getItem` payload and is wiped on
// tab close), and keep the long-lived *refresh* token in an httpOnly, SameSite
// cookie that JavaScript cannot read at all (see /api/auth/* route handlers).
//
// Trade-off vs. the alternative "access token also in an httpOnly cookie":
// backend B authenticates via the `Authorization: Bearer` header (not cookies)
// and lives on a different origin, so a pure-cookie access token would require
// cross-site cookies (SameSite=None) plus CSRF defenses. Keeping the access
// token in memory and attaching it as a Bearer header keeps the cross-origin
// contract simple while still removing both tokens from XSS-readable storage.
// The cost is that a full page reload loses the in-memory token — handled by
// `ensureFreshToken()` silently re-minting it from the refresh cookie on load.

let _token: string | null = null;
/** Access-token expiry (epoch ms); 0 when unknown. */
let _expiresAtMs = 0;

// Client-readable "is logged in" flag. The httpOnly refresh cookie (cs_refresh)
// is path-scoped to /api/auth and therefore invisible to the /dashboard route
// guard in middleware.ts, so we also set this non-sensitive presence flag at
// path=/ on login. It is only a UX gate — real auth is the backend JWT check.
const SESSION_COOKIE = "cs_session";

function setSessionCookie(): void {
  if (typeof document !== "undefined") {
    document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }
}

function clearSessionCookie(): void {
  if (typeof document !== "undefined") {
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}
/** De-dupes concurrent refreshes into a single in-flight request. */
let _refreshInFlight: Promise<string | null> | null = null;
/** Whether we've attempted the one-shot refresh-on-load yet. */
let _triedInitialRefresh = false;

/** Decodes the `exp` claim (ms) from a JWT without verifying it. */
function decodeExpMs(jwt: string): number {
  try {
    const payload = jwt.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Returns the current in-memory JWT (synchronous; may be stale/expired). */
export function getToken(): string | null {
  return _token;
}

/** Stores a JWT in memory and records its expiry. */
export function setToken(jwt: string, expiresAt?: number | null): void {
  _token = jwt;
  _expiresAtMs = expiresAt ? expiresAt * 1000 : decodeExpMs(jwt);
}

/** Clears the in-memory JWT and best-effort clears the session/refresh cookies. */
export function clearToken(): void {
  _token = null;
  _expiresAtMs = 0;
  clearSessionCookie();
  if (typeof window !== "undefined") {
    // Fire-and-forget: drop the httpOnly refresh cookie server-side.
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }
}

/**
 * Silently mints a new access token from the httpOnly refresh cookie.
 * Concurrent callers share a single in-flight request. Returns the new token,
 * or null if there is no valid session.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      if (!res.ok) {
        _token = null;
        _expiresAtMs = 0;
        return null;
      }
      const data = await res.json();
      if (!data.access_token) {
        _token = null;
        _expiresAtMs = 0;
        return null;
      }
      setToken(data.access_token, data.expires_at);
      return _token;
    } catch {
      return null;
    } finally {
      _refreshInFlight = null;
    }
  })();

  return _refreshInFlight;
}

/**
 * Ensures a usable access token exists before a request:
 *  - refresh-on-load: if we have no token yet (e.g. after a page reload) try
 *    once to recover a session from the refresh cookie;
 *  - proactive refresh: if the current token is within 60s of expiry, renew it.
 */
async function ensureFreshToken(): Promise<void> {
  if (IS_MOCK_MODE) return;

  const now = Date.now();
  if (_token && (_expiresAtMs === 0 || now < _expiresAtMs - 60_000)) {
    return; // still comfortably valid
  }

  if (!_token && _triedInitialRefresh) {
    return; // no session and already tried — don't spam the endpoint
  }
  _triedInitialRefresh = true;
  await refreshAccessToken();
}

/** Builds the Authorization header if a token is available. */
function authHeaders(): Record<string, string> {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  /** HTTP status code (0 for network failures) */
  public readonly status: number;
  /** Structured error body from the backend envelope, if available */
  public readonly body: ApiErrorBody | null;

  constructor(message: string, status: number, body: ApiErrorBody | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Path mapping — mock ↔ real
// ---------------------------------------------------------------------------

/**
 * Maps a logical endpoint path to the correct URL depending on mode.
 *
 * In mock mode:  "/anomalies"  →  "/api/alerts"   (Next.js API route)
 * In real mode:  "/anomalies"  →  "http://127.0.0.1:8001/api/v1/anomalies"
 *
 * Threat intel uses a path param on B: GET /api/v1/threat-intel/{attack_label}.
 * In mock mode that becomes /api/threat-intel?attack_label=...
 *
 * Paths that don't have an explicit mock mapping are passed through as-is
 * (prepended with "/api" in mock mode or "${API_BASE_URL}/api/v1" in real mode).
 */
const MOCK_PATH_MAP: Record<string, string> = {
  "/anomalies": "/api/alerts",
  "/graph": "/api/graph",
  "/threat-intel": "/api/threat-intel",
};

function resolveUrl(path: string, queryParams?: Record<string, string>): string {
  let url: string;
  const threatIntelMatch = path.match(/^\/threat-intel\/(.+)$/);

  if (IS_MOCK_MODE) {
    if (threatIntelMatch) {
      const label = decodeURIComponent(threatIntelMatch[1]);
      url = `/api/threat-intel?attack_label=${encodeURIComponent(label)}`;
    } else {
      url = MOCK_PATH_MAP[path] ?? `/api${path}`;
    }
  } else {
    url = `${API_BASE_URL}/api/v1${path}`;
  }

  if (queryParams && Object.keys(queryParams).length > 0) {
    const searchParams = new URLSearchParams(queryParams);
    const separator = url.includes("?") ? "&" : "?";
    url += `${separator}${searchParams.toString()}`;
  }

  return url;
}

/** On HTTP 401, clear the JWT and send the user to the login page. */
function handleUnauthorized(): void {
  clearToken();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth/login")) {
    window.location.href = "/auth/login";
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

interface ApiGetOptions {
  /** Optional query parameters */
  queryParams?: Record<string, string>;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Extra headers */
  headers?: Record<string, string>;
}

/**
 * Performs a GET request and returns the unwrapped `data` from the
 * standard API envelope, or throws an `ApiError`.
 *
 * @template T  The expected shape of `data` inside the envelope.
 * @param path  Logical API path, e.g. "/anomalies" or "/anomalies/abc-123".
 */
export async function apiGet<T>(
  path: string,
  options: ApiGetOptions = {},
): Promise<T> {
  await ensureFreshToken();
  const url = resolveUrl(path, options.queryParams);

  const send = (): Promise<Response> =>
    fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeaders(),
        ...options.headers,
      },
      signal: options.signal,
    });

  let response: Response;

  try {
    response = await send();
    // On 401, try a single silent refresh + retry before giving up.
    if (response.status === 401 && !IS_MOCK_MODE) {
      const renewed = await refreshAccessToken();
      if (renewed) response = await send();
    }
  } catch (err) {
    // Network failure (DNS, CORS, offline, aborted, etc.)
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // let callers handle cancellation explicitly
    }
    throw new ApiError(
      `Network error: unable to reach ${IS_MOCK_MODE ? "mock" : "backend"} at ${url}`,
      0,
      null,
    );
  }

  // Non-2xx HTTP status
  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }
    let body: ApiErrorBody | null = null;
    try {
      const json: ApiResponse<unknown> = await response.json();
      body = json.error ?? null;
    } catch {
      // response wasn't JSON — ignore
    }
    throw new ApiError(
      body?.message ?? `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      body,
    );
  }

  // Parse the envelope
  const envelope: ApiResponse<T> = await response.json();

  if (!envelope.success) {
    throw new ApiError(
      envelope.error?.message ?? "Request failed (success: false)",
      response.status,
      envelope.error,
    );
  }

  // The envelope guarantees `data` is non-null when success is true,
  // but we add a safety check to satisfy strict TS.
  return envelope.data as T;
}

/**
 * Performs a POST request and returns the unwrapped `data` from the
 * standard API envelope, or throws an `ApiError`.
 */
export async function apiPost<T>(
  path: string,
  body: unknown,
  options: Omit<ApiGetOptions, "queryParams"> = {},
): Promise<T> {
  await ensureFreshToken();
  const url = resolveUrl(path);

  const send = (): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders(),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

  let response: Response;

  try {
    response = await send();
    if (response.status === 401 && !IS_MOCK_MODE) {
      const renewed = await refreshAccessToken();
      if (renewed) response = await send();
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError(
      `Network error: unable to reach ${IS_MOCK_MODE ? "mock" : "backend"} at ${url}`,
      0,
      null,
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }
    let errorBody: ApiErrorBody | null = null;
    try {
      const json: ApiResponse<unknown> = await response.json();
      errorBody = json.error ?? null;
    } catch {
      // ignore
    }
    throw new ApiError(
      errorBody?.message ?? `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      errorBody,
    );
  }

  const envelope: ApiResponse<T> = await response.json();

  if (!envelope.success) {
    throw new ApiError(
      envelope.error?.message ?? "Request failed (success: false)",
      response.status,
      envelope.error,
    );
  }

  return envelope.data as T;
}

// ---------------------------------------------------------------------------
// Auth helpers — same-origin login/logout (P1-8)
// ---------------------------------------------------------------------------

/**
 * Sign in via the same-origin /api/auth/login route. The server proxies
 * Supabase GoTrue, stores the refresh token in an httpOnly cookie, and returns
 * the access token, which we keep in memory only.
 *
 * In mock mode there is no backend, so we accept any credentials and mark a
 * client session (so the /dashboard route guard lets the analyst in for UI work).
 */
export async function apiLogin(email: string, password: string): Promise<string> {
  if (IS_MOCK_MODE) {
    const mockToken = "mock-session";
    _token = mockToken;
    _expiresAtMs = 0;
    _triedInitialRefresh = true;
    setSessionCookie();
    return mockToken;
  }

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new ApiError(
      data.error ?? `Login failed (HTTP ${response.status})`,
      response.status,
      null,
    );
  }

  setToken(data.access_token, data.expires_at);
  _triedInitialRefresh = true;
  setSessionCookie();
  return data.access_token as string;
}

/**
 * Restores a session on app load from the httpOnly refresh cookie, if present.
 * Returns true when an access token is now available. Call this once at the top
 * of authenticated views so a page reload doesn't bounce the user to /login.
 */
export async function ensureAuth(): Promise<boolean> {
  if (IS_MOCK_MODE) return true;
  if (_token) return true;
  if (!_triedInitialRefresh) {
    _triedInitialRefresh = true;
    await refreshAccessToken();
  }
  return _token !== null;
}
