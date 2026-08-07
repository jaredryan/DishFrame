"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGE_LABEL } from "@/components/domain/dish/stage-badge";
import {
  DISPLAY_VIEW_PARAM,
  isDefaultLibraryFilters,
  libraryFiltersToSearchParams,
  librarySortValues,
  ratingFilterValues,
  type LibraryFilters,
  type LibrarySortValue,
  type RatingFilterValue,
} from "@/lib/dishes/library-filters";
import { stageValues, type StageValue } from "@/lib/dishes/schema";

const SORT_LABEL: Record<LibrarySortValue, string> = {
  RECENTLY_UPDATED: "Recently updated",
  RECENTLY_CREATED: "Recently created",
  ALPHABETICAL: "Alphabetical",
  HIGHEST_RATED: "Highest rated",
  LOWEST_RATED: "Lowest rated",
  RECENTLY_COOKED: "Recently cooked",
  LEAST_RECENTLY_COOKED: "Least recently cooked",
  SHORTEST_DURATION: "Shortest estimated duration",
};

const RATING_LABEL: Record<RatingFilterValue, string> = {
  UNRATED: "Unrated",
  THREE_PLUS: "3★ and up",
  FOUR_PLUS: "4★ and up",
  FIVE: "5★ only",
};

export type TagFilterOption = { id: string; displayName: string };
export type FlavorProfileFilterOption = { id: string; displayName: string };

/**
 * PRODUCT_SPEC.md §43-50 — search box, filter chips (Stage/tags/cuisine/
 * Flavor profiles/rating), sort control, and visible active-filter state
 * with per-criterion and clear-all controls. Every change navigates to a
 * new URL (the server component re-runs `queryDishLibrary`) rather than
 * holding filter state client-side.
 */
export function LibraryFilterBar({
  basePath,
  filters: filtersProp,
  tagOptions,
  cuisineOptions,
  flavorProfileOptions,
}: {
  basePath: string;
  filters: LibraryFilters;
  tagOptions: TagFilterOption[];
  cuisineOptions: string[];
  flavorProfileOptions: FlavorProfileFilterOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local, optimistically-updated mirror of the `filters` prop. Each popover
  // checkbox navigates immediately (no batched "Apply"), and `router.push`
  // resolves asynchronously — without this, two rapid clicks (e.g. Stage
  // then Cuisine) each build their next URL from the same stale `filters`
  // prop, so the second navigation silently drops the first one's change.
  // Updating this state synchronously in `navigate()` makes each click
  // compose off the latest local selection instead of the last-confirmed
  // server props.
  const [filters, setFilters] = React.useState(filtersProp);
  const [prevFiltersKey, setPrevFiltersKey] = React.useState(
    libraryFiltersToSearchParams(filtersProp).toString(),
  );
  const filtersKey = libraryFiltersToSearchParams(filtersProp).toString();
  if (filtersKey !== prevFiltersKey) {
    setPrevFiltersKey(filtersKey);
    setFilters(filtersProp);
  }

  const [searchValue, setSearchValue] = React.useState(filters.search);

  // Resets the local input value when the URL's own `search` changes (e.g.
  // a chip removal or "Clear all") — adjusted during render rather than in
  // an effect, per React's guidance for state derived from props.
  const [prevSearch, setPrevSearch] = React.useState(filters.search);
  if (filters.search !== prevSearch) {
    setPrevSearch(filters.search);
    setSearchValue(filters.search);
  }

  function navigate(next: LibraryFilters) {
    setFilters(next);
    const params = libraryFiltersToSearchParams(next);
    // Filter navigations rebuild the query string from `next` alone, which
    // would otherwise silently drop the view-mode param this bar doesn't
    // own — carry it over from whatever's currently in the URL.
    const displayView = searchParams.get(DISPLAY_VIEW_PARAM);
    if (displayView) {
      params.set(DISPLAY_VIEW_PARAM, displayView);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...filters, search: searchValue.trim() });
  }

  function toggleStage(stage: StageValue) {
    const stages = filters.stages.includes(stage)
      ? filters.stages.filter((s) => s !== stage)
      : [...filters.stages, stage];
    navigate({ ...filters, stages });
  }

  function toggleTag(tagId: string) {
    const tagIds = filters.tagIds.includes(tagId)
      ? filters.tagIds.filter((id) => id !== tagId)
      : [...filters.tagIds, tagId];
    navigate({ ...filters, tagIds });
  }

  function toggleCuisine(cuisine: string) {
    const cuisines = filters.cuisines.includes(cuisine)
      ? filters.cuisines.filter((c) => c !== cuisine)
      : [...filters.cuisines, cuisine];
    navigate({ ...filters, cuisines });
  }

  function toggleFlavorProfile(id: string) {
    const flavorProfileValueIds = filters.flavorProfileValueIds.includes(id)
      ? filters.flavorProfileValueIds.filter((v) => v !== id)
      : [...filters.flavorProfileValueIds, id];
    navigate({ ...filters, flavorProfileValueIds });
  }

  function setRating(value: string) {
    navigate({
      ...filters,
      rating: value === "ANY" ? null : (value as RatingFilterValue),
    });
  }

  function setSort(value: string) {
    // Slice 10 correction: any explicit dropdown pick is explicit — even
    // one that happens to match the default value — since it changes
    // ordering behavior while a search is active (relevance tier is
    // bypassed entirely once a Sort is explicit).
    navigate({
      ...filters,
      sort: value as LibrarySortValue,
      sortIsExplicit: true,
    });
  }

  function clearAll() {
    navigate({
      search: "",
      stages: [],
      tagIds: [],
      cuisines: [],
      flavorProfileValueIds: [],
      rating: null,
      sort: filters.sort,
      sortIsExplicit: filters.sortIsExplicit,
    });
  }

  const tagNameById = new Map(tagOptions.map((t) => [t.id, t.displayName]));
  const flavorProfileNameById = new Map(
    flavorProfileOptions.map((v) => [v.id, v.displayName]),
  );

  const activeChips: { key: string; label: string; onRemove: () => void }[] =
    [];
  if (filters.search) {
    activeChips.push({
      key: "search",
      label: `“${filters.search}”`,
      onRemove: () => navigate({ ...filters, search: "" }),
    });
  }
  for (const stage of filters.stages) {
    activeChips.push({
      key: `stage-${stage}`,
      label: STAGE_LABEL[stage],
      onRemove: () => toggleStage(stage),
    });
  }
  for (const cuisine of filters.cuisines) {
    activeChips.push({
      key: `cuisine-${cuisine}`,
      label: cuisine,
      onRemove: () => toggleCuisine(cuisine),
    });
  }
  for (const flavorProfileId of filters.flavorProfileValueIds) {
    activeChips.push({
      key: `flavor-${flavorProfileId}`,
      label: flavorProfileNameById.get(flavorProfileId) ?? "Flavor profile",
      onRemove: () => toggleFlavorProfile(flavorProfileId),
    });
  }
  for (const tagId of filters.tagIds) {
    activeChips.push({
      key: `tag-${tagId}`,
      label: tagNameById.get(tagId) ?? "Tag",
      onRemove: () => toggleTag(tagId),
    });
  }
  if (filters.rating) {
    activeChips.push({
      key: "rating",
      label: RATING_LABEL[filters.rating],
      onRemove: () => navigate({ ...filters, rating: null }),
    });
  }

  const hasActiveFilters = !isDefaultLibraryFilters(filters);

  // Every dropdown/menu trigger in this group (Stage/Tags/Cuisine/Flavor
  // profiles) shares this exact class list, so they read as one consistent
  // family of menu triggers rather than a mix of chips and buttons.
  const menuTriggerClass = "gap-1.5";

  // Rating/Sort use shadcn's Select, whose default trigger (font size/
  // weight, border/background color, corner radius) drifts from the
  // Button-based triggers above — this brings the two into one family.
  const selectTriggerMatchClass =
    "gap-1 rounded-[min(var(--radius-md),12px)] data-[size=sm]:rounded-[min(var(--radius-md),12px)] border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
        <form onSubmit={submitSearch} className="min-w-48 flex-1">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search…"
              aria-label="Search"
              className="pl-8"
            />
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={menuTriggerClass}>
                Stage
                <ChevronDown
                  className="text-muted-foreground size-3.5"
                  aria-hidden="true"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 max-w-none" align="start">
              <div className="flex flex-col gap-1.5">
                {stageValues.map((stage) => (
                  <Label
                    key={stage}
                    className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                  >
                    <Checkbox
                      checked={filters.stages.includes(stage)}
                      onCheckedChange={() => toggleStage(stage)}
                    />
                    {STAGE_LABEL[stage]}
                  </Label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={menuTriggerClass}>
                Tags
                <ChevronDown
                  className="text-muted-foreground size-3.5"
                  aria-hidden="true"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 max-w-none" align="start">
              {tagOptions.length === 0 ? (
                <p className="text-muted-foreground text-xs">No tags yet.</p>
              ) : (
                <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                  {tagOptions.map((tag) => (
                    <Label
                      key={tag.id}
                      className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                    >
                      <Checkbox
                        checked={filters.tagIds.includes(tag.id)}
                        onCheckedChange={() => toggleTag(tag.id)}
                      />
                      {tag.displayName}
                    </Label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={menuTriggerClass}>
                Cuisine
                <ChevronDown
                  className="text-muted-foreground size-3.5"
                  aria-hidden="true"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 max-w-none" align="start">
              {cuisineOptions.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No cuisines used yet.
                </p>
              ) : (
                <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                  {cuisineOptions.map((cuisine) => (
                    <Label
                      key={cuisine}
                      className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                    >
                      <Checkbox
                        checked={filters.cuisines.includes(cuisine)}
                        onCheckedChange={() => toggleCuisine(cuisine)}
                      />
                      {cuisine}
                    </Label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={menuTriggerClass}>
                Flavor profiles
                <ChevronDown
                  className="text-muted-foreground size-3.5"
                  aria-hidden="true"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 max-w-none" align="start">
              {flavorProfileOptions.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No Flavor profiles yet.
                </p>
              ) : (
                <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                  {flavorProfileOptions.map((value) => (
                    <Label
                      key={value.id}
                      className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                    >
                      <Checkbox
                        checked={filters.flavorProfileValueIds.includes(
                          value.id,
                        )}
                        onCheckedChange={() => toggleFlavorProfile(value.id)}
                      />
                      {value.displayName}
                    </Label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Select value={filters.rating ?? "ANY"} onValueChange={setRating}>
            <SelectTrigger
              size="sm"
              className={`${selectTriggerMatchClass} w-36`}
              aria-label="Rating filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any rating</SelectItem>
              {ratingFilterValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {RATING_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sort is a display order, not a filter criterion (it never narrows
          results) — kept in its own row, visually separated from the filter
          controls above by a top border rather than sharing their row. */}
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {hasActiveFilters ? (
            <>
              {activeChips.map((chip) => (
                <Badge
                  key={chip.key}
                  variant="outline"
                  className="bg-primary/15 text-brand-blue-text gap-1 border-transparent pr-1 text-xs"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`Remove ${chip.label} filter`}
                    className="hover:bg-primary/20 cursor-pointer rounded-full p-0.5"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="text-muted-foreground text-xs hover:underline"
              >
                Clear all
              </button>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">
              No filters applied
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="library-sort"
            className="text-muted-foreground text-xs font-normal"
          >
            Sort
          </Label>
          <Select value={filters.sort} onValueChange={setSort}>
            <SelectTrigger
              id="library-sort"
              size="sm"
              className={`${selectTriggerMatchClass} w-44`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {librarySortValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {SORT_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
