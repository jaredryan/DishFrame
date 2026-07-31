"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/empty-state";
import {
  DishCard,
  type DishCardItem,
} from "@/components/domain/dish/dish-card";
import { DishCompactCard } from "@/components/domain/dish/dish-compact-card";
import type { DishKindValue } from "@/lib/dishes/schema";

const VIEW_MODE_STORAGE_KEY = "dishframe:library-view-mode";
const VIEW_MODES = [
  { value: "grid", label: "Grid", icon: LayoutGrid },
  { value: "compact", label: "Compact", icon: Rows3 },
] as const;
type ViewMode = (typeof VIEW_MODES)[number]["value"];

function isViewMode(value: string | null): value is ViewMode {
  return value === "grid" || value === "compact";
}

const noopSubscribe = () => () => {};

function readStoredViewMode(): ViewMode {
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return isViewMode(stored) ? stored : "grid";
}

function defaultViewMode(): ViewMode {
  return "grid";
}

export function DishLibraryDisplay({
  dishes,
  kind,
  label,
  basePath,
  includeArchived,
}: {
  dishes: DishCardItem[];
  kind: DishKindValue;
  label: string;
  basePath: string;
  includeArchived: boolean;
}) {
  // The saved view mode only exists in localStorage, so it's unknown
  // during SSR — useSyncExternalStore resolves the mismatch the React way
  // (server snapshot "grid", client snapshot from storage) rather than
  // reading localStorage in an effect and calling setState from it.
  const storedMode = React.useSyncExternalStore(
    noopSubscribe,
    readStoredViewMode,
    defaultViewMode,
  );
  const [override, setOverride] = React.useState<ViewMode | null>(null);

  function chooseViewMode(mode: ViewMode) {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    setOverride(mode);
  }

  const activeMode = override ?? storedMode;

  return (
    <div className="flex flex-col gap-4">
      {/* Slice 6A: Grid/Compact (more frequently used) aligns left with the
          page content; Show archived stays a lighter-weight link on the
          right — not yet a full filter system, that absorbs it later. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="radiogroup"
          aria-label={`${label} view`}
          className="border-border bg-muted inline-flex items-center gap-0.5 rounded-lg border p-0.5"
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
        <Link
          href={includeArchived ? basePath : `${basePath}?archived=1`}
          className="text-muted-foreground text-sm hover:underline"
        >
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      {dishes.length === 0 ? (
        <EmptyState
          title={`No ${label}s yet`}
          description={
            includeArchived
              ? `No archived ${label}s.`
              : `${label === "part" ? "Parts" : "Recipes"} you create will show up here.`
          }
        />
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
