"use client";

import * as React from "react";
import type { FormEvent } from "react";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archiveTaster,
  createTaster,
  deleteTaster,
  renameTaster,
  restoreTaster,
} from "@/lib/tasters/actions";
import { initialActionState } from "@/lib/tasters/schema";

type Taster = {
  id: string;
  name: string;
  isOwner: boolean;
  archivedAt: Date | null;
};

export function TasterManager({
  initialTasters,
}: {
  initialTasters: Taster[];
}) {
  const [tasters, setTasters] = React.useState(initialTasters);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const createFormRef = React.useRef<HTMLFormElement>(null);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    setCreateError(null);
    startTransition(async () => {
      const result = await createTaster(initialActionState, formData);
      if (result.status === "success") {
        setTasters((prev) => [
          ...prev,
          { id: crypto.randomUUID(), name, isOwner: false, archivedAt: null },
        ]);
        createFormRef.current?.reset();
      } else {
        setCreateError(result.message ?? "Could not add taster.");
      }
    });
  }

  function handleRename(id: string, name: string) {
    setTasters((prev) =>
      prev.map((taster) => (taster.id === id ? { ...taster, name } : taster)),
    );
    setEditingId(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("name", name);
      await renameTaster(initialActionState, formData);
    });
  }

  function handleArchiveToggle(taster: Taster) {
    const archiving = !taster.archivedAt;
    setTasters((prev) =>
      prev.map((t) =>
        t.id === taster.id
          ? { ...t, archivedAt: archiving ? new Date() : null }
          : t,
      ),
    );
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", taster.id);
      await (archiving ? archiveTaster : restoreTaster)(
        initialActionState,
        formData,
      );
    });
  }

  function handleDelete(id: string) {
    setTasters((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      await deleteTaster(initialActionState, formData);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {tasters.map((taster) => (
          <li
            key={taster.id}
            className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-2"
          >
            {editingId === taster.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  handleRename(taster.id, String(formData.get("name") ?? ""));
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
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  {!taster.isOwner && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchiveToggle(taster)}
                        aria-label={
                          taster.archivedAt
                            ? `Restore ${taster.name}`
                            : `Archive ${taster.name}`
                        }
                      >
                        {taster.archivedAt ? (
                          <ArchiveRestore
                            className="size-4"
                            aria-hidden="true"
                          />
                        ) : (
                          <Archive className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(taster.id)}
                        aria-label={`Delete ${taster.name}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

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

      {createError && (
        <p role="alert" className="text-destructive text-sm">
          {createError}
        </p>
      )}
    </div>
  );
}
