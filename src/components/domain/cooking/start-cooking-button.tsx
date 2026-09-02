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
import {
  SelectableDishRow,
  type DishSelectionItem,
} from "@/components/domain/dish/selectable-dish-row";
import { RichDishVersionPicker } from "@/components/domain/dish/version-picker-field";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { listCookablePickerItems } from "@/lib/cooking/actions";
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
 * entry point into the existing per-item cooking flow (PRODUCT_SPEC.md
 * §5.7/§42 "Cooking entry and plan"). Modeled after `PartAttachPicker`: the
 * candidate list is fetched fresh every time the dialog opens, never a
 * captured snapshot. Single-select, so choosing a result transitions
 * directly into a separate Version-selection screen (current Version
 * preselected, a historical one may be deliberately chosen) — the same
 * `?versionId=` Cooking Setup already accepts from a Version/history page's
 * own "Cook this version" link. Cook is what commits, routing into that
 * Recipe/Part's own `/cook` (Cooking Setup) route.
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
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [chosenVersionId, setChosenVersionId] = React.useState<string | null>(
    null,
  );

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
    listCookablePickerItems().then((result) => {
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
    setSelectedId(null);
    setChosenVersionId(null);
  }

  const selected = items?.find((item) => item.id === selectedId) ?? null;
  const selectedSet = React.useMemo(
    () => new Set(selectedId ? [selectedId] : []),
    [selectedId],
  );
  const pickerItems = React.useMemo(
    () => items?.map(toSelectionItem) ?? null,
    [items],
  );

  function handleCook() {
    if (!selected) return;
    setOpen(false);
    // Lets Cooking Setup's Cancel return to wherever this picker was opened
    // from (Home or the Cook sessions list) instead of always landing on
    // the item's own detail page.
    const from = pathname === "/home" ? "home" : "cook";
    const versionParam = chosenVersionId ? `&versionId=${chosenVersionId}` : "";
    router.push(
      `${dishBasePath(selected.kind)}/${selected.id}/cook?from=${from}${versionParam}`,
    );
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
              {selected
                ? "Choose which Version to cook."
                : "Search your saved recipes and parts, then choose one to cook."}
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="flex flex-col gap-3">
              <SelectableDishRow
                item={toSelectionItem(selected)}
                selectionControl="remove"
                onRemove={() => {
                  setSelectedId(null);
                  setChosenVersionId(null);
                }}
              />
              <RichDishVersionPicker
                id="start-cooking-version"
                kind={selected.kind}
                dishId={selected.id}
                value={chosenVersionId}
                onChangeAction={setChosenVersionId}
              />
            </div>
          ) : (
            <RecipePartPicker
              items={isLoading ? null : pickerItems}
              itemsError={loadError}
              onRetry={() => setLoadAttempt((n) => n + 1)}
              search={search}
              onSearchChange={setSearch}
              showKindTabs
              selectionMode="single"
              selected={selectedSet}
              onToggle={(id) => setSelectedId(id)}
              emptyMessage="You don't have any recipes or parts saved yet."
              loadingLabel="Loading recipes and parts…"
              searchPlaceholder="Search"
              autoFocusSearch
              className="flex-1"
            />
          )}

          <DialogFooter>
            {selected ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedId(null);
                  setChosenVersionId(null);
                }}
              >
                Back
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            )}
            <Button onClick={handleCook} disabled={!selected}>
              Cook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
