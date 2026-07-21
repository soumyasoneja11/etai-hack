/**
 * CyberShield AI — Centralized API Client
 *
 * Switches between mock (internal Next.js API routes) and the real
 * Python backend based on environment variables:
 *
 *   NEXT_PUBLIC_USE_MOCK_API  — "true" | "1" → mock mode (default)
 *   NEXT_PUBLIC_API_BASE_URL  — B (correlation_response) URL (default http://127.0.0.1:8001)
 *
 * All responses follow the standard { success, data, error, meta } envelope
 * defined in shared/envelope.py and mirrored in types/api.ts.
 */

import type { ApiResponse, ApiErrorBody } from "@/types/api";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

const RAW_MOCK_FLAG = process.env.NEXT_PUBLIC_USE_MOCK_API ?? "true";

/** true when the frontend should use the internal Next.js API routes */
export const IS_MOCK_MODE =
  RAW_MOCK_FLAG === "true" || RAW_MOCK_FLAG === "1";

/** B (correlation_response) base URL — only used when IS_MOCK_MODE is false */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

// ---------------------------------------------------------------------------
// Bearer token management
// ---------------------------------------------------------------------------

const TOKEN_KEY = "cybershield_jwt";

let _token: string | null = null;

/** Returns the current JWT, falling back to sessionStorage. */
export function getToken(): string | null {
  if (_token) return _token;
  if (typeof window !== "undefined") {
    _token = sessionStorage.getItem(TOKEN_KEY);
  }
  return _token;
}

/** Stores a JWT in memory and sessionStorage. */
export function setToken(jwt: string): void {
  _token = jwt;
  if (typeof window !== "undefined") {
    sessionStorage.setItem(TOKEN_KEY, jwt);
  }
}

/** Clears the stored JWT. */
export function clearToken(): void {
  _token = null;
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

/** Builds the Authorization header if a token is available. */
function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  const url = resolveUrl(path, options.queryParams);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeaders(),
        ...options.headers,
      },
      signal: options.signal,
    });
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
  const url = resolveUrl(path);

  let response: Response;

  try {
    response = await fetch(url, {
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
// Auth helpers — Supabase GoTrue login
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Sign in with Supabase email/password, store the JWT, and return it.
 * This calls the GoTrue `/auth/v1/token?grant_type=password` endpoint directly.
 */
export async function apiLogin(email: string, password: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new ApiError(
      "Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      0,
      null,
    );
  }

  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(`Supabase login failed: ${text}`, response.status, null);
  }

  const data = await response.json();
  const jwt = data.access_token;
  if (!jwt) {
    throw new ApiError("No access_token in Supabase response", 500, null);
  }

  setToken(jwt);
  return jwt;
}
