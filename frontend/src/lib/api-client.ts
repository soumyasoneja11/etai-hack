/**
 * CyberShield AI — Centralized API Client
 *
 * Switches between mock (internal Next.js API routes) and the real
 * Python backend based on environment variables:
 *
 *   NEXT_PUBLIC_USE_MOCK_API  — "true" | "1" → mock mode (default)
 *   NEXT_PUBLIC_API_BASE_URL  — real backend URL (default http://localhost:8000)
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

/** Python backend base URL — only used when IS_MOCK_MODE is false */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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
 * In real mode:  "/anomalies"  →  "http://localhost:8000/api/v1/anomalies"
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

  if (IS_MOCK_MODE) {
    url = MOCK_PATH_MAP[path] ?? `/api${path}`;
  } else {
    url = `${API_BASE_URL}/api/v1${path}`;
  }

  if (queryParams && Object.keys(queryParams).length > 0) {
    const searchParams = new URLSearchParams(queryParams);
    url += `?${searchParams.toString()}`;
  }

  return url;
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
