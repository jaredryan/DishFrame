import { Loader2 } from "lucide-react";

// Shared by (app)/loading.tsx and every nested route's loading.tsx — a dynamic
// segment without its own loading.tsx doesn't inherit an ancestor boundary on navigation.
export function RouteLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[calc(100dvh-3.5rem-3rem)] items-center justify-center lg:min-h-[calc(100dvh-3rem)]"
    >
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
    </div>
  );
}
