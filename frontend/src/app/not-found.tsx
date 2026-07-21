import Link from "next/link";
import { Compass } from "lucide-react";

/** Root-level 404 for unmatched routes / notFound() outside /dashboard. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
          <Compass className="h-6 w-6 text-primary" />
        </div>
        <h2 className="font-heading text-lg font-bold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/95"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
