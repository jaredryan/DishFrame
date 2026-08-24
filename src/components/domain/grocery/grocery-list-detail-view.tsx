"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { DragHandle } from "@/components/ui/drag-handle";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import { SelectableDishRow } from "@/components/domain/dish/selectable-dish-row";
import { DishYieldScalingField } from "@/components/domain/grocery/dish-yield-scaling-field";
import { RichVersionPickerField } from "@/components/domain/dish/version-picker-field";
import {
  PICKER_TABS,
  candidateToSelectionItem,
  type PickerTab,
} from "@/components/domain/grocery/grocery-source-picker";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import { toIsoDateOnly, formatDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  toggleGroceryItem,
  addManualGroceryItem,
  editGroceryItem,
  removeGroceryItem,
  recategorizeGroceryItem,
  reorderGroceryListItems,
  combineGroceryItems,
  uncombineGroceryItem,
  selectGroceryItemVariant,
  updateGroceryListDetails,
  completeGroceryList,
  reopenGroceryList,
  duplicateGroceryList,
  deleteGroceryList,
  previewGroceryListSourceRefresh,
  applyGroceryListSourceRefresh,
  acknowledgeGroceryItemSync,
  addGroceryListSource,
  removeGroceryListSource,
  updateGroceryListSource,
  listGrocerySourceVersionOptions,
} from "@/lib/grocery/list-actions";
import { resyncMealPlanGroceryLists } from "@/lib/mealplans/actions";
import Link from "next/link";
import type {
  GroceryListDetailDto,
  GroceryListItemDto,
  GroceryListSourceDto,
  GroceryCategoryOptionDto,
} from "@/lib/grocery/list-schema";
import type { GroceryListSourceRefreshPreview } from "@/lib/grocery/list-service";
import type {
  GrocerySourceCandidate,
  DishVersionYieldOption,
} from "@/lib/grocery/queries";

const FALLBACK_LABEL = "Other";

function groupByCategory(
  items: GroceryListItemDto[],
): { label: string; categoryId: string | null; items: GroceryListItemDto[] }[] {
  const groups = new Map<
    string,
    { label: string; categoryId: string | null; items: GroceryListItemDto[] }
  >();
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    const key = item.category?.id ?? "__none__";
    if (!groups.has(key)) {
      groups.set(key, {
        label: item.category?.displayName ?? FALLBACK_LABEL,
        categoryId: item.category?.id ?? null,
        items: [],
      });
    }
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()];
}

/**
 * Truthful aggregate optionality for display (Slice 12 correction 2). A
 * multi-contribution item's own `isOptional` boolean can't honestly
 * represent a manually-merged required+optional mix (§61.1 guarantees
 * auto-combined groups are always uniform, but manual merge — §61.5 — may
 * deliberately combine differing optionality) — so this derives the
 * displayed state straight from each contribution's own `isOptional`
 * instead of trusting the item-level flag whenever there's more than one.
 */
function aggregateOptionalityDisplay(
  item: GroceryListItemDto,
): "required" | "optional" | "mixed" {
  if (item.contributions.length <= 1) {
    return item.isOptional ? "optional" : "required";
  }
  const flags = item.contributions.map((c) => c.isOptional);
  if (flags.every(Boolean)) return "optional";
  if (flags.every((f) => !f)) return "required";
  return "mixed";
}

export function GroceryListDetailView({
  list,
  categoryOptions,
  sourceCandidates,
}: {
  list: GroceryListDetailDto;
  categoryOptions: GroceryCategoryOptionDto[];
  sourceCandidates: GrocerySourceCandidate[];
}) {
  const router = useRouter();
  const [checkedIds, setCheckedIds] = React.useState(
    () => new Set(list.items.filter((i) => i.checkedAt).map((i) => i.id)),
  );
  const [combineMode, setCombineMode] = React.useState(false);
  const [combineSelection, setCombineSelection] = React.useState<Set<string>>(
    new Set(),
  );
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [refreshSourceId, setRefreshSourceId] = React.useState<string | null>(
    null,
  );
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [addItemOpen, setAddItemOpen] = React.useState(false);
  const [mealsCollapsed, setMealsCollapsed] = React.useState(false);
  const [groceriesCollapsed, setGroceriesCollapsed] = React.useState(false);
  const [addMealOpen, setAddMealOpen] = React.useState(false);
  const [editingSource, setEditingSource] =
    React.useState<GroceryListSourceDto | null>(null);
  const [deletingSourceId, setDeletingSourceId] = React.useState<string | null>(
    null,
  );
  const sensors = useReorderSensors();

  const [prevItems, setPrevItems] = React.useState(list.items);
  if (prevItems !== list.items) {
    setPrevItems(list.items);
    setCheckedIds(
      new Set(list.items.filter((i) => i.checkedAt).map((i) => i.id)),
    );
  }

  const isCompleted = list.completedAt != null;
  const groups = groupByCategory(list.items);

  function refresh() {
    router.refresh();
  }

  function handleToggle(itemId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    startTransition(async () => {
      const result = await toggleGroceryItem({ listId: list.id, itemId });
      if (result.status !== "success") {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          if (next.has(itemId)) next.delete(itemId);
          else next.add(itemId);
          return next;
        });
        setError(result.message ?? "Could not update this item.");
      }
    });
  }

  function runAction(
    action: () => Promise<{ status: string; message?: string }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status !== "success") {
        setError(result.message ?? "Something went wrong.");
      } else {
        refresh();
      }
    });
  }

  function handleCombine() {
    if (combineSelection.size < 2) return;
    runAction(() =>
      combineGroceryItems({ listId: list.id, itemIds: [...combineSelection] }),
    );
    setCombineMode(false);
    setCombineSelection(new Set());
  }

  // Drag-to-reorder is scoped to one category group's own `SortableContext`
  // at a time (matching the up/down-arrow behavior it replaces) — the full
  // list order is rebuilt by keeping every other group's relative order and
  // splicing in this group's newly-dragged order.
  function handleGroupDragEnd(group: GroceryListItemDto[]) {
    return (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = group.findIndex((i) => i.id === active.id);
      const newIndex = group.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reorderedGroup = arrayMove(group, oldIndex, newIndex);
      const groupIds = new Set(group.map((i) => i.id));
      const fullOrder = [...list.items].sort((a, b) => a.position - b.position);
      let cursor = 0;
      const orderedItemIds = fullOrder.map((item) =>
        groupIds.has(item.id) ? reorderedGroup[cursor++].id : item.id,
      );
      runAction(() =>
        reorderGroceryListItems({ listId: list.id, orderedItemIds }),
      );
    };
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Grocery Lists", href: "/grocery-lists" },
          { label: list.title },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            {list.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={isCompleted ? "secondary" : "default"}>
              {isCompleted ? "Completed" : "Active"}
            </Badge>
            <Badge variant="outline">
              {formatDateOnly(list.plannedDate, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Badge>
            {list.mode === "MEAL_PLAN_LINKED" && list.linkedMealPlanId && (
              <Link
                href={`/meal-plans/${list.linkedMealPlanId}`}
                className="text-muted-foreground text-sm underline"
              >
                Linked to Meal Plan
              </Link>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setEditOpen(true)}
            aria-label="Edit this list"
          >
            <Pencil aria-hidden="true" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal aria-hidden="true" />
                <span className="sr-only">List actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isCompleted ? (
                <DropdownMenuItem
                  onClick={() =>
                    runAction(() => reopenGroceryList({ listId: list.id }))
                  }
                >
                  Reopen
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() =>
                    runAction(() => completeGroceryList({ listId: list.id }))
                  }
                >
                  Complete
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() =>
                  startTransition(async () => {
                    const result = await duplicateGroceryList({
                      listId: list.id,
                    });
                    if (result.status === "success") {
                      router.push(`/grocery-lists/${result.listId}`);
                    } else {
                      setError(result.message);
                    }
                  })
                }
              >
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive-text"
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <h2 className="font-heading text-lg font-medium">Meals</h2>
            <TooltipIconButton
              label={mealsCollapsed ? "Expand Meals" : "Collapse Meals"}
              icon={mealsCollapsed ? ChevronDown : ChevronUp}
              onClick={() => setMealsCollapsed((v) => !v)}
            />
          </div>
          {!isCompleted && (
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => setAddMealOpen(true)}
            >
              <Plus aria-hidden="true" /> Add meal
            </Button>
          )}
        </div>
        {!mealsCollapsed && (
          <div className="flex flex-col gap-2">
            {list.sources.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No meals in this list yet.
              </p>
            ) : (
              list.sources.map((source) => (
                <MealCard
                  key={source.id}
                  source={source}
                  isCompleted={isCompleted}
                  onSync={() => setRefreshSourceId(source.id)}
                  onEdit={() => setEditingSource(source)}
                  onDelete={() => setDeletingSourceId(source.id)}
                />
              ))
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <h2 className="font-heading text-lg font-medium">Groceries</h2>
            <TooltipIconButton
              label={
                groceriesCollapsed ? "Expand Groceries" : "Collapse Groceries"
              }
              icon={groceriesCollapsed ? ChevronDown : ChevronUp}
              onClick={() => setGroceriesCollapsed((v) => !v)}
            />
          </div>
          {!isCompleted && (
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => setAddItemOpen(true)}
            >
              <Plus aria-hidden="true" /> Add item
            </Button>
          )}
        </div>

        {!groceriesCollapsed && (
          <div className="flex flex-col gap-4">
            {!isCompleted && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={combineMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setCombineMode((prev) => !prev);
                    setCombineSelection(new Set());
                  }}
                >
                  {combineMode ? "Cancel combine" : "Combine items"}
                </Button>
                {list.mode === "MEAL_PLAN_LINKED" && list.linkedMealPlanId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      runAction(() =>
                        resyncMealPlanGroceryLists({
                          mealPlanId: list.linkedMealPlanId!,
                        }),
                      )
                    }
                  >
                    Sync now
                  </Button>
                )}
                {combineMode && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={combineSelection.size < 2 || isPending}
                    onClick={handleCombine}
                  >
                    Combine selected ({combineSelection.size})
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-5">
              {groups.map((group) => {
                const dragDisabledBase = isCompleted || combineMode;
                return (
                  <div
                    key={group.categoryId ?? "none"}
                    className="flex flex-col gap-2"
                  >
                    <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      {group.label}
                    </h3>
                    <DndContext
                      id={`grocery-items-${group.categoryId ?? "none"}`}
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleGroupDragEnd(group.items)}
                      accessibility={{
                        announcements: createReorderAnnouncements(
                          (id) =>
                            group.items.find((i) => i.id === id)?.name ??
                            "item",
                          (id) => ({
                            index: group.items.findIndex((i) => i.id === id),
                            total: group.items.length,
                          }),
                        ),
                      }}
                    >
                      <SortableContext
                        items={group.items.map((i) => i.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ul className="flex flex-col gap-2">
                          {group.items.map((item) => (
                            <SortableGroceryItemRow
                              key={item.id}
                              item={item}
                              checked={checkedIds.has(item.id)}
                              onToggle={() => handleToggle(item.id)}
                              disabled={isCompleted}
                              dragDisabled={
                                dragDisabledBase || editingItemId === item.id
                              }
                              categoryOptions={categoryOptions}
                              combineMode={combineMode}
                              combineSelected={combineSelection.has(item.id)}
                              onCombineToggle={() =>
                                setCombineSelection((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(item.id)) next.delete(item.id);
                                  else next.add(item.id);
                                  return next;
                                })
                              }
                              isEditing={editingItemId === item.id}
                              onStartEdit={() => setEditingItemId(item.id)}
                              onCancelEdit={() => setEditingItemId(null)}
                              onRecategorize={(categoryId) =>
                                runAction(() =>
                                  recategorizeGroceryItem({
                                    listId: list.id,
                                    itemId: item.id,
                                    categoryId,
                                  }),
                                )
                              }
                              onEdit={(input) =>
                                runAction(() =>
                                  editGroceryItem({
                                    listId: list.id,
                                    itemId: item.id,
                                    ...input,
                                  }),
                                )
                              }
                              onRemove={() =>
                                runAction(() =>
                                  removeGroceryItem({
                                    listId: list.id,
                                    itemId: item.id,
                                  }),
                                )
                              }
                              onUncombine={() =>
                                runAction(() =>
                                  uncombineGroceryItem({
                                    listId: list.id,
                                    itemId: item.id,
                                  }),
                                )
                              }
                              onSelectVariant={(variant) =>
                                runAction(() =>
                                  selectGroceryItemVariant({
                                    listId: list.id,
                                    itemId: item.id,
                                    variant,
                                  }),
                                )
                              }
                              onAcknowledgeSync={() =>
                                runAction(() =>
                                  acknowledgeGroceryItemSync({
                                    listId: list.id,
                                    itemId: item.id,
                                  }),
                                )
                              }
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  </div>
                );
              })}
              {list.items.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  This list has no items yet.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {addItemOpen && (
        <AddItemDialog
          listId={list.id}
          categoryOptions={categoryOptions}
          onClose={() => setAddItemOpen(false)}
          onAdded={() => {
            refresh();
            setAddItemOpen(false);
          }}
        />
      )}

      {addMealOpen && (
        <AddMealDialog
          listId={list.id}
          candidates={sourceCandidates}
          onClose={() => setAddMealOpen(false)}
          onAdded={() => {
            refresh();
            setAddMealOpen(false);
          }}
        />
      )}

      {editingSource && (
        <EditMealDialog
          listId={list.id}
          source={editingSource}
          onClose={() => setEditingSource(null)}
          onSaved={() => {
            refresh();
            setEditingSource(null);
          }}
        />
      )}

      <Dialog
        open={deletingSourceId != null}
        onOpenChange={(open) => !open && setDeletingSourceId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this meal?</DialogTitle>
            <DialogDescription>
              This removes its ingredients from the Groceries list below. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingSourceId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                if (!deletingSourceId) return;
                const sourceId = deletingSourceId;
                setDeletingSourceId(null);
                runAction(() =>
                  removeGroceryListSource({ listId: list.id, sourceId }),
                );
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editOpen && (
        <EditGroceryListDialog
          list={list}
          onClose={() => setEditOpen(false)}
          onSaved={refresh}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this grocery list?</DialogTitle>
            <DialogDescription>
              This permanently deletes the list and every item on it. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteGroceryList({ listId: list.id });
                  if (result.status === "success") {
                    router.push("/grocery-lists");
                  } else {
                    setError(result.message ?? "Could not delete this list.");
                    setDeleteOpen(false);
                  }
                })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {refreshSourceId && (
        <RefreshSourceDialog
          listId={list.id}
          sourceId={refreshSourceId}
          onClose={() => setRefreshSourceId(null)}
          onApplied={refresh}
        />
      )}
    </div>
  );
}

/** One Grocery List source, as a Recipe/Part-name-left / action-group-right
 * card — Sync uses the same latest-Version semantics as the rest of
 * DishFrame (the existing `RefreshSourceDialog` preview/apply flow); Edit
 * and Delete are new. Never draggable — sources aren't reorderable. */
function MealCard({
  source,
  isCompleted,
  onSync,
  onEdit,
  onDelete,
}: {
  source: GroceryListSourceDto;
  isCompleted: boolean;
  onSync: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border-border bg-card flex items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {source.sourceDishTitleSnapshot}{" "}
          <span className="text-muted-foreground font-normal">
            {source.sourceDishVersionLabelSnapshot}
          </span>
        </p>
        {source.isDeleted && (
          <p className="text-muted-foreground text-xs">
            This Recipe/Part has been deleted.
          </p>
        )}
      </div>
      {!isCompleted && (
        <div className="flex shrink-0 items-center gap-0.5">
          {!source.isDeleted && (
            <TooltipIconButton
              label={`Sync ${source.sourceDishTitleSnapshot}`}
              icon={RefreshCw}
              onClick={onSync}
            />
          )}
          {!source.isDeleted && (
            <TooltipIconButton
              label={`Edit ${source.sourceDishTitleSnapshot}`}
              icon={Pencil}
              onClick={onEdit}
            />
          )}
          <TooltipIconButton
            label={`Delete ${source.sourceDishTitleSnapshot}`}
            icon={Trash2}
            onClick={onDelete}
            className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
          />
        </div>
      )}
    </div>
  );
}

/** Detail page's "Add meal" — the same rich search picker used by Cook/Send/
 * Publish/Add-Edit-Meal (`SelectableDishRow` + sticky search/tabs), single-
 * select, followed by the same target-servings scaling step
 * `GrocerySourcePickerPanel` uses when creating a list from scratch. */
function AddMealDialog({
  listId,
  candidates,
  onClose,
  onAdded,
}: {
  listId: string;
  candidates: GrocerySourceCandidate[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<PickerTab>("ALL");
  const [selectedDishId, setSelectedDishId] = React.useState<string | null>(
    null,
  );
  const [scale, setScale] = React.useState<number | null>(1);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const selected = candidates.find((c) => c.dishId === selectedDishId) ?? null;
  const tabCandidates = candidates.filter(
    (c) => tab === "ALL" || c.kind === tab,
  );
  const filtered = tabCandidates.filter((c) =>
    c.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function handleAdd() {
    if (!selectedDishId) return;
    setError(null);
    startTransition(async () => {
      const result = await addGroceryListSource({
        listId,
        dishId: selectedDishId,
        scaleFactor: scale ?? 1,
      });
      if (result.status === "success") {
        onAdded();
      } else {
        setError(result.message ?? "Could not add this meal.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add meal</DialogTitle>
          <DialogDescription>
            Select a Recipe or Part to add to this list.
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="flex flex-col gap-4">
            <SelectableDishRow
              item={candidateToSelectionItem(selected)}
              selectionControl="remove"
              onRemove={() => setSelectedDishId(null)}
            />
            <DishYieldScalingField
              id={selected.dishId}
              kindLabel={selected.kind === "PART" ? "Part" : "Recipe"}
              yieldQuantity={selected.yieldQuantity}
              yieldUnit={selected.yieldUnit}
              onScaleChange={setScale}
            />
          </div>
        ) : (
          <div className="-mx-1 flex min-h-0 flex-col gap-2 overflow-y-auto px-1">
            <div className="bg-popover sticky top-0 z-10 flex flex-col gap-2 pb-2">
              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  placeholder="Search"
                  className="pl-8"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div role="tablist" className="border-border flex gap-1 border-b">
                {PICKER_TABS.map((t) => (
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

            {filtered.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                {candidates.length === 0
                  ? "You don't have any recipes or parts saved yet."
                  : "Nothing matches that search."}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {filtered.map((candidate) => (
                  <SelectableDishRow
                    key={candidate.dishId}
                    item={candidateToSelectionItem(candidate)}
                    selectionControl="radio"
                    selected={false}
                    onSelect={() => setSelectedDishId(candidate.dishId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selectedDishId || isPending}>
            {isPending ? "Adding…" : "Add meal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Detail page's "Edit meal" — a direct one-step Version + target-servings
 * change (no diff preview, unlike Sync). Version options (each with its own
 * authored yield) are fetched fresh on open since they aren't part of the
 * page's initial data. */
function EditMealDialog({
  listId,
  source,
  onClose,
  onSaved,
}: {
  listId: string;
  source: GroceryListSourceDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [versions, setVersions] = React.useState<
    DishVersionYieldOption[] | null
  >(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = React.useState(
    source.dishVersionId ?? "",
  );
  const [scale, setScale] = React.useState<number | null>(source.scaleFactor);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!source.dishId) return;
    let cancelled = false;
    listGrocerySourceVersionOptions({ dishId: source.dishId }).then(
      (result) => {
        if (cancelled) return;
        if (result.status === "success") {
          setVersions(result.versions);
        } else {
          setLoadError(result.message);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source.dishId]);

  const selectedVersion =
    versions?.find((v) => v.id === selectedVersionId) ?? null;

  function handleSave() {
    if (!selectedVersionId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateGroceryListSource({
        listId,
        sourceId: source.id,
        targetVersionId: selectedVersionId,
        scaleFactor: scale ?? 1,
      });
      if (result.status === "success") {
        onSaved();
      } else {
        setError(result.message ?? "Could not save this meal.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {source.sourceDishTitleSnapshot}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {loadError && (
            <p role="alert" className="text-destructive-text text-sm">
              {loadError}
            </p>
          )}
          {!versions && !loadError && (
            <p className="text-muted-foreground text-sm">Loading versions…</p>
          )}
          {versions && (
            <RichVersionPickerField
              id="edit-meal-version"
              versions={versions}
              value={selectedVersionId}
              onChangeAction={setSelectedVersionId}
            />
          )}
          {selectedVersion && (
            <DishYieldScalingField
              id={source.id}
              kindLabel={
                source.sourceDishKindSnapshot === "PART" ? "Part" : "Recipe"
              }
              yieldQuantity={selectedVersion.yieldQuantity}
              yieldUnit={selectedVersion.yieldUnit}
              initialQuantity={
                selectedVersion.id === source.dishVersionId &&
                selectedVersion.yieldQuantity != null
                  ? selectedVersion.yieldQuantity * source.scaleFactor
                  : undefined
              }
              onScaleChange={setScale}
            />
          )}
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !selectedVersionId}
          >
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DragHandleProps = {
  attributes: React.ComponentProps<typeof DragHandle>["attributes"];
  listeners: React.ComponentProps<typeof DragHandle>["listeners"];
  isDragging: boolean;
};

/**
 * Sortable wrapper around `GroceryItemRow` — owns the `useSortable` hook so
 * dragging is scoped to one category group's `SortableContext` at a time,
 * matching the reorder pattern established by `GroceryCategoryManager`.
 * Dragging is disabled for the row currently being edited, same reasoning
 * as the category manager (its form fields shouldn't fight the drag
 * sensor), and for every row while the list is completed or in combine mode.
 */
function SortableGroceryItemRow(
  props: Omit<React.ComponentProps<typeof GroceryItemRow>, "dragHandle"> & {
    dragDisabled: boolean;
  },
) {
  const { dragDisabled, ...rowProps } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.item.id, disabled: dragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3"
    >
      <GroceryItemRow
        {...rowProps}
        dragHandle={dragDisabled ? null : { attributes, listeners, isDragging }}
      />
    </li>
  );
}

function GroceryItemRow({
  item,
  checked,
  onToggle,
  disabled,
  categoryOptions,
  combineMode,
  combineSelected,
  onCombineToggle,
  isEditing,
  onStartEdit,
  onCancelEdit,
  dragHandle,
  onRecategorize,
  onEdit,
  onRemove,
  onUncombine,
  onSelectVariant,
  onAcknowledgeSync,
}: {
  item: GroceryListItemDto;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
  categoryOptions: GroceryCategoryOptionDto[];
  combineMode: boolean;
  combineSelected: boolean;
  onCombineToggle: () => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  dragHandle: DragHandleProps | null;
  onRecategorize: (categoryId: string) => void;
  onEdit: (input: {
    name?: string;
    quantityText?: string | null;
    unit?: string | null;
  }) => void;
  onRemove: () => void;
  onUncombine: () => void;
  onSelectVariant: (variant: "PRIMARY" | "SUBSTITUTE") => void;
  onAcknowledgeSync: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const isCombined = item.contributions.length > 1;
  const soleContribution = !isCombined ? item.contributions[0] : undefined;
  // Only show a variant-selection action that can actually succeed (Slice 12
  // correction 2) — a single, not-yet-combined, not-manually-added line with
  // a saved substitute (§62.2).
  const canSelectVariant =
    !item.isManual && soleContribution?.hasSubstitute === true;
  const optionalityDisplay = aggregateOptionalityDisplay(item);

  return (
    <>
      <div className="flex items-center gap-2">
        {dragHandle && (
          <DragHandle
            label={`Drag to reorder ${item.name}`}
            attributes={dragHandle.attributes}
            listeners={dragHandle.listeners}
            isDragging={dragHandle.isDragging}
          />
        )}
        {combineMode ? (
          <Checkbox
            checked={combineSelected}
            onCheckedChange={onCombineToggle}
          />
        ) : (
          <Checkbox
            checked={checked}
            onCheckedChange={onToggle}
            disabled={disabled}
            aria-label={`Mark ${item.name} ${checked ? "not bought" : "bought"}`}
          />
        )}

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                onEdit({
                  name: String(formData.get("name") ?? "").trim() || undefined,
                  quantityText:
                    String(formData.get("quantityText") ?? "").trim() || null,
                  unit: String(formData.get("unit") ?? "").trim() || null,
                });
                const categoryId = String(
                  formData.get("categoryId") ?? "",
                ).trim();
                if (categoryId && categoryId !== (item.category?.id ?? "")) {
                  onRecategorize(categoryId);
                }
                onCancelEdit();
              }}
            >
              <Input name="name" defaultValue={item.name} className="h-8" />
              <div className="flex items-center gap-2">
                <Input
                  name="quantityText"
                  defaultValue={item.quantityText ?? ""}
                  placeholder="Qty"
                  className="h-8 w-20"
                />
                <Input
                  name="unit"
                  defaultValue={item.unit ?? ""}
                  placeholder="Unit"
                  className="h-8 w-20"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`category-${item.id}`} className="text-xs">
                  Category
                </Label>
                <Select
                  name="categoryId"
                  defaultValue={item.category?.id ?? ""}
                >
                  <SelectTrigger
                    id={`category-${item.id}`}
                    className="h-7 w-40 text-xs"
                  >
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm">
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onCancelEdit}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div
              className={
                checked ? "text-muted-foreground line-through" : undefined
              }
            >
              <span className="text-sm">
                {[item.quantityText, item.unit, item.name]
                  .filter(Boolean)
                  .join(" ")}
              </span>
              {optionalityDisplay === "optional" && (
                <Badge variant="outline" className="ml-2 align-middle">
                  Optional
                </Badge>
              )}
              {optionalityDisplay === "mixed" && (
                <Badge variant="outline" className="ml-2 align-middle">
                  Total (with optional)
                </Badge>
              )}
              {item.isManual && (
                <Badge variant="outline" className="ml-2 align-middle">
                  Manual
                </Badge>
              )}
              {item.syncFlag === "REMOVED" && (
                <Badge variant="destructive" className="ml-2 align-middle">
                  No longer in the plan
                </Badge>
              )}
              {item.syncFlag === "CHANGED" && (
                <Badge variant="outline" className="ml-2 align-middle">
                  Plan changed
                </Badge>
              )}
              {item.syncFlag !== "UNCHANGED" && !item.flagAcknowledgedAt && (
                <button
                  type="button"
                  className="text-muted-foreground ml-2 align-middle text-xs underline"
                  onClick={onAcknowledgeSync}
                >
                  Acknowledge
                </button>
              )}
            </div>
          )}
        </div>

        {!disabled && !isEditing && !combineMode && (
          <div className="flex shrink-0 items-center gap-0.5">
            <TooltipIconButton
              label={`Edit ${item.name}`}
              icon={Pencil}
              onClick={onStartEdit}
            />
            <TooltipIconButton
              label={`Remove ${item.name}`}
              icon={Trash2}
              onClick={onRemove}
              className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
            />
          </div>
        )}
      </div>

      {!disabled &&
        !isEditing &&
        !combineMode &&
        (isCombined || canSelectVariant) && (
          <div className="flex flex-wrap items-center gap-2 pl-7">
            {isCombined && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((p) => !p)}
              >
                {expanded ? "Hide" : "Show"} sources (
                {item.contributions.length})
              </Button>
            )}
            {isCombined && (
              <Button variant="ghost" size="sm" onClick={onUncombine}>
                Uncombine
              </Button>
            )}
            {canSelectVariant &&
              soleContribution!.selectedVariant === "PRIMARY" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectVariant("SUBSTITUTE")}
                >
                  Use substitute
                </Button>
              )}
            {canSelectVariant &&
              soleContribution!.selectedVariant === "SUBSTITUTE" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectVariant("PRIMARY")}
                >
                  Use original
                </Button>
              )}
          </div>
        )}

      {expanded && isCombined && (
        <ul className="text-muted-foreground border-border ml-7 flex flex-col gap-1 border-l pl-3 text-xs">
          {item.contributions.map((c) => (
            <li key={c.id}>
              {[c.quantityText, c.unit, c.originalName]
                .filter(Boolean)
                .join(" ")}
              {c.isOptional && " · optional"}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AddItemDialog({
  listId,
  categoryOptions,
  onClose,
  onAdded,
}: {
  listId: string;
  categoryOptions: GroceryCategoryOptionDto[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add item</DialogTitle>
        </DialogHeader>
        <form
          id="add-grocery-item-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const name = String(formData.get("name") ?? "").trim();
            if (!name) return;
            setError(null);
            const categoryId =
              String(formData.get("categoryId") ?? "").trim() || null;
            startTransition(async () => {
              const result = await addManualGroceryItem({
                listId,
                name,
                quantityText:
                  String(formData.get("quantityText") ?? "").trim() || null,
                unit: String(formData.get("unit") ?? "").trim() || null,
                categoryId,
              });
              if (result.status === "success") {
                onAdded();
              } else {
                setError(result.message ?? "Could not add this item.");
              }
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="manual-item-name">Item</Label>
            <Input
              id="manual-item-name"
              name="name"
              placeholder="e.g. Paper towels"
              required
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="manual-item-quantity">Qty</Label>
              <Input
                id="manual-item-quantity"
                name="quantityText"
                className="w-20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="manual-item-unit">Unit</Label>
              <Input id="manual-item-unit" name="unit" className="w-20" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="manual-item-category">Category</Label>
            <Select name="categoryId">
              <SelectTrigger id="manual-item-category" className="w-full">
                <SelectValue placeholder="Category (auto)" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-grocery-item-form"
            disabled={isPending}
          >
            {isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditGroceryListDialog({
  list,
  onClose,
  onSaved,
}: {
  list: GroceryListDetailDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(list.title);
  const [plannedDate, setPlannedDate] = React.useState(() =>
    toIsoDateOnly(new Date(list.plannedDate)),
  );
  const [isActive, setIsActive] = React.useState(list.completedAt == null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateGroceryListDetails({
        listId: list.id,
        title,
        plannedDate: new Date(plannedDate),
        isActive,
      });
      if (result.status === "success") {
        onSaved();
        onClose();
      } else {
        setError(result.message ?? "Could not save these changes.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit grocery list</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="edit-grocery-list-title">Name</FieldLabel>
            <Input
              id="edit-grocery-list-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-grocery-list-date">Date</FieldLabel>
            <DatePickerField
              id="edit-grocery-list-date"
              value={plannedDate}
              onChange={setPlannedDate}
              ariaLabel="Grocery list date"
            />
          </Field>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="edit-grocery-list-active">Active</Label>
            <Switch
              id="edit-grocery-list-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefreshSourceDialog({
  listId,
  sourceId,
  onClose,
  onApplied,
}: {
  listId: string;
  sourceId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [preview, setPreview] =
    React.useState<GroceryListSourceRefreshPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    startTransition(async () => {
      const result = await previewGroceryListSourceRefresh({
        listId,
        sourceId,
      });
      if (result.status === "success") {
        setPreview(result.preview);
      } else {
        setError(result.message);
      }
    });
  }, [listId, sourceId]);

  function handleApply() {
    startTransition(async () => {
      const result = await applyGroceryListSourceRefresh({ listId, sourceId });
      if (result.status === "success") {
        onApplied();
        onClose();
      } else {
        setError(result.message ?? "Could not apply this refresh.");
      }
    });
  }

  const hasChanges =
    preview &&
    (preview.added.length > 0 ||
      preview.removed.length > 0 ||
      preview.changed.length > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refresh this source</DialogTitle>
          <DialogDescription>
            Preview what would change before updating this list to{" "}
            {preview?.targetVersionLabel ?? "the latest version"}.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        )}

        {preview && !hasChanges && (
          <p className="text-muted-foreground text-sm">
            Nothing to update — this source is already up to date.
          </p>
        )}

        {preview && hasChanges && (
          <div className="flex max-h-64 flex-col gap-3 overflow-y-auto text-sm">
            {preview.added.length > 0 && (
              <div>
                <p className="font-medium">Added</p>
                <ul className="text-muted-foreground">
                  {preview.added.map((a, i) => (
                    <li key={i}>
                      {a.name} {a.quantityText ? `— ${a.quantityText}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.removed.length > 0 && (
              <div>
                <p className="font-medium">Removed</p>
                <ul className="text-muted-foreground">
                  {preview.removed.map((r, i) => (
                    <li key={i}>{r.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.changed.length > 0 && (
              <div>
                <p className="font-medium">Changed</p>
                <ul className="text-muted-foreground">
                  {preview.changed.map((c, i) => (
                    <li key={i}>
                      {c.name}: {c.fromQuantityText} → {c.toQuantityText}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={isPending || !hasChanges}>
            {isPending ? "Applying…" : "Apply refresh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
