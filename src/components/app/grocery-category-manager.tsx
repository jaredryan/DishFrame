"use client";

import * as React from "react";
import type { FormEvent } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DragHandle } from "@/components/ui/drag-handle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import { usePendingAction } from "@/components/ui/use-pending-action";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import {
  createGroceryCategory,
  deleteGroceryCategory,
  renameGroceryCategory,
  reorderGroceryCategories,
} from "@/lib/grocery/actions";
import {
  initialActionState,
  initialCreateCategoryActionState,
  type CategoryDto,
} from "@/lib/grocery/schema";

const FALLBACK_EXPLANATION =
  "Items that cannot be categorized automatically are placed here, so this category cannot be deleted.";

function SortableCategoryRow({
  category,
  index,
  total,
  editingId,
  setEditingId,
  onRename,
  onDelete,
  isPending,
  isRenaming,
}: {
  category: CategoryDto;
  index: number;
  total: number;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (category: CategoryDto) => void;
  isPending: boolean;
  isRenaming: boolean;
}) {
  const isEditing = editingId === category.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-2"
      // Announces order for screen-reader users navigating the list
      // directly, independent of the drag-announcement live region.
      aria-label={`${category.displayName}, position ${index + 1} of ${total}`}
    >
      <DragHandle
        label={`Drag to reorder ${category.displayName}`}
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
      />

      {isEditing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            onRename(category.id, String(formData.get("name") ?? ""));
          }}
        >
          <Input
            name="name"
            aria-label={`Edit name for ${category.displayName}`}
            defaultValue={category.displayName}
            maxLength={60}
            required
            autoFocus
            className="h-8"
          />
          <Button type="submit" size="sm" loading={isRenaming}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => setEditingId(null)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 text-sm">{category.displayName}</span>
          {category.isFallback && <Badge variant="secondary">Fallback</Badge>}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              onClick={() => setEditingId(category.id)}
              aria-label={`Rename ${category.displayName}`}
              title={`Rename ${category.displayName}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            {category.isFallback ? (
              <DisabledActionHint explanation={FALLBACK_EXPLANATION}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled
                  aria-label={`Delete ${category.displayName} (unavailable)`}
                  title={FALLBACK_EXPLANATION}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </DisabledActionHint>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                onClick={() => onDelete(category)}
                aria-label={`Delete ${category.displayName}`}
                title={`Delete ${category.displayName}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function GroceryCategoryManager({
  initialCategories,
}: {
  initialCategories: CategoryDto[];
}) {
  const [categories, setCategories] =
    React.useState<CategoryDto[]>(initialCategories);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const { pendingAction, isPending, run } = usePendingAction<
    "create" | "rename" | "delete" | "reorder"
  >();
  const formRef = React.useRef<HTMLFormElement>(null);
  const sensors = useReorderSensors();

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    setCreateError(null);
    run("create", async () => {
      const result = await createGroceryCategory(
        initialCreateCategoryActionState,
        formData,
      );
      if (result.status === "success" && result.category) {
        setCategories((prev) => [...prev, result.category!]);
        formRef.current?.reset();
      } else {
        setCreateError(result.message ?? "Could not add category.");
      }
    });
  }

  function handleRename(id: string, name: string) {
    const previous = categories;
    setCategories((prev) =>
      prev.map((category) =>
        category.id === id ? { ...category, displayName: name } : category,
      ),
    );
    setEditingId(null);
    setRenameError(null);
    run("rename", async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("name", name);
      const result = await renameGroceryCategory(initialActionState, formData);
      if (result.status !== "success") {
        setCategories(previous);
        setRenameError(result.message ?? "Could not rename category.");
      }
    });
  }

  function handleDelete(category: CategoryDto) {
    const previous = categories;
    setDeleteError(null);
    setCategories((prev) => prev.filter((c) => c.id !== category.id));
    run("delete", async () => {
      const formData = new FormData();
      formData.set("id", category.id);
      const result = await deleteGroceryCategory(initialActionState, formData);
      if (result.status !== "success") {
        setCategories(previous);
        setDeleteError(result.message ?? "Could not delete category.");
      }
    });
  }

  function persistOrder(next: CategoryDto[]) {
    const previous = categories;
    setCategories(next);
    run("reorder", async () => {
      const result = await reorderGroceryCategories(
        next.map((category) => category.id),
      );
      if (result.status !== "success") {
        setCategories(previous);
        setDeleteError(
          result.message ??
            "Could not save the new order. Restored the previous order.",
        );
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    persistOrder(arrayMove(categories, oldIndex, newIndex));
  }

  const categoryLabel = React.useCallback(
    (id: string) =>
      categories.find((c) => c.id === id)?.displayName ?? "category",
    [categories],
  );
  const categoryPosition = React.useCallback(
    (id: string) => ({
      index: categories.findIndex((c) => c.id === id),
      total: categories.length,
    }),
    [categories],
  );
  const announcements = React.useMemo(
    () => createReorderAnnouncements(categoryLabel, categoryPosition),
    [categoryLabel, categoryPosition],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        Drag to reorder — this can match your preferred store-walking order.
      </p>

      <DndContext
        id="grocery-categories"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements }}
      >
        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {categories.map((category, index) => (
              <SortableCategoryRow
                key={category.id}
                category={category}
                index={index}
                total={categories.length}
                editingId={editingId}
                setEditingId={setEditingId}
                onRename={handleRename}
                onDelete={handleDelete}
                isPending={isPending}
                isRenaming={pendingAction === "rename"}
              />
            ))}
            {categories.length === 0 && (
              <li className="text-muted-foreground text-sm">
                Nothing here yet.
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

      <form
        ref={formRef}
        onSubmit={handleCreate}
        className="flex items-end gap-2"
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="new-category-name">Add a category</Label>
          <Input
            id="new-category-name"
            name="name"
            placeholder="e.g. Spices"
            maxLength={60}
            required
            disabled={isPending}
          />
        </div>
        <Button type="submit" loading={pendingAction === "create"}>
          Add
        </Button>
      </form>

      <div aria-live="polite" className="min-h-0 empty:hidden">
        {createError && (
          <p role="alert" className="text-destructive-text text-sm">
            {createError}
          </p>
        )}
        {renameError && (
          <p role="alert" className="text-destructive-text text-sm">
            {renameError}
          </p>
        )}
        {deleteError && (
          <p role="alert" className="text-destructive-text text-sm">
            {deleteError}
          </p>
        )}
      </div>
    </div>
  );
}
