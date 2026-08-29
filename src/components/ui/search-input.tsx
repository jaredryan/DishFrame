import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The search-icon + Input treatment shared by every Recipe/Part picker.
 * Wrapped in `-m-0.5 p-0.5` (margin/padding canceling out visually) as a
 * small extra inset against the focus ring's box-shadow getting clipped —
 * defense in depth on top of the real fix, which is the scroll container's
 * own inset (see `RecipePartPicker`'s root: a `-m-0.5`/`p-0.5` this close to
 * the input's own edge isn't enough on its own when the actual clipping
 * ancestor is one or more plain, zero-padding wrappers further up, which
 * swallow it before it reaches the real `overflow-y-auto` boundary).
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
