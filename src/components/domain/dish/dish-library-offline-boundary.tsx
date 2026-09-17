"use client";

import * as React from "react";
import { DishLibraryDisplay } from "@/components/domain/dish/dish-library-display";
import {
  type TagFilterOption,
  type CuisineFilterOption,
  type FlavorProfileFilterOption,
} from "@/components/domain/dish/library-filter-bar";
import type { DishCardItem } from "@/components/domain/dish/dish-card";
import { listEntities } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import {
  listDishesOffline,
  listDishLibraryOptionsOffline,
} from "@/lib/dishes/offline-library";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { LibraryFilters } from "@/lib/dishes/library-filters";

type OptionLists = {
  tagOptions: TagFilterOption[];
  cuisineOptions: CuisineFilterOption[];
  flavorProfileOptions: FlavorProfileFilterOption[];
};

/**
 * Same "offline document bootstrap" idea as the single-entity boundaries
 * (`DishOfflineBoundary`, `MealPlanOfflineBoundary`, ...), generalized to a
 * filtered list: `queryDishLibrary`'s server-rendered result is a snapshot
 * that can't reflect a Dish created/edited offline since it was cached, or
 * be recomputed at all once actually offline (changing a filter navigates,
 * which needs a network round trip). Whenever any "dish" replica entity is
 * `dirty` (an unsynced local change might affect list membership) or the
 * browser is offline, this recomputes the list from the replica via
 * `listDishesOffline` instead of trusting the server props; otherwise it
 * trusts the fresh server render, same as the other boundaries.
 */
export function DishLibraryOfflineBoundary({
  kind,
  label,
  basePath,
  filters,
  dishes,
  tagOptions,
  cuisineOptions,
  flavorProfileOptions,
}: {
  kind: DishKindValue;
  label: string;
  basePath: string;
  filters: LibraryFilters;
} & OptionLists & { dishes: DishCardItem[] }) {
  const [state, setState] = React.useState<{
    dishes: DishCardItem[];
    options: OptionLists;
  }>({
    dishes,
    options: { tagOptions, cuisineOptions, flavorProfileOptions },
  });

  React.useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const entities = await listEntities<DishSnapshotDoc>("dish");
      if (cancelled) return;
      const dirtyIds = new Set(
        entities.filter((entity) => entity.dirty).map((entity) => entity.id),
      );
      const offline = typeof navigator !== "undefined" && !navigator.onLine;

      if (dirtyIds.size === 0 && !offline) {
        setState({
          dishes,
          options: { tagOptions, cuisineOptions, flavorProfileOptions },
        });
        return;
      }

      const [computedDishes, options] = await Promise.all([
        listDishesOffline(kind, filters),
        listDishLibraryOptionsOffline(),
      ]);
      if (cancelled) return;

      // A dirty replica entity elsewhere switches the whole list over to
      // this offline computation for membership/order (a pending local
      // edit can add/remove/reorder cards the server's own snapshot
      // doesn't know about yet). But `currentTitle` comes only from the
      // replica's `doc.detail`, which a handful of narrow optimistic
      // patches (tag/cuisine/Flavor-profile edits) never touch — so a
      // *confirmed*, non-dirty dish can still end up rendering blank here
      // if its own `detail` never finished populating (e.g. a concurrent
      // sync catching it mid-write). `dishes` — this render's own fresh
      // server props — never has that gap, so whenever the offline
      // computation comes up blank for a dish the server already knows
      // about, prefer the server's row outright rather than showing
      // "Untitled" for a dish that plainly has a real title.
      const serverById = new Map(dishes.map((d) => [d.id, d]));
      const merged = computedDishes.map((entry) => {
        if (entry.currentTitle) return entry;
        return serverById.get(entry.id) ?? entry;
      });
      setState({ dishes: merged, options });
    }

    void reconcile();
    const unsubscribe = onSyncActivity(() => void reconcile());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [kind, filters, dishes, tagOptions, cuisineOptions, flavorProfileOptions]);

  return (
    <DishLibraryDisplay
      dishes={state.dishes}
      kind={kind}
      label={label}
      basePath={basePath}
      filters={filters}
      tagOptions={state.options.tagOptions}
      cuisineOptions={state.options.cuisineOptions}
      flavorProfileOptions={state.options.flavorProfileOptions}
    />
  );
}
