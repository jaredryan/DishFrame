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
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { DragHandle } from "@/components/ui/drag-handle";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useStepScrollReset } from "@/components/ui/use-step-scroll-reset";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePendingAction } from "@/components/ui/use-pending-action";
import { useToast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import { SelectableDishRow } from "@/components/domain/dish/selectable-dish-row";
import { RecipePartPicker } from "@/components/domain/dish/recipe-part-picker";
import { DishYieldScalingField } from "@/components/domain/grocery/dish-yield-scaling-field";
import { RichVersionPickerField } from "@/components/domain/dish/version-picker-field";
import { candidateToSelectionItem } from "@/components/domain/grocery/grocery-source-picker";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import { toIsoDateOnly, formatDateOnly } from "@/lib/date";
import {
  toggleGroceryItem,
  addManualGroceryItem,
  editGroceryItem,
  removeGroceryItem,
  recategorizeGroceryItem,
  reorderGroceryListItems,
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
import {
  resyncMealPlanGroceryLists,
  setMealPlanGroceryListEntryIncluded,
} from "@/lib/mealplans/actions";
import { previewMealPlanEntryInclusion } from "@/lib/grocery/meal-plan-inclusion-preview";
import Link from "next/link";
import type {
  GroceryListDetailDto,
  GroceryListItemDto,
  GroceryListSourceDto,
  GroceryCategoryOptionDto,
  GroceryListMealPlanEntryDto,
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

/**
 * Shared section-disclosure header (Meals/Groceries) — the whole left side
 * (section name plus chevron, and the available left-side header space) is
 * one toggle target, not just the chevron icon, with a 44px-class hit area
 * on coarse pointers. Right-side section actions are a sibling, never part
 * of this button, so they keep their own independent click targets.
 */
function DisclosureHeader({
  title,
  collapsed,
  onToggle,
  actions,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
        className="hover:bg-muted/50 -ml-1.5 flex min-w-0 flex-1 items-center gap-1 rounded-md py-1 pr-2 pl-1.5 text-left pointer-coarse:min-h-11"
      >
        <h2 className="font-heading truncate text-lg font-medium">{title}</h2>
        {collapsed ? (
          <ChevronDown
            className="text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        ) : (
          <ChevronUp
            className="text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        )}
      </button>
      {actions}
    </div>
  );
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
  const { pendingAction, isPending, run } = usePendingAction<
    "other" | "remove-source" | "delete-list" | "sync"
  >();
  const { showToast } = useToast();
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
  // Local optimistic override for a Meal Plan entry's inclusion checkbox
  // (§81.7) — cleared for an entry once the server's own `list` prop
  // reflects it (a successful mutation's `router.refresh()`), restored to
  // its prior value on a failed mutation (rollback).
  const [entryOverrides, setEntryOverrides] = React.useState<
    Map<string, boolean>
  >(new Map());
  if (prevItems !== list.items) {
    setPrevItems(list.items);
    setCheckedIds(
      new Set(list.items.filter((i) => i.checkedAt).map((i) => i.id)),
    );
    setEntryOverrides(new Map());
  }

  const isCompleted = list.completedAt != null;
  const isMealPlanLinked =
    list.mode === "MEAL_PLAN_LINKED" && list.linkedMealPlanId != null;
  const displayMealPlanEntries = React.useMemo(
    () =>
      list.mealPlanEntries.map((entry) => ({
        ...entry,
        included: entryOverrides.get(entry.id) ?? entry.included,
      })),
    [list.mealPlanEntries, entryOverrides],
  );
  const displayItems = React.useMemo(
    () => previewMealPlanEntryInclusion(list.items, entryOverrides),
    [list.items, entryOverrides],
  );
  const groups = groupByCategory(displayItems);

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
    run("other", async () => {
      const result = await toggleGroceryItem({ listId: list.id, itemId });
      if (result.status !== "success") {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          if (next.has(itemId)) next.delete(itemId);
          else next.add(itemId);
          return next;
        });
        showToast({
          variant: "error",
          title: result.message ?? "Could not update this item.",
        });
      }
    });
  }

  /**
   * §81.7 optimistic UI — the checkbox and every affected item's displayed
   * quantity update immediately (`entryOverrides`, recomputed through
   * `previewMealPlanEntryInclusion`); the real toggle persists in the
   * background, and a failure rolls the override back to its prior value
   * and shows the shared error toast rather than leaving the optimistic
   * state as a false success.
   */
  function handleMealPlanEntryToggle(entryId: string, included: boolean) {
    if (!list.linkedMealPlanId) return;
    const mealPlanId = list.linkedMealPlanId;
    const previous = entryOverrides.get(entryId);
    setEntryOverrides((prev) => new Map(prev).set(entryId, included));
    run("other", async () => {
      const result = await setMealPlanGroceryListEntryIncluded({
        mealPlanId,
        listId: list.id,
        entryId,
        included,
      });
      if (result.status === "success") {
        refresh();
      } else {
        setEntryOverrides((prev) => {
          const next = new Map(prev);
          if (previous === undefined) next.delete(entryId);
          else next.set(entryId, previous);
          return next;
        });
        showToast({
          variant: "error",
          title: result.message ?? "Could not update this meal's inclusion.",
        });
      }
    });
  }

  function runAction(
    action: () => Promise<{ status: string; message?: string }>,
  ) {
    run("other", async () => {
      const result = await action();
      if (result.status !== "success") {
        showToast({
          variant: "error",
          title: result.message ?? "Something went wrong.",
        });
      } else {
        refresh();
      }
    });
  }

  /**
   * §81.2 Sync now UX correction: the old version gave little or no
   * feedback about whether anything actually changed. This distinguishes
   * three outcomes with the shared toast system — changes applied (success,
   * naming what changed), already up to date (neutral, not styled as a
   * false "success"), and failure (error, list stays usable, retry by
   * clicking again).
   */
  function handleSyncNow() {
    if (!list.linkedMealPlanId) return;
    const mealPlanId = list.linkedMealPlanId;
    run("sync", async () => {
      const result = await resyncMealPlanGroceryLists({
        mealPlanId,
        listId: list.id,
      });
      if (result.status !== "success") {
        showToast({
          variant: "error",
          title: result.message ?? "Couldn't sync with the Meal Plan.",
        });
        return;
      }
      const summary = result.summary;
      const hasChanges =
        summary != null &&
        (summary.added > 0 || summary.removed > 0 || summary.changed > 0);
      if (!hasChanges) {
        showToast({
          variant: "default",
          title: "Already up to date",
          description: "No changes from the Meal Plan since the last sync.",
        });
        return;
      }
      const parts: string[] = [];
      if (summary.added > 0) parts.push(`${summary.added} added`);
      if (summary.changed > 0) parts.push(`${summary.changed} updated`);
      if (summary.removed > 0) parts.push(`${summary.removed} removed`);
      showToast({
        variant: "success",
        title: "Grocery list synced",
        description: `${parts.join(", ")} from the Meal Plan.`,
      });
      refresh();
    });
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
                className="text-primary flex items-center text-sm font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
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
                  Mark complete
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() =>
                  run("other", async () => {
                    const result = await duplicateGroceryList({
                      listId: list.id,
                    });
                    if (result.status === "success") {
                      router.push(`/grocery-lists/${result.listId}`);
                    } else {
                      showToast({ variant: "error", title: result.message });
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

      <section className="flex flex-col gap-2">
        <DisclosureHeader
          title="Meals"
          collapsed={mealsCollapsed}
          onToggle={() => setMealsCollapsed((v) => !v)}
          actions={
            !isCompleted &&
            (isMealPlanLinked ? (
              <Button type="button" size="sm" asChild>
                <Link href={`/meal-plans/${list.linkedMealPlanId}/edit`}>
                  <Pencil aria-hidden="true" /> Update meal plan
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                onClick={() => setAddMealOpen(true)}
              >
                <Plus aria-hidden="true" /> Add meal
              </Button>
            ))
          }
        />
        {!mealsCollapsed &&
          (isMealPlanLinked ? (
            <div className="flex flex-col gap-2">
              {displayMealPlanEntries.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  This Meal Plan has no entries yet.
                </p>
              ) : (
                displayMealPlanEntries.map((entry) => (
                  <MealPlanEntryRow
                    key={entry.id}
                    entry={entry}
                    disabled={isCompleted || isPending}
                    onToggle={(included) =>
                      handleMealPlanEntryToggle(entry.id, included)
                    }
                  />
                ))
              )}
            </div>
          ) : (
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
          ))}
      </section>

      <section className="flex flex-col gap-2">
        <DisclosureHeader
          title="Groceries"
          collapsed={groceriesCollapsed}
          onToggle={() => setGroceriesCollapsed((v) => !v)}
          actions={
            !isCompleted && (
              <div className="flex shrink-0 items-center gap-2">
                {isMealPlanLinked && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    loading={pendingAction === "sync"}
                    onClick={handleSyncNow}
                  >
                    <RefreshCw aria-hidden="true" /> Sync now
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAddItemOpen(true)}
                >
                  <Plus aria-hidden="true" /> Add item
                </Button>
              </div>
            )
          }
        />

        {!groceriesCollapsed && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-5">
              {groups.map((group) => {
                const dragDisabledBase = isCompleted;
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

      <ConfirmDialog
        open={deletingSourceId != null}
        onOpenChangeAction={(open) => !open && setDeletingSourceId(null)}
        title="Remove this meal?"
        description="This removes its ingredients from the Groceries list below. This can't be undone."
        confirmLabel="Remove"
        destructive
        loading={pendingAction === "remove-source"}
        onConfirmAction={() => {
          if (!deletingSourceId) return;
          const sourceId = deletingSourceId;
          setDeletingSourceId(null);
          run("remove-source", async () => {
            const result = await removeGroceryListSource({
              listId: list.id,
              sourceId,
            });
            if (result.status !== "success") {
              showToast({
                variant: "error",
                title: result.message ?? "Something went wrong.",
              });
            } else {
              refresh();
            }
          });
        }}
      />

      {editOpen && (
        <EditGroceryListDialog
          list={list}
          onClose={() => setEditOpen(false)}
          onSaved={refresh}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChangeAction={setDeleteOpen}
        title="Delete this grocery list?"
        description="This permanently deletes the list and every item on it. This can't be undone."
        confirmLabel="Delete"
        destructive
        loading={pendingAction === "delete-list"}
        onConfirmAction={() =>
          run("delete-list", async () => {
            const result = await deleteGroceryList({ listId: list.id });
            if (result.status === "success") {
              router.push("/grocery-lists");
            } else {
              showToast({
                variant: "error",
                title: result.message ?? "Could not delete this list.",
              });
              setDeleteOpen(false);
            }
          })
        }
      />

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
  const canEdit = !isCompleted && !source.isDeleted;
  return (
    <div
      onClick={() => canEdit && onEdit()}
      className={cn(
        "border-border bg-card flex items-center justify-between gap-2 rounded-lg border p-3",
        canEdit && "hover:bg-muted/50 cursor-pointer",
      )}
    >
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
        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {!source.isDeleted && (
            <TooltipIconButton
              label={`Edit ${source.sourceDishTitleSnapshot}`}
              icon={Pencil}
              onClick={onEdit}
            />
          )}
          {!source.isDeleted && (
            <TooltipIconButton
              label={`Sync ${source.sourceDishTitleSnapshot}`}
              icon={RefreshCw}
              onClick={onSync}
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

/**
 * §81.7 — one Meal Plan entry as a whole-row checkbox, toggling whether it
 * contributes to *this* Grocery List (the Meal Plan itself is untouched by
 * this control — adding/removing actual entries happens on the linked Meal
 * Plan's own Edit page via "Update meal plan" above).
 */
function MealPlanEntryRow({
  entry,
  disabled,
  onToggle,
}: {
  entry: GroceryListMealPlanEntryDto;
  disabled: boolean;
  onToggle: (included: boolean) => void;
}) {
  const yieldText =
    entry.targetYieldQuantity != null
      ? [entry.targetYieldQuantity, entry.targetYieldUnit]
          .filter(Boolean)
          .join(" ")
      : null;

  return (
    <div
      onClick={() => !disabled && onToggle(!entry.included)}
      // A completed list keeps this card's normal content styling (§12 —
      // matching the completed standalone list's own read-only pattern):
      // only the checkbox itself is disabled, never the whole card washed
      // out. `disabled` still blocks the row's own click-to-toggle above.
      className={cn(
        "border-border bg-card flex items-center gap-2 rounded-lg border p-3",
        !disabled && "hover:bg-muted/50 cursor-pointer",
      )}
    >
      <Checkbox
        checked={entry.included}
        onCheckedChange={() => onToggle(!entry.included)}
        // The row itself also toggles on click (below) — stopping
        // propagation here keeps a direct checkbox click from ALSO
        // reaching the row's handler and double-toggling (matches
        // `SelectableDishRow`'s checkbox variant).
        onClick={(event) => event.stopPropagation()}
        disabled={disabled}
        aria-label={`Include ${entry.title} in this grocery list`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {entry.title}{" "}
          <span className="text-muted-foreground font-normal">
            {entry.versionLabel}
          </span>
        </p>
        {yieldText && (
          <p className="text-muted-foreground text-xs">{yieldText}</p>
        )}
      </div>
    </div>
  );
}

/** Detail page's "Add meal" — the shared `RecipePartPicker` (same rich
 * search/tabs/row treatment as Cook/Send/Publish/Add-Edit-Meal), single-
 * select. Selecting a Recipe/Part transitions directly into a separate
 * Version-selection screen (single-select, so the item click is already
 * the step transition — no redundant Next click), matching Attach-a-Part;
 * the current Version is preselected but a historical one may be chosen
 * deliberately, then target-servings scaling as `GrocerySourcePickerPanel`
 * uses when creating a list from scratch. */
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
  const [selectedDishId, setSelectedDishId] = React.useState<string | null>(
    null,
  );
  const [versions, setVersions] = React.useState<
    DishVersionYieldOption[] | null
  >(null);
  const [versionLoadError, setVersionLoadError] = React.useState<string | null>(
    null,
  );
  const [selectedVersionId, setSelectedVersionId] = React.useState<
    string | null
  >(null);
  const [scale, setScale] = React.useState<number | null>(1);
  const [isPending, startTransition] = React.useTransition();
  const scrollRef = useStepScrollReset(selectedDishId != null);
  const { showToast } = useToast();

  const selected = candidates.find((c) => c.dishId === selectedDishId) ?? null;
  const selectedSet = React.useMemo(
    () => new Set(selectedDishId ? [selectedDishId] : []),
    [selectedDishId],
  );
  const pickerItems = React.useMemo(
    () => candidates.map(candidateToSelectionItem),
    [candidates],
  );
  const selectedVersion = versions?.find((v) => v.id === selectedVersionId);

  // Fetches this Recipe/Part's Version list (each with its own yield) the
  // moment it's selected, defaulting to the Version the candidate list was
  // already showing — same convention as `GrocerySourcePickerPanel`.
  React.useEffect(() => {
    if (!selectedDishId) return;
    let cancelled = false;
    listGrocerySourceVersionOptions({ dishId: selectedDishId }).then(
      (result) => {
        if (cancelled) return;
        if (result.status !== "success") {
          setVersionLoadError(result.message);
          return;
        }
        setVersions(result.versions);
        const candidate = candidates.find((c) => c.dishId === selectedDishId);
        const current = result.versions.find(
          (v) =>
            `V${v.majorVersion}.${v.minorVersion}` === candidate?.versionLabel,
        );
        const chosen = current ?? result.versions[result.versions.length - 1];
        if (chosen) setSelectedVersionId(chosen.id);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedDishId, candidates]);

  function selectDish(dishId: string | null) {
    setSelectedDishId(dishId);
    setVersions(null);
    setVersionLoadError(null);
    setSelectedVersionId(null);
    setScale(1);
  }

  function handleAdd() {
    if (!selectedDishId || !selectedVersionId) return;
    startTransition(async () => {
      const result = await addGroceryListSource({
        listId,
        dishId: selectedDishId,
        dishVersionId: selectedVersionId,
        scaleFactor: scale ?? 1,
      });
      if (result.status === "success") {
        onAdded();
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not add this meal.",
        });
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={scrollRef}
        className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Add meal</DialogTitle>
          <DialogDescription>
            {selected
              ? "Choose a Version and amount to add."
              : "Select a Recipe or Part to add to this list."}
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="-mb-4 flex flex-col gap-4">
            <SelectableDishRow
              item={candidateToSelectionItem(selected)}
              selectionControl="remove"
              onRemove={() => selectDish(null)}
            />
            {versionLoadError ? (
              <p className="text-destructive-text text-sm">
                {versionLoadError}
              </p>
            ) : versions ? (
              <RichVersionPickerField
                id={`add-meal-version-${selected.dishId}`}
                versions={versions}
                value={selectedVersionId ?? undefined}
                onChangeAction={setSelectedVersionId}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Loading versions…</p>
            )}
            <DishYieldScalingField
              id={selected.dishId}
              kindLabel={selected.kind === "PART" ? "Part" : "Recipe"}
              yieldQuantity={
                selectedVersion?.yieldQuantity ?? selected.yieldQuantity
              }
              yieldUnit={selectedVersion?.yieldUnit ?? selected.yieldUnit}
              onScaleChange={setScale}
            />
          </div>
        ) : (
          <RecipePartPicker
            items={pickerItems}
            itemsError={null}
            search={search}
            onSearchChange={setSearch}
            showKindTabs
            selectionMode="single"
            selected={selectedSet}
            onToggle={(id) => selectDish(id)}
            className="-mb-4 flex-1"
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!selectedDishId || !selectedVersionId}
            loading={isPending}
          >
            Add meal
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
  const [isPending, startTransition] = React.useTransition();
  const { showToast } = useToast();

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
        showToast({
          variant: "error",
          title: result.message ?? "Could not save this meal.",
        });
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedVersionId}
            loading={isPending}
          >
            Save changes
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
 * sensor), and for every row while the list is completed.
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
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          disabled={disabled}
          aria-label={`Mark ${item.name} ${checked ? "not bought" : "bought"}`}
        />

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
                    aria-label="Category"
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

        {!disabled && !isEditing && (
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

      {!disabled && !isEditing && (isCombined || canSelectVariant) && (
        <div className="flex flex-wrap items-center gap-2 pl-7">
          {isCombined && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded((p) => !p)}
            >
              {expanded ? "Hide" : "Show"} sources ({item.contributions.length})
            </Button>
          )}
          {isCombined && (
            <Button variant="outline" size="sm" onClick={onUncombine}>
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
              {[
                c.sourceTitle,
                [c.quantityText, c.unit, c.originalName]
                  .filter(Boolean)
                  .join(" "),
              ]
                .filter(Boolean)
                .join(" · ")}
              {c.isOptional && " · optional"}
              {c.selectedVariant === "SUBSTITUTE" && " · substitute"}
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
  const { showToast } = useToast();

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
                showToast({
                  variant: "error",
                  title: result.message ?? "Could not add this item.",
                });
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
              <SelectTrigger
                id="manual-item-category"
                className="w-full"
                aria-label="Category"
              >
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
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-grocery-item-form"
            loading={isPending}
          >
            Add
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
  const [isPending, startTransition] = React.useTransition();
  const { showToast } = useToast();

  function handleSave() {
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
        showToast({
          variant: "error",
          title: result.message ?? "Could not save these changes.",
        });
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
              aria-label="Active"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={isPending}>
            Save
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
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const { showToast } = useToast();

  React.useEffect(() => {
    startTransition(async () => {
      const result = await previewGroceryListSourceRefresh({
        listId,
        sourceId,
      });
      if (result.status === "success") {
        setPreview(result.preview);
      } else {
        setLoadError(result.message);
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
        showToast({
          variant: "error",
          title: result.message ?? "Could not apply this refresh.",
        });
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

        {loadError && (
          <p role="alert" className="text-destructive-text text-sm">
            {loadError}
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
          <Button
            onClick={handleApply}
            disabled={!hasChanges}
            loading={isPending}
          >
            Apply refresh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
