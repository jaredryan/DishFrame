"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  setDishFlavorProfiles,
  setDishTags,
  setDishCuisines,
} from "@/lib/dishes/actions";
import {
  CuisineSelector,
  type CuisineOption,
} from "@/components/domain/dish/cuisine-selector";
import type { DishKindValue } from "@/lib/dishes/schema";

export type TagOption = {
  id: string;
  displayName: string;
  isFavorite: boolean;
};
export type FlavorProfileOption = { id: string; displayName: string };
export type { CuisineOption };

/**
 * PRODUCT_SPEC.md §45.2/§79.2/§46: tags, Flavor profiles, and (owner
 * decision, 2026-09-02) Cuisines are all stable Dish metadata — this
 * popover writes them directly (no Version created).
 */
export function DishTagFlavorEditor({
  dishId,
  kind,
  tagOptions,
  flavorProfileOptions,
  cuisineOptions,
  selectedTagIds,
  selectedFlavorProfileValueIds,
  selectedCuisineIds,
}: {
  dishId: string;
  kind: DishKindValue;
  tagOptions: TagOption[];
  flavorProfileOptions: FlavorProfileOption[];
  cuisineOptions: CuisineOption[];
  selectedTagIds: string[];
  selectedFlavorProfileValueIds: string[];
  selectedCuisineIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [tagIds, setTagIds] = React.useState<string[]>(selectedTagIds);
  const [flavorProfileIds, setFlavorProfileIds] = React.useState<string[]>(
    selectedFlavorProfileValueIds,
  );
  const [cuisineIds, setCuisineIds] =
    React.useState<string[]>(selectedCuisineIds);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTagIds(selectedTagIds);
      setFlavorProfileIds(selectedFlavorProfileValueIds);
      setCuisineIds(selectedCuisineIds);
      setError(null);
    }
  }

  function toggle(list: string[], id: string, setList: (v: string[]) => void) {
    setList(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const [tagResult, flavorResult, cuisineResult] = await Promise.all([
        setDishTags(kind, { dishId, tagIds }),
        setDishFlavorProfiles(kind, {
          dishId,
          flavorProfileValueIds: flavorProfileIds,
        }),
        setDishCuisines(kind, { dishId, cuisineIds }),
      ]);
      if (
        tagResult.status === "error" ||
        flavorResult.status === "error" ||
        cuisineResult.status === "error"
      ) {
        setError(
          (tagResult.status === "error" ? tagResult.message : undefined) ??
            (flavorResult.status === "error"
              ? flavorResult.message
              : undefined) ??
            (cuisineResult.status === "error"
              ? cuisineResult.message
              : undefined) ??
            "Could not save.",
        );
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Tags className="size-3.5" aria-hidden="true" />
          Tags, Flavors & Cuisine
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 max-w-none"
        align="start"
        aria-label="Tags, Flavors & Cuisine"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-foreground text-sm font-medium">Tags</p>
            {tagOptions.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No tags yet — add one from Settings.
              </p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                {tagOptions.map((tag) => (
                  <Label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                  >
                    <Checkbox
                      checked={tagIds.includes(tag.id)}
                      onCheckedChange={() => toggle(tagIds, tag.id, setTagIds)}
                      aria-label={tag.displayName}
                    />
                    {tag.displayName}
                  </Label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-foreground text-sm font-medium">
              Flavor profiles
            </p>
            {flavorProfileOptions.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No Flavor profiles yet — add one from Settings.
              </p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                {flavorProfileOptions.map((value) => (
                  <Label
                    key={value.id}
                    className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                  >
                    <Checkbox
                      checked={flavorProfileIds.includes(value.id)}
                      onCheckedChange={() =>
                        toggle(flavorProfileIds, value.id, setFlavorProfileIds)
                      }
                      aria-label={value.displayName}
                    />
                    {value.displayName}
                  </Label>
                ))}
              </div>
            )}
          </div>

          <CuisineSelector
            options={cuisineOptions}
            selectedIds={cuisineIds}
            onToggle={(id) => toggle(cuisineIds, id, setCuisineIds)}
          />

          {error && (
            <p role="alert" className="text-destructive-text text-xs">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              loading={isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
