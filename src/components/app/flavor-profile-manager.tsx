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
  createFlavorProfile,
  deleteFlavorProfile,
  renameFlavorProfile,
  reorderFlavorProfiles,
} from "@/lib/flavor-profiles/actions";
import {
  initialActionState,
  initialCreateFlavorProfileActionState,
  type FlavorProfileDto,
} from "@/lib/flavor-profiles/schema";

/**
 * PRODUCT_SPEC.md §79.3: create/rename/reorder/delete only — unlike
 * `TasterManager`, there is no archive state to manage.
 */
function SortableFlavorProfileRow({
  flavorProfile,
  editingId,
  setEditingId,
  onRename,
  onDelete,
  isPending,
  isRenaming,
}: {
  flavorProfile: FlavorProfileDto;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  isRenaming: boolean;
}) {
  const isEditing = editingId === flavorProfile.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: flavorProfile.id, disabled: isEditing });

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
        label={`Drag to reorder ${flavorProfile.displayName}`}
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
            onRename(flavorProfile.id, String(formData.get("name") ?? ""));
          }}
        >
          <Input
            name="name"
            aria-label={`Edit name for ${flavorProfile.displayName}`}
            defaultValue={flavorProfile.displayName}
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
          <span className="flex-1 text-sm">{flavorProfile.displayName}</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setEditingId(flavorProfile.id)}
              aria-label={`Rename ${flavorProfile.displayName}`}
              title={`Rename ${flavorProfile.displayName}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => onDelete(flavorProfile.id)}
              aria-label={`Delete ${flavorProfile.displayName}`}
              title={`Delete ${flavorProfile.displayName}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

export function FlavorProfileManager({
  initialFlavorProfiles,
}: {
  initialFlavorProfiles: FlavorProfileDto[];
}) {
  const [flavorProfiles, setFlavorProfiles] = React.useState(
    initialFlavorProfiles,
  );
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
      const result = await createFlavorProfile(
        initialCreateFlavorProfileActionState,
        formData,
      );
      if (result.status === "success" && result.flavorProfile) {
        setFlavorProfiles((prev) => [...prev, result.flavorProfile!]);
        createFormRef.current?.reset();
        setFeedback({ kind: "success", message: result.message ?? "Added." });
      } else {
        setCreateError(result.message ?? "Could not add Flavor profile.");
      }
    });
  }

  function handleRename(id: string, name: string) {
    const previous = flavorProfiles;
    setFlavorProfiles((prev) =>
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
      const result = await renameFlavorProfile(initialActionState, formData);
      if (result.status === "success") {
        setFeedback({ kind: "success", message: result.message ?? "Renamed." });
      } else {
        setFlavorProfiles(previous);
        setFeedback({
          kind: "error",
          message: result.message ?? "Could not rename Flavor profile.",
        });
      }
    });
  }

  function handleDelete(id: string) {
    const previous = flavorProfiles;
    setFlavorProfiles((prev) => prev.filter((value) => value.id !== id));
    setFeedback(null);
    run("delete", async () => {
      const formData = new FormData();
      formData.set("id", id);
      const result = await deleteFlavorProfile(initialActionState, formData);
      if (result.status === "success") {
        setFeedback({ kind: "success", message: result.message ?? "Deleted." });
      } else {
        setFlavorProfiles(previous);
        setFeedback({
          kind: "error",
          message: result.message ?? "Could not delete Flavor profile.",
        });
      }
    });
  }

  function persistOrder(next: FlavorProfileDto[]) {
    const previous = flavorProfiles;
    setFlavorProfiles(next);
    setFeedback(null);
    run("reorder", async () => {
      const result = await reorderFlavorProfiles(next.map((value) => value.id));
      if (result.status !== "success") {
        setFlavorProfiles(previous);
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

    const oldIndex = flavorProfiles.findIndex((v) => v.id === active.id);
    const newIndex = flavorProfiles.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    persistOrder(arrayMove(flavorProfiles, oldIndex, newIndex));
  }

  const flavorProfileLabel = React.useCallback(
    (id: string) =>
      flavorProfiles.find((v) => v.id === id)?.displayName ?? "value",
    [flavorProfiles],
  );
  const flavorProfilePosition = React.useCallback(
    (id: string) => ({
      index: flavorProfiles.findIndex((v) => v.id === id),
      total: flavorProfiles.length,
    }),
    [flavorProfiles],
  );
  const announcements = React.useMemo(
    () => createReorderAnnouncements(flavorProfileLabel, flavorProfilePosition),
    [flavorProfileLabel, flavorProfilePosition],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        Drag to reorder — this controls how flavor profiles are listed when
        filtering or editing a Recipe or Part.
      </p>

      <DndContext
        id="flavor-profiles"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements }}
      >
        <SortableContext
          items={flavorProfiles.map((v) => v.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {flavorProfiles.map((value) => (
              <SortableFlavorProfileRow
                key={value.id}
                flavorProfile={value}
                editingId={editingId}
                setEditingId={setEditingId}
                onRename={handleRename}
                onDelete={handleDelete}
                isPending={isPending}
                isRenaming={pendingAction === "rename"}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <form
        ref={createFormRef}
        onSubmit={handleCreate}
        className="flex items-end gap-2"
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="new-flavor-profile-name">Add a flavor profile</Label>
          <Input
            id="new-flavor-profile-name"
            name="name"
            placeholder="e.g. Herby"
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
