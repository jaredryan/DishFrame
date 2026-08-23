"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChefHat, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SelectableDishRow } from "@/components/domain/dish/selectable-dish-row";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { listCookablePickerItems } from "@/lib/cooking/actions";
import type { CookablePickerItem } from "@/lib/dishes/queries";
import { cn } from "@/lib/utils";

type PickerTab = "ALL" | "RECIPE" | "PART";

const TABS: { value: PickerTab; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "RECIPE", label: "Recipes" },
  { value: "PART", label: "Parts" },
];

/**
 * "What will you cook?" — the Home dashboard's and Cook page's shared
 * entry point into the existing per-item cooking flow (PRODUCT_SPEC.md
 * §5.7/§42 "Cooking entry and plan"). Modeled after `PartAttachPicker`: the
 * candidate list is fetched fresh every time the dialog opens, never a
 * captured snapshot. Clicking a result only selects it — Cook is what
 * commits, routing into that Recipe/Part's own `/cook` (Cooking Setup)
 * route, exactly like its detail page's own Cook button.
 */
export function StartCookingButton({
  size = "default",
}: {
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<PickerTab>("ALL");
  const [selected, setSelected] = React.useState<CookablePickerItem | null>(
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
    setQuery("");
    setTab("ALL");
    setSelected(null);
  }

  const tabItems = (items ?? []).filter(
    (item) => tab === "ALL" || item.kind === tab,
  );
  const filtered = tabItems.filter((item) =>
    (item.currentTitle ?? "Untitled")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  function handleCook() {
    if (!selected) return;
    setOpen(false);
    // Lets Cooking Setup's Cancel return to wherever this picker was opened
    // from (Home or the Cook sessions list) instead of always landing on
    // the item's own detail page.
    const from = pathname === "/home" ? "home" : "cook";
    router.push(
      `${dishBasePath(selected.kind)}/${selected.id}/cook?from=${from}`,
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
              Search your saved recipes and parts, then choose one to cook.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
            <div className="bg-popover sticky top-0 z-10 flex flex-col gap-3 pb-1">
              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  autoFocus
                  placeholder="Search"
                  className="pl-8"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              <div role="tablist" className="border-border flex gap-1 border-b">
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.value}
                    onClick={() => setTab(t.value)}
                    className={cn(
                      "-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-sm font-medium outline-none",
                      tab === t.value
                        ? "border-primary text-foreground"
                        : "text-muted-foreground hover:text-foreground border-transparent",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Loading recipes and parts…
              </p>
            ) : loadError ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p role="alert" className="text-destructive-text text-sm">
                  {loadError}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLoadAttempt((n) => n + 1)}
                >
                  <RotateCcw /> Retry
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {filtered.length === 0 && (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    {(items ?? []).length === 0
                      ? "You don't have any recipes or parts saved yet."
                      : tabItems.length === 0
                        ? "Nothing here yet."
                        : "Nothing matches that search."}
                  </p>
                )}
                {filtered.map((item) => (
                  <SelectableDishRow
                    key={item.id}
                    item={{
                      id: item.id,
                      kind: item.kind,
                      title: item.currentTitle ?? "Untitled",
                      versionLabel: item.versionLabel,
                      stage: item.stage,
                      cuisine: item.cuisine,
                      imageAssetId: item.imageAssetId,
                      tagNames: item.tags,
                      rating: item.rating,
                    }}
                    selectionControl="radio"
                    selected={selected?.id === item.id}
                    onSelect={() => setSelected(item)}
                  />
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCook} disabled={!selected}>
              Cook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
