import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[50vh] items-center justify-center"
    >
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
    </div>
  );
}
