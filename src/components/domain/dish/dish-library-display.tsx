"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/empty-state";
import {
  DishCard,
  type DishCardItem,
} from "@/components/domain/dish/dish-card";
import { DishCompactCard } from "@/components/domain/dish/dish-compact-card";
import {
  LibraryFilterBar,
  type FlavorProfileFilterOption,
  type TagFilterOption,
} from "@/components/domain/dish/library-filter-bar";
import {
  DISPLAY_VIEW_PARAM,
  isDefaultLibraryFilters,
  readLibraryDisplayView,
  type LibraryDisplayView,
  type LibraryFilters,
} from "@/lib/dishes/library-filters";
import type { DishKindValue } from "@/lib/dishes/schema";

// Remembered via the `display` query param (grid is the default, so it's
// simply absent from the URL) rather than localStorage, so the choice
// round-trips through shared/bookmarked links too.
const VIEW_MODES: {
  value: LibraryDisplayView;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { value: "grid", label: "Grid", icon: LayoutGrid },
  { value: "compact", label: "Compact", icon: Rows3 },
];

export function DishLibraryDisplay({
  dishes,
  kind,
  label,
  basePath,
  filters,
  tagOptions,
  cuisineOptions,
  flavorProfileOptions,
}: {
  dishes: DishCardItem[];
  kind: DishKindValue;
  label: string;
  basePath: string;
  filters: LibraryFilters;
  tagOptions: TagFilterOption[];
  cuisineOptions: string[];
  flavorProfileOptions: FlavorProfileFilterOption[];
}) {
  const searchParams = useSearchParams();
  const [override, setOverride] = React.useState<LibraryDisplayView | null>(
    null,
  );

  function chooseViewMode(mode: LibraryDisplayView) {
    const next = new URLSearchParams(searchParams.toString());
    if (mode === "grid") {
      next.delete(DISPLAY_VIEW_PARAM);
    } else {
      next.set(DISPLAY_VIEW_PARAM, mode);
    }
    const qs = next.toString();
    // Shallow history update (Next syncs this with useSearchParams) — no
    // router.push/replace, since the view is a client-only presentation
    // choice that must never re-run the server query or touch scroll.
    window.history.replaceState(null, "", qs ? `${basePath}?${qs}` : basePath);
    setOverride(mode);
  }

  const activeMode = override ?? readLibraryDisplayView(searchParams);

  const hasActiveFilters = !isDefaultLibraryFilters(filters);

  return (
    <div className="flex flex-col gap-4">
      <LibraryFilterBar
        basePath={basePath}
        filters={filters}
        tagOptions={tagOptions}
        cuisineOptions={cuisineOptions}
        flavorProfileOptions={flavorProfileOptions}
      />

      <div
        role="radiogroup"
        aria-label={`${label} view`}
        className="border-border bg-muted inline-flex w-fit items-center gap-0.5 rounded-lg border p-0.5"
      >
        {VIEW_MODES.map(({ value, label: modeLabel, icon: Icon }) => {
          const isActive = activeMode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`${modeLabel} view`}
              onClick={() => chooseViewMode(value)}
              className={cn(
                "focus-visible:ring-ring/50 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isActive
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {modeLabel}
            </button>
          );
        })}
      </div>

      {dishes.length === 0 ? (
        // PRODUCT_SPEC.md §50.3: a filtered no-result state reads distinctly
        // from an ordinarily empty library.
        hasActiveFilters ? (
          <EmptyState
            title="No matches"
            description="Nothing matches your current search and filters. Try clearing one or more of them."
          />
        ) : (
          <EmptyState
            title={`No ${label}s yet`}
            description={`${label === "part" ? "Parts" : "Recipes"} you create will show up here.`}
          />
        )
      ) : activeMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dishes.map((dish) => (
            <DishCard key={dish.id} dish={dish} kind={kind} />
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {dishes.map((dish) => (
            <DishCompactCard key={dish.id} dish={dish} kind={kind} />
          ))}
        </div>
      )}
    </div>
  );
}
