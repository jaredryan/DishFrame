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
import { AlertCircle, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DragHandle } from "@/components/ui/drag-handle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePendingAction } from "@/components/ui/use-pending-action";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import {
  createCuisine,
  deleteCuisine,
  renameCuisine,
  reorderCuisines,
} from "@/lib/cuisines/actions";
import {
  initialActionState,
  initialCreateCuisineActionState,
  type CuisineDto,
} from "@/lib/cuisines/schema";

/**
 * PRODUCT_SPEC.md §46: create/rename/reorder/delete only — same shape as
 * `FlavorProfileManager`, no archive state. A Recipe/Part may carry zero,
 * one, or several Cuisines (owner decision, 2026-09-02) — deleting a
 * Cuisine here just removes it from whatever Recipes/Parts used it.
 */
function SortableCuisineRow({
  cuisine,
  editingId,
  setEditingId,
  onRename,
  onDelete,
  isPending,
  isRenaming,
}: {
  cuisine: CuisineDto;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  isRenaming: boolean;
}) {
  const isEditing = editingId === cuisine.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cuisine.id, disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-2"
    >
      <DragHandle
        label={`Drag to reorder ${cuisine.displayName}`}
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
            onRename(cuisine.id, String(formData.get("name") ?? ""));
          }}
        >
          <Input
            name="name"
            aria-label={`Edit name for ${cuisine.displayName}`}
            defaultValue={cuisine.displayName}
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
          <span className="flex-1 text-sm">{cuisine.displayName}</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setEditingId(cuisine.id)}
              aria-label={`Rename ${cuisine.displayName}`}
              title={`Rename ${cuisine.displayName}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => onDelete(cuisine.id)}
              aria-label={`Delete ${cuisine.displayName}`}
              title={`Delete ${cuisine.displayName}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

export function CuisineManager({
  initialCuisines,
}: {
  initialCuisines: CuisineDto[];
}) {
  const [cuisines, setCuisines] = React.useState(initialCuisines);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const { pendingAction, isPending, run } = usePendingAction<
    "create" | "rename" | "delete" | "reorder"
  >();
  const createFormRef = React.useRef<HTMLFormElement>(null);
  const sensors = useReorderSensors();

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    setCreateError(null);
    setFeedback(null);
    run("create", async () => {
      const result = await createCuisine(
        initialCreateCuisineActionState,
        formData,
      );
      if (result.status === "success" && result.cuisine) {
        setCuisines((prev) => [...prev, result.cuisine!]);
        createFormRef.current?.reset();
        setFeedback({ kind: "success", message: result.message ?? "Added." });
      } else {
        setCreateError(result.message ?? "Could not add Cuisine.");
      }
    });
  }

  function handleRename(id: string, name: string) {
    const previous = cuisines;
    setCuisines((prev) =>
      prev.map((value) =>
        value.id === id ? { ...value, displayName: name } : value,
      ),
    );
    setEditingId(null);
    setFeedback(null);
    run("rename", async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("name", name);
      const result = await renameCuisine(initialActionState, formData);
      if (result.status === "success") {
        setFeedback({ kind: "success", message: result.message ?? "Renamed." });
      } else {
        setCuisines(previous);
        setFeedback({
          kind: "error",
          message: result.message ?? "Could not rename Cuisine.",
        });
      }
    });
  }

  function handleDelete(id: string) {
    const previous = cuisines;
    setCuisines((prev) => prev.filter((value) => value.id !== id));
    setFeedback(null);
    run("delete", async () => {
      const formData = new FormData();
      formData.set("id", id);
      const result = await deleteCuisine(initialActionState, formData);
      if (result.status === "success") {
        setFeedback({ kind: "success", message: result.message ?? "Deleted." });
      } else {
        setCuisines(previous);
        setFeedback({
          kind: "error",
          message: result.message ?? "Could not delete Cuisine.",
        });
      }
    });
  }

  function persistOrder(next: CuisineDto[]) {
    const previous = cuisines;
    setCuisines(next);
    setFeedback(null);
    run("reorder", async () => {
      const result = await reorderCuisines(next.map((value) => value.id));
      if (result.status !== "success") {
        setCuisines(previous);
        setFeedback({
          kind: "error",
          message:
            result.message ??
            "Could not save the new order. Restored the previous order.",
        });
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = cuisines.findIndex((v) => v.id === active.id);
    const newIndex = cuisines.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    persistOrder(arrayMove(cuisines, oldIndex, newIndex));
  }

  const cuisineLabel = React.useCallback(
    (id: string) => cuisines.find((v) => v.id === id)?.displayName ?? "Cuisine",
    [cuisines],
  );
  const cuisinePosition = React.useCallback(
    (id: string) => ({
      index: cuisines.findIndex((v) => v.id === id),
      total: cuisines.length,
    }),
    [cuisines],
  );
  const announcements = React.useMemo(
    () => createReorderAnnouncements(cuisineLabel, cuisinePosition),
    [cuisineLabel, cuisinePosition],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        Drag to reorder — this controls how Cuisines are listed when filtering
        or editing a Recipe or Part.
      </p>

      <DndContext
        id="cuisines"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements }}
      >
        <SortableContext
          items={cuisines.map((v) => v.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {cuisines.map((value) => (
              <SortableCuisineRow
                key={value.id}
                cuisine={value}
                editingId={editingId}
                setEditingId={setEditingId}
                onRename={handleRename}
                onDelete={handleDelete}
                isPending={isPending}
                isRenaming={pendingAction === "rename"}
              />
            ))}
            {cuisines.length === 0 && (
              <li className="text-muted-foreground text-sm">
                Nothing here yet.
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

      <form
        ref={createFormRef}
        onSubmit={handleCreate}
        className="flex items-end gap-2"
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="new-cuisine-name">Add a cuisine</Label>
          <Input
            id="new-cuisine-name"
            name="name"
            placeholder="e.g. Vietnamese"
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
        {!isPending && feedback?.kind === "success" && (
          <p
            role="status"
            className="border-brand-green/30 bg-brand-green/10 text-brand-green-text flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>{feedback.message}</span>
          </p>
        )}
        {!isPending && feedback?.kind === "error" && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive-text flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{feedback.message}</span>
          </p>
        )}
      </div>
    </div>
  );
}
