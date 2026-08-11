"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  renameGroceryList,
  completeGroceryList,
  reopenGroceryList,
  duplicateGroceryList,
  deleteGroceryList,
  previewGroceryListSourceRefresh,
  applyGroceryListSourceRefresh,
  acknowledgeGroceryItemSync,
} from "@/lib/grocery/list-actions";
import { resyncMealPlanGroceryLists } from "@/lib/mealplans/actions";
import Link from "next/link";
import type {
  GroceryListDetailDto,
  GroceryListItemDto,
  GroceryCategoryOptionDto,
} from "@/lib/grocery/list-schema";
import type { GroceryListSourceRefreshPreview } from "@/lib/grocery/list-service";

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
}: {
  list: GroceryListDetailDto;
  categoryOptions: GroceryCategoryOptionDto[];
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
  const [renaming, setRenaming] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [refreshSourceId, setRefreshSourceId] = React.useState<string | null>(
    null,
  );

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

  function handleMove(
    itemId: string,
    direction: -1 | 1,
    group: GroceryListItemDto[],
  ) {
    const index = group.findIndex((i) => i.id === itemId);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= group.length) return;
    const reorderedGroup = [...group];
    [reorderedGroup[index], reorderedGroup[targetIndex]] = [
      reorderedGroup[targetIndex],
      reorderedGroup[index],
    ];
    // Rebuild the full list order: every other item keeps its relative
    // order, this category's slice is replaced with the swapped order.
    const groupIds = new Set(group.map((i) => i.id));
    const fullOrder = [...list.items].sort((a, b) => a.position - b.position);
    let cursor = 0;
    const orderedItemIds = fullOrder.map((item) =>
      groupIds.has(item.id) ? reorderedGroup[cursor++].id : item.id,
    );
    runAction(() =>
      reorderGroceryListItems({ listId: list.id, orderedItemIds }),
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const title = String(formData.get("title") ?? "").trim();
                if (title) {
                  runAction(() =>
                    renameGroceryList({ listId: list.id, title }),
                  );
                }
                setRenaming(false);
              }}
            >
              <Input
                name="title"
                defaultValue={list.title}
                autoFocus
                className="h-9"
              />
              <Button type="submit" size="sm">
                Save
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-foreground text-2xl font-semibold">
                {list.title}
              </h1>
              {!isCompleted && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setRenaming(true)}
                  aria-label="Rename this list"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          )}
          <p className="text-muted-foreground mt-1 text-sm">
            {isCompleted ? "Completed" : "Active"} ·{" "}
            {new Date(list.createdAt).toLocaleDateString()}
            {list.mode === "MEAL_PLAN_LINKED" && list.linkedMealPlanId && (
              <>
                {" · "}
                <Link
                  href={`/meal-plans/${list.linkedMealPlanId}`}
                  className="underline"
                >
                  Linked to Meal Plan
                </Link>
              </>
            )}
          </p>
        </div>

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

      {list.sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.sources.map((source) => (
            <Badge key={source.id} variant="secondary" className="gap-1">
              {source.sourceDishTitleSnapshot}{" "}
              {source.sourceDishVersionLabelSnapshot}
              {source.isDeleted && " (deleted)"}
              {!isCompleted && !source.isDeleted && (
                <button
                  type="button"
                  className="ml-1 inline-flex items-center"
                  onClick={() => setRefreshSourceId(source.id)}
                  aria-label={`Refresh ${source.sourceDishTitleSnapshot}`}
                  title="Check for a newer version"
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      )}

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
        {groups.map((group) => (
          <div key={group.categoryId ?? "none"} className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {group.label}
            </h2>
            <ul className="flex flex-col gap-2">
              {group.items.map((item, index) => (
                <GroceryItemRow
                  key={item.id}
                  item={item}
                  checked={checkedIds.has(item.id)}
                  onToggle={() => handleToggle(item.id)}
                  disabled={isCompleted}
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
                  onMoveUp={
                    index > 0
                      ? () => handleMove(item.id, -1, group.items)
                      : undefined
                  }
                  onMoveDown={
                    index < group.items.length - 1
                      ? () => handleMove(item.id, 1, group.items)
                      : undefined
                  }
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
                      removeGroceryItem({ listId: list.id, itemId: item.id }),
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
          </div>
        ))}
        {list.items.length === 0 && (
          <p className="text-muted-foreground text-sm">
            This list has no items yet.
          </p>
        )}
      </div>

      {!isCompleted && (
        <ManualAddForm
          listId={list.id}
          categoryOptions={categoryOptions}
          onAdded={refresh}
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

function GroceryItemRow({
  item,
  checked,
  onToggle,
  disabled,
  categoryOptions,
  combineMode,
  combineSelected,
  onCombineToggle,
  onMoveUp,
  onMoveDown,
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
  onMoveUp?: () => void;
  onMoveDown?: () => void;
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
  const [editing, setEditing] = React.useState(false);
  const isCombined = item.contributions.length > 1;
  const soleContribution = !isCombined ? item.contributions[0] : undefined;
  // Only show a variant-selection action that can actually succeed (Slice 12
  // correction 2) — a single, not-yet-combined, not-manually-added line with
  // a saved substitute (§62.2).
  const canSelectVariant =
    !item.isManual && soleContribution?.hasSubstitute === true;
  const optionalityDisplay = aggregateOptionalityDisplay(item);

  return (
    <li className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-3">
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
          {editing ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                onEdit({
                  name: String(formData.get("name") ?? "").trim() || undefined,
                  quantityText:
                    String(formData.get("quantityText") ?? "").trim() || null,
                  unit: String(formData.get("unit") ?? "").trim() || null,
                });
                setEditing(false);
              }}
            >
              <Input
                name="name"
                defaultValue={item.name}
                className="h-8 flex-1"
              />
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
              <Button type="submit" size="sm">
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
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

        {!disabled && !editing && !combineMode && (
          <div className="flex shrink-0 items-center gap-0.5">
            {onMoveUp && (
              <TooltipIconButton
                label={`Move ${item.name} up`}
                icon={ChevronUp}
                onClick={onMoveUp}
              />
            )}
            {onMoveDown && (
              <TooltipIconButton
                label={`Move ${item.name} down`}
                icon={ChevronDown}
                onClick={onMoveDown}
              />
            )}
            <TooltipIconButton
              label={`Edit ${item.name}`}
              icon={Pencil}
              onClick={() => setEditing(true)}
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

      {!disabled && !combineMode && (
        <div className="flex flex-wrap items-center gap-2 pl-7">
          <Select
            value={item.category?.id ?? ""}
            onValueChange={onRecategorize}
          >
            <SelectTrigger className="h-7 w-40 text-xs">
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

          {isCombined && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((p) => !p)}
            >
              {expanded ? "Hide" : "Show"} sources ({item.contributions.length})
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
    </li>
  );
}

function ManualAddForm({
  listId,
  categoryOptions,
  onAdded,
}: {
  listId: string;
  categoryOptions: GroceryCategoryOptionDto[];
  onAdded: () => void;
}) {
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="border-border flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3"
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
            formRef.current?.reset();
            onAdded();
          } else {
            setError(result.message ?? "Could not add this item.");
          }
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="manual-item-name">Add an item</Label>
        <Input
          id="manual-item-name"
          name="name"
          placeholder="e.g. Paper towels"
          required
        />
      </div>
      <Input name="quantityText" placeholder="Qty" className="w-20" />
      <Input name="unit" placeholder="Unit" className="w-20" />
      <Select name="categoryId">
        <SelectTrigger className="h-9 w-36">
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
      <Button type="submit" disabled={isPending}>
        <Plus aria-hidden="true" /> Add
      </Button>
      {error && (
        <p role="alert" className="text-destructive-text w-full text-sm">
          {error}
        </p>
      )}
    </form>
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
