import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The search-icon + Input treatment shared by every Recipe/Part picker.
 * Wrapped in `-m-0.5 p-0.5`: the margin/padding cancel out visually, but the
 * extra inset keeps the focus ring's box-shadow from getting clipped when
 * this sits flush against a `overflow-y-auto` ancestor's edge (the sticky
 * search header at the top of a scrollable picker list, most often).
 */
export function SearchInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative -m-0.5 p-0.5">
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <Input className={cn("pl-8", className)} {...props} />
    </div>
  );
}
