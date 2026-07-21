"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Segment-level error boundary for /dashboard/*. Without this, any render error
 * white-screens the whole console. Here we show a recoverable, visible error
 * state with a retry (App Router `reset()`).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[20px] border border-cyber-danger/25 bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyber-danger/10 border border-cyber-danger/20">
          <AlertTriangle className="h-6 w-6 text-cyber-danger" />
        </div>
        <h2 className="font-heading text-lg font-bold text-foreground">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The console hit an unexpected error while rendering this view. Your
          session is still active.
        </p>
        {error?.message && (
          <p className="mt-3 rounded-lg border border-border bg-background/50 px-3 py-2 text-left font-mono text-xs text-muted-foreground break-words">
            {error.message}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/95"
          >
            <RotateCw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
