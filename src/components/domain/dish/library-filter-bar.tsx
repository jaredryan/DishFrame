"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterPopover } from "@/components/domain/dish/filter-popover";
import {
  SortSelect,
  type SortSelectOption,
} from "@/components/domain/dish/sort-select";
import { STAGE_LABEL } from "@/components/domain/dish/stage-badge";
import {
  DISPLAY_VIEW_PARAM,
  defaultLibrarySortDirection,
  isDefaultLibraryFilters,
  libraryFiltersToSearchParams,
  librarySortValues,
  ratingFilterValues,
  type LibraryFilters,
  type LibrarySortValue,
  type RatingFilterValue,
  type SortDirectionValue,
} from "@/lib/dishes/library-filters";
import { stageValues, type StageValue } from "@/lib/dishes/schema";

const SORT_LABEL: Record<LibrarySortValue, string> = {
  RECENTLY_UPDATED: "Recently updated",
  RECENTLY_CREATED: "Recently created",
  ALPHABETICAL: "Alphabetical",
  RATING: "Rating",
  RECENTLY_COOKED: "Recently cooked",
  DURATION: "Estimated duration",
};

const SORT_OPTIONS: SortSelectOption<LibrarySortValue>[] =
  librarySortValues.map((value) => ({
    value,
    label: SORT_LABEL[value],
    defaultDirection: defaultLibrarySortDirection(value),
  }));

const RATING_LABEL: Record<RatingFilterValue, string> = {
  UNRATED: "Unrated",
  THREE_PLUS: "3★ and up",
  FOUR_PLUS: "4★ and up",
  FIVE: "5★ only",
};

export type TagFilterOption = { id: string; displayName: string };
export type FlavorProfileFilterOption = { id: string; displayName: string };

const STAGE_OPTIONS = stageValues.map((stage) => ({
  value: stage,
  label: STAGE_LABEL[stage],
}));

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

  function toggleStage(value: string) {
    const stage = value as StageValue;
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

  function setSort(next: {
    property: LibrarySortValue;
    direction: SortDirectionValue;
  }) {
    // Slice 10 correction: any explicit dropdown pick is explicit — even
    // one that happens to match the default value — since it changes
    // ordering behavior while a search is active (relevance tier is
    // bypassed entirely once a Sort is explicit). Reversing direction is
    // just as explicit a choice as picking a different property.
    navigate({
      ...filters,
      sort: next.property,
      sortDirection: next.direction,
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
      sortDirection: filters.sortDirection,
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

  // Rating uses shadcn's Select, whose default trigger (font size/weight,
  // border/background color, corner radius) drifts from the Button-based
  // popover triggers above — this brings the two into one family, and also
  // matches SortSelect's own trigger.
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
          <FilterPopover
            label="Stage"
            options={STAGE_OPTIONS}
            selected={filters.stages}
            onToggleAction={toggleStage}
          />

          <FilterPopover
            label="Tags"
            options={tagOptions.map((tag) => ({
              value: tag.id,
              label: tag.displayName,
            }))}
            selected={filters.tagIds}
            onToggleAction={toggleTag}
            emptyMessage="No tags yet."
          />

          <FilterPopover
            label="Cuisine"
            options={cuisineOptions.map((cuisine) => ({
              value: cuisine,
              label: cuisine,
            }))}
            selected={filters.cuisines}
            onToggleAction={toggleCuisine}
            emptyMessage="No cuisines used yet."
          />

          <FilterPopover
            label="Flavor profiles"
            options={flavorProfileOptions.map((value) => ({
              value: value.id,
              label: value.displayName,
            }))}
            selected={filters.flavorProfileValueIds}
            onToggleAction={toggleFlavorProfile}
            emptyMessage="No Flavor profiles yet."
          />

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
        <SortSelect
          id="library-sort"
          property={filters.sort}
          direction={filters.sortDirection}
          options={SORT_OPTIONS}
          onChangeAction={setSort}
          triggerClassName={`${selectTriggerMatchClass} w-44`}
        />
      </div>
    </div>
  );
}
