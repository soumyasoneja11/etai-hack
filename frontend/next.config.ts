import type { NextConfig } from "next";

// Build-time safety gate (P0-4): NEXT_PUBLIC_* vars are inlined at build time.
// If a production build doesn't explicitly opt out of mock mode, fail loudly so
// we never ship a UI that serves fabricated data instead of the real backend.
if (process.env.NODE_ENV === "production") {
  const mockFlag = process.env.NEXT_PUBLIC_USE_MOCK_API;
  if (mockFlag !== "false") {
    throw new Error(
      "[build] NEXT_PUBLIC_USE_MOCK_API must be explicitly set to \"false\" for " +
        `production builds (got ${mockFlag === undefined ? "undefined" : `"${mockFlag}"`}). ` +
        "Set NEXT_PUBLIC_USE_MOCK_API=false in the build/CI environment so the " +
        "app talks to the real backend instead of shipping mock data.",
    );
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
