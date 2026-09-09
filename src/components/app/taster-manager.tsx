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
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DragHandle } from "@/components/ui/drag-handle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EntityRowActions,
  type EntityRowAction,
} from "@/components/ui/entity-row-actions";
import { useToast } from "@/components/ui/toast";
import { usePendingAction } from "@/components/ui/use-pending-action";
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
  isPending,
  isRenaming,
}: {
  taster: TasterDto;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onArchiveToggle: (taster: TasterDto) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  isRenaming: boolean;
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

  const actions: EntityRowAction[] = [
    {
      key: "rename",
      label: `Rename ${taster.name}`,
      icon: Pencil,
      onClick: () => setEditingId(taster.id),
      disabled: isPending,
    },
    taster.isOwner
      ? {
          key: "archive",
          label: `Archive ${taster.name} (unavailable)`,
          tooltip: "Archive",
          icon: Archive,
          onClick: () => {},
          disabled: true,
          disabledHint: OWNER_PROTECTED_EXPLANATION,
        }
      : {
          key: "archive",
          label: taster.archivedAt
            ? `Restore ${taster.name}`
            : `Archive ${taster.name}`,
          icon: taster.archivedAt ? ArchiveRestore : Archive,
          onClick: () => onArchiveToggle(taster),
          disabled: isPending,
        },
    taster.isOwner
      ? {
          key: "delete",
          label: `Delete ${taster.name} (unavailable)`,
          tooltip: "Delete",
          icon: Trash2,
          onClick: () => {},
          disabled: true,
          disabledHint: OWNER_PROTECTED_EXPLANATION,
          destructive: true,
        }
      : {
          key: "delete",
          label: `Delete ${taster.name}`,
          icon: Trash2,
          onClick: () => onDelete(taster.id),
          disabled: isPending,
          destructive: true,
        },
  ];

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="border-border bg-card @container flex items-center gap-2 rounded-lg border px-3 py-2"
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
          <span className="min-w-0 flex-1 text-sm">
            {taster.name}
            {taster.archivedAt && (
              <span className="text-muted-foreground ml-2 text-xs">
                Archived
              </span>
            )}
          </span>
          {taster.isOwner && <Badge variant="secondary">You</Badge>}
          <EntityRowActions actions={actions} />
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
  const { showToast } = useToast();
  const { pendingAction, isPending, run } = usePendingAction<
    "create" | "rename" | "archive" | "delete" | "reorder"
  >();
  const createFormRef = React.useRef<HTMLFormElement>(null);
  const sensors = useReorderSensors();

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    run("create", async () => {
      const result = await createTaster(
        initialCreateTasterActionState,
        formData,
      );
      if (result.status === "success" && result.taster) {
        setTasters((prev) => [...prev, result.taster!]);
        createFormRef.current?.reset();
        showToast({ title: result.message ?? "Added.", variant: "success" });
      } else {
        showToast({
          title: result.message ?? "Could not add taster.",
          variant: "error",
        });
      }
    });
  }

  function handleRename(id: string, name: string) {
    const previous = tasters;
    setTasters((prev) =>
      prev.map((taster) => (taster.id === id ? { ...taster, name } : taster)),
    );
    setEditingId(null);
    run("rename", async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("name", name);
      const result = await renameTaster(initialActionState, formData);
      if (result.status === "success") {
        showToast({ title: result.message ?? "Renamed.", variant: "success" });
      } else {
        setTasters(previous);
        showToast({
          title: result.message ?? "Could not rename taster.",
          variant: "error",
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
    run("archive", async () => {
      const formData = new FormData();
      formData.set("id", taster.id);
      const result = await (archiving ? archiveTaster : restoreTaster)(
        initialActionState,
        formData,
      );
      if (result.status === "success") {
        showToast({
          title: result.message ?? (archiving ? "Archived." : "Restored."),
          variant: "success",
        });
      } else {
        setTasters(previous);
        showToast({
          title:
            result.message ??
            (archiving
              ? "Could not archive taster."
              : "Could not restore taster."),
          variant: "error",
        });
      }
    });
  }

  function handleDelete(id: string) {
    const previous = tasters;
    setTasters((prev) => prev.filter((t) => t.id !== id));
    run("delete", async () => {
      const formData = new FormData();
      formData.set("id", id);
      const result = await deleteTaster(initialActionState, formData);
      if (result.status === "success") {
        showToast({ title: result.message ?? "Deleted.", variant: "success" });
      } else {
        setTasters(previous);
        showToast({
          title: result.message ?? "Could not delete taster.",
          variant: "error",
        });
      }
    });
  }

  function persistOrder(next: TasterDto[]) {
    const previous = tasters;
    setTasters(next);
    run("reorder", async () => {
      const result = await reorderTasters(next.map((taster) => taster.id));
      if (result.status !== "success") {
        setTasters(previous);
        showToast({
          title:
            result.message ??
            "Could not save the new order. Restored the previous order.",
          variant: "error",
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
        <Button type="submit" loading={pendingAction === "create"}>
          Add
        </Button>
      </form>
    </div>
  );
}
