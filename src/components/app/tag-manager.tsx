"use client";

import * as React from "react";
import type { FormEvent } from "react";
import { AlertCircle, CheckCircle2, Pencil, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePendingAction } from "@/components/ui/use-pending-action";
import { createTag, deleteTag, renameTag } from "@/lib/tags/actions";
import {
  initialActionState,
  initialCreateTagActionState,
  initialRenameTagActionState,
  type TagDto,
} from "@/lib/tags/schema";

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * PRODUCT_SPEC.md §45.5-§45.9: flat, unordered tags (no drag-reorder, unlike
 * Tasters/Flavor profiles) — Favorite is pinned first by the query itself
 * and can't be renamed/merged/deleted. Renaming to an existing other tag
 * "offers to merge" (§45.6) via a confirm step before submitting; deleting
 * shows the affected-item count (§45.7).
 */
export function TagManager({ initialTags }: { initialTags: TagDto[] }) {
  const [tags, setTags] = React.useState(initialTags);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const { pendingAction, isPending, run } = usePendingAction<
    "create" | "rename" | "delete"
  >();
  const createFormRef = React.useRef<HTMLFormElement>(null);

  const [pendingRename, setPendingRename] = React.useState<{
    id: string;
    name: string;
    destinationName: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<TagDto | null>(null);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    setCreateError(null);
    setFeedback(null);
    run("create", async () => {
      const result = await createTag(initialCreateTagActionState, formData);
      if (result.status === "success" && result.tag) {
        setTags((prev) => [...prev, result.tag!]);
        createFormRef.current?.reset();
        setFeedback({ kind: "success", message: result.message ?? "Added." });
      } else {
        setCreateError(result.message ?? "Could not add tag.");
      }
    });
  }

  function submitRename(id: string, name: string) {
    setEditingId(null);
    setFeedback(null);
    const previous = tags;
    run("rename", async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("name", name);
      const result = await renameTag(initialRenameTagActionState, formData);
      if (result.status === "success" && result.merged) {
        setTags((prev) => {
          const withoutSource = prev.filter((tag) => tag.id !== id);
          const removed = prev.find((tag) => tag.id === id);
          return withoutSource.map((tag) =>
            tag.id === result.merged!.destinationId
              ? { ...tag, dishCount: tag.dishCount + (removed?.dishCount ?? 0) }
              : tag,
          );
        });
        setFeedback({ kind: "success", message: result.message ?? "Merged." });
      } else if (result.status === "success") {
        setTags((prev) =>
          prev.map((tag) =>
            tag.id === id ? { ...tag, displayName: name } : tag,
          ),
        );
        setFeedback({ kind: "success", message: result.message ?? "Renamed." });
      } else {
        setTags(previous);
        setFeedback({
          kind: "error",
          message: result.message ?? "Could not rename tag.",
        });
      }
    });
  }

  function handleRenameSubmit(id: string, name: string) {
    const current = tags.find((tag) => tag.id === id);
    if (!current) return;
    if (normalize(name) === normalize(current.displayName)) {
      // Same identity, just a display-casing/whitespace tweak — no merge.
      submitRename(id, name);
      return;
    }
    const destination = tags.find(
      (tag) => tag.id !== id && normalize(tag.displayName) === normalize(name),
    );
    if (destination) {
      setPendingRename({ id, name, destinationName: destination.displayName });
      return;
    }
    submitRename(id, name);
  }

  function handleDelete(tag: TagDto) {
    setPendingDelete(tag);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    const previous = tags;
    setTags((prev) => prev.filter((tag) => tag.id !== id));
    setPendingDelete(null);
    setFeedback(null);
    run("delete", async () => {
      const formData = new FormData();
      formData.set("id", id);
      const result = await deleteTag(initialActionState, formData);
      if (result.status === "success") {
        setFeedback({ kind: "success", message: result.message ?? "Deleted." });
      } else {
        setTags(previous);
        setFeedback({
          kind: "error",
          message: result.message ?? "Could not delete tag.",
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {tags.map((tag) => {
          const isEditing = editingId === tag.id;
          return (
            <li
              key={tag.id}
              className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              {isEditing ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    handleRenameSubmit(
                      tag.id,
                      String(formData.get("name") ?? ""),
                    );
                  }}
                >
                  <Input
                    name="name"
                    aria-label={`Edit name for ${tag.displayName}`}
                    defaultValue={tag.displayName}
                    maxLength={60}
                    required
                    autoFocus
                    className="h-8"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    loading={pendingAction === "rename"}
                  >
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
                  <span className="flex flex-1 items-center gap-1.5 text-sm">
                    {tag.displayName}
                    {tag.isFavorite && (
                      <Star
                        className="text-brand-orange size-3.5 fill-current"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <Badge variant="outline" className="tabular-nums">
                    {tag.dishCount}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={tag.isFavorite || isPending}
                      onClick={() => setEditingId(tag.id)}
                      aria-label={`Rename ${tag.displayName}`}
                      title={
                        tag.isFavorite
                          ? "The Favorite tag can't be renamed."
                          : `Rename ${tag.displayName}`
                      }
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={tag.isFavorite || isPending}
                      onClick={() => handleDelete(tag)}
                      aria-label={`Delete ${tag.displayName}`}
                      title={
                        tag.isFavorite
                          ? "The Favorite tag can't be deleted."
                          : `Delete ${tag.displayName}`
                      }
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <form
        ref={createFormRef}
        onSubmit={handleCreate}
        className="flex items-end gap-2"
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="new-tag-name">Add a tag</Label>
          <Input
            id="new-tag-name"
            name="name"
            placeholder="e.g. High Protein"
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

      <ConfirmDialog
        open={pendingRename != null}
        onOpenChangeAction={(open) => !open && setPendingRename(null)}
        title={<>Merge into &ldquo;{pendingRename?.destinationName}&rdquo;?</>}
        description={
          <>
            A tag named &ldquo;{pendingRename?.destinationName}&rdquo; already
            exists. Every Recipe and Part using this tag will be retagged
            &ldquo;{pendingRename?.destinationName}&rdquo; instead, and this tag
            will be removed.
          </>
        }
        confirmLabel="Merge"
        loading={pendingAction === "rename"}
        onConfirmAction={() => {
          if (!pendingRename) return;
          submitRename(pendingRename.id, pendingRename.name);
          setPendingRename(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChangeAction={(open) => !open && setPendingDelete(null)}
        title={<>Delete &ldquo;{pendingDelete?.displayName}&rdquo;?</>}
        description={
          pendingDelete && pendingDelete.dishCount > 0
            ? `This removes the tag from ${pendingDelete.dishCount} item${pendingDelete.dishCount === 1 ? "" : "s"}. Those Recipes and Parts are not deleted.`
            : "This tag isn't used by anything yet."
        }
        confirmLabel="Delete"
        destructive
        loading={pendingAction === "delete"}
        onConfirmAction={confirmDelete}
      />
    </div>
  );
}
