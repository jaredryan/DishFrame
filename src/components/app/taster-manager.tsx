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
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DragHandle } from "@/components/ui/drag-handle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import {
  archiveTaster,
  createTaster,
  deleteTaster,
  renameTaster,
  reorderTasters,
  restoreTaster,
} from "@/lib/tasters/actions";
import {
  initialActionState,
  initialCreateTasterActionState,
  type TasterDto,
} from "@/lib/tasters/schema";

const OWNER_PROTECTED_EXPLANATION =
  "This is the built-in Taster for your own ratings, so it can't be archived or deleted.";

function SortableTasterRow({
  taster,
  editingId,
  setEditingId,
  onRename,
  onArchiveToggle,
  onDelete,
}: {
  taster: TasterDto;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onArchiveToggle: (taster: TasterDto) => void;
  onDelete: (id: string) => void;
}) {
  const isEditing = editingId === taster.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: taster.id, disabled: isEditing });

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
        label={`Drag to reorder ${taster.name}`}
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
            onRename(taster.id, String(formData.get("name") ?? ""));
          }}
        >
          <Input
            name="name"
            aria-label={`Edit name for ${taster.name}`}
            defaultValue={taster.name}
            maxLength={60}
            required
            autoFocus
            className="h-8"
          />
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(null)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 text-sm">
            {taster.name}
            {taster.archivedAt && (
              <span className="text-muted-foreground ml-2 text-xs">
                Archived
              </span>
            )}
          </span>
          {taster.isOwner && <Badge variant="secondary">You</Badge>}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingId(taster.id)}
              aria-label={`Rename ${taster.name}`}
              title={`Rename ${taster.name}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            {taster.isOwner ? (
              <DisabledActionHint explanation={OWNER_PROTECTED_EXPLANATION}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled
                  aria-label={`Archive ${taster.name} (unavailable)`}
                  title={OWNER_PROTECTED_EXPLANATION}
                >
                  <Archive className="size-4" aria-hidden="true" />
                </Button>
              </DisabledActionHint>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onArchiveToggle(taster)}
                aria-label={
                  taster.archivedAt
                    ? `Restore ${taster.name}`
                    : `Archive ${taster.name}`
                }
                title={
                  taster.archivedAt
                    ? `Restore ${taster.name}`
                    : `Archive ${taster.name}`
                }
              >
                {taster.archivedAt ? (
                  <ArchiveRestore className="size-4" aria-hidden="true" />
                ) : (
                  <Archive className="size-4" aria-hidden="true" />
                )}
              </Button>
            )}
            {taster.isOwner ? (
              <DisabledActionHint explanation={OWNER_PROTECTED_EXPLANATION}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled
                  aria-label={`Delete ${taster.name} (unavailable)`}
                  title={OWNER_PROTECTED_EXPLANATION}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </DisabledActionHint>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDelete(taster.id)}
                aria-label={`Delete ${taster.name}`}
                title={`Delete ${taster.name}`}
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

export function TasterManager({
  initialTasters,
}: {
  initialTasters: TasterDto[];
}) {
  const [tasters, setTasters] = React.useState(initialTasters);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const createFormRef = React.useRef<HTMLFormElement>(null);
  const sensors = useReorderSensors();

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    setCreateError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await createTaster(
        initialCreateTasterActionState,
        formData,
      );
      if (result.status === "success" && result.taster) {
        setTasters((prev) => [...prev, result.taster!]);
        createFormRef.current?.reset();
        setFeedback({ kind: "success", message: result.message ?? "Added." });
      } else {
        setCreateError(result.message ?? "Could not add taster.");
      }
    });
  }

  function handleRename(id: string, name: string) {
    const previous = tasters;
    setTasters((prev) =>
      prev.map((taster) => (taster.id === id ? { ...taster, name } : taster)),
    );
    setEditingId(null);
    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("name", name);
      const result = await renameTaster(initialActionState, formData);
      if (result.status === "success") {
        setFeedback({ kind: "success", message: result.message ?? "Renamed." });
      } else {
        setTasters(previous);
        setFeedback({
          kind: "error",
          message: result.message ?? "Could not rename taster.",
        });
      }
    });
  }

  function handleArchiveToggle(taster: TasterDto) {
    const archiving = !taster.archivedAt;
    const previous = tasters;
    setTasters((prev) =>
      prev.map((t) =>
        t.id === taster.id
          ? { ...t, archivedAt: archiving ? new Date() : null }
          : t,
      ),
    );
    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", taster.id);
      const result = await (archiving ? archiveTaster : restoreTaster)(
        initialActionState,
        formData,
      );
      if (result.status === "success") {
        setFeedback({
          kind: "success",
          message: result.message ?? (archiving ? "Archived." : "Restored."),
        });
      } else {
        setTasters(previous);
        setFeedback({
          kind: "error",
          message:
            result.message ??
            (archiving
              ? "Could not archive taster."
              : "Could not restore taster."),
        });
      }
    });
  }

  function handleDelete(id: string) {
    const previous = tasters;
    setTasters((prev) => prev.filter((t) => t.id !== id));
    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      const result = await deleteTaster(initialActionState, formData);
      if (result.status === "success") {
        setFeedback({ kind: "success", message: result.message ?? "Deleted." });
      } else {
        setTasters(previous);
        setFeedback({
          kind: "error",
          message: result.message ?? "Could not delete taster.",
        });
      }
    });
  }

  function persistOrder(next: TasterDto[]) {
    const previous = tasters;
    setTasters(next);
    setFeedback(null);
    startTransition(async () => {
      const result = await reorderTasters(next.map((taster) => taster.id));
      if (result.status !== "success") {
        setTasters(previous);
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

    const oldIndex = tasters.findIndex((t) => t.id === active.id);
    const newIndex = tasters.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    persistOrder(arrayMove(tasters, oldIndex, newIndex));
  }

  const tasterLabel = React.useCallback(
    (id: string) => tasters.find((t) => t.id === id)?.name ?? "taster",
    [tasters],
  );
  const tasterPosition = React.useCallback(
    (id: string) => ({
      index: tasters.findIndex((t) => t.id === id),
      total: tasters.length,
    }),
    [tasters],
  );
  const announcements = React.useMemo(
    () => createReorderAnnouncements(tasterLabel, tasterPosition),
    [tasterLabel, tasterPosition],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        Drag to reorder — this can match how you like ratings listed.
      </p>

      <DndContext
        id="tasters"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements }}
      >
        <SortableContext
          items={tasters.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {tasters.map((taster) => (
              <SortableTasterRow
                key={taster.id}
                taster={taster}
                editingId={editingId}
                setEditingId={setEditingId}
                onRename={handleRename}
                onArchiveToggle={handleArchiveToggle}
                onDelete={handleDelete}
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
          <Label htmlFor="new-taster-name">Add a taster</Label>
          <Input
            id="new-taster-name"
            name="name"
            placeholder="e.g. Mom"
            maxLength={60}
            required
            disabled={isPending}
          />
        </div>
        <Button type="submit" disabled={isPending}>
          Add
        </Button>
      </form>

      <div aria-live="polite" className="min-h-0">
        {createError && (
          <p role="alert" className="text-destructive text-sm">
            {createError}
          </p>
        )}
        {!isPending && feedback?.kind === "success" && (
          <p
            role="status"
            className="border-brand-green/30 bg-brand-green/10 text-brand-green flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>{feedback.message}</span>
          </p>
        )}
        {!isPending && feedback?.kind === "error" && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{feedback.message}</span>
          </p>
        )}
      </div>
    </div>
  );
}
