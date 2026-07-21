import { Loader2 } from "lucide-react";

/** Segment-level loading UI for /dashboard/* route transitions. */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Loading console…
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-[20px] border border-border bg-card animate-pulse"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-80 rounded-[20px] border border-border bg-card animate-pulse lg:col-span-2" />
        <div className="h-80 rounded-[20px] border border-border bg-card animate-pulse" />
      </div>
    </div>
  );
}
