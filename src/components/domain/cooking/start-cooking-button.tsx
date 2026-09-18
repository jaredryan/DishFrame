"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecipePartPicker } from "@/components/domain/dish/recipe-part-picker";
import { type DishSelectionItem } from "@/components/domain/dish/selectable-dish-row";
import { listCookablePickerItems } from "@/lib/cooking/actions";
import { listCookablePickerItemsOffline } from "@/lib/dishes/offline-library";
import { writeMultiSourceSetupSelection } from "@/lib/cooking/multi-source-setup-handoff";
import type { CookablePickerItem } from "@/lib/dishes/queries";

function toSelectionItem(item: CookablePickerItem): DishSelectionItem {
  return {
    id: item.id,
    kind: item.kind,
    title: item.currentTitle ?? "Untitled",
    versionLabel: item.versionLabel,
    stage: item.stage,
    cuisineNames: item.cuisineNames,
    imageAssetId: item.imageAssetId,
    tagNames: item.tags,
    rating: item.rating,
  };
}

/**
 * "What will you cook?" — the Home dashboard's and Cook page's shared
 * generic entry point into cooking (PRODUCT_SPEC.md §5.7/§42 "Cooking entry
 * and plan"), generalized to multi-select (owner's multi-source Cooking
 * Sessions spec, 2026-09-17; completion pass, 2026-09-18: collapsed back to
 * a single step). Checkbox multi-select (`RecipePartPicker`'s default
 * `selectionMode`), then straight to the dedicated multi-source Cooking
 * Setup route — no Version/scale step here. Setup already owns Version
 * selection and per-source scale/target-yield configuration (and, for the
 * single-source case, always has), so duplicating either in this dialog
 * would just be a second place to edit the same thing.
 *
 * Direct per-Recipe/Part "Prepare to cook" entry points are a different,
 * unchanged component/route — this dialog is only the generic picker named
 * in the spec.
 */
export function StartCookingButton({
  size = "default",
}: {
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const [items, setItems] = React.useState<CookablePickerItem[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  // The requestKey this fetch's result reflects, or null before it resolves.
  // Cleared to null whenever the dialog opens/retries, so isLoading stays
  // derived rather than set synchronously in the effect (same convention as
  // PartAttachPicker).
  const [loadedKey, setLoadedKey] = React.useState<number | null>(null);

  const requestKey = open ? loadAttempt : null;
  const isLoading = requestKey !== null && loadedKey !== requestKey;

  React.useEffect(() => {
    if (requestKey === null) return;
    let cancelled = false;
    // Offline: read the same candidate set from the local replica instead
    // of the Server Action (docs/OFFLINE_IMPLEMENTATION_PLAN.md §5) — this
    // dialog is the general Home/Cook entry point, so it must work without
    // a connection the same as reaching it from a specific Dish's own page
    // already does.
    const load =
      typeof navigator !== "undefined" && navigator.onLine === false
        ? listCookablePickerItemsOffline().then((items) => ({
            status: "success" as const,
            items,
          }))
        : listCookablePickerItems();
    load.then((result) => {
      if (cancelled) return;
      setLoadedKey(requestKey);
      if (result.status === "success") {
        setItems(result.items);
        setLoadError(null);
      } else {
        setItems(null);
        setLoadError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  function reset() {
    setSearch("");
    setSelectedIds(new Set());
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pickerItems = React.useMemo(
    () => items?.map(toSelectionItem) ?? null,
    [items],
  );

  function handleContinue() {
    setOpen(false);
    // Lets the multi-source Setup screen's Cancel return to wherever this
    // picker was opened from, same convention the old single-select flow's
    // `?from=` used.
    const from = pathname === "/home" ? "home" : "cook";
    writeMultiSourceSetupSelection({
      from,
      // Version stays null — Setup itself resolves each source's current
      // Version (and lets it be changed there), never trusted from this
      // picker.
      sources: [...selectedIds].map((dishId) => ({
        dishId,
        dishVersionId: null,
      })),
    });
    router.push("/cook/setup");
  }

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <ChefHat />
        Start cooking
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            reset();
            setItems(null);
            setLoadError(null);
            setLoadedKey(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>What will you cook?</DialogTitle>
            <DialogDescription>
              Search your saved recipes and parts, then choose one or more to
              cook together.
            </DialogDescription>
          </DialogHeader>

          <RecipePartPicker
            items={isLoading ? null : pickerItems}
            itemsError={loadError}
            onRetry={() => setLoadAttempt((n) => n + 1)}
            search={search}
            onSearchChange={setSearch}
            showKindTabs
            selected={selectedIds}
            onToggle={toggle}
            emptyMessage="You don't have any recipes or parts saved yet."
            loadingLabel="Loading recipes and parts…"
            searchPlaceholder="Search"
            autoFocusSearch
            className="flex-1"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleContinue} disabled={selectedIds.size === 0}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
