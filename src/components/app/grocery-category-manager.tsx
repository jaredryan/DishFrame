"use client";

import * as React from "react";
import type { FormEvent } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [isPending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    setCreateError(null);
    startTransition(async () => {
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
    startTransition(async () => {
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
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", category.id);
      const result = await deleteGroceryCategory(initialActionState, formData);
      if (result.status !== "success") {
        setCategories(previous);
        setDeleteError(result.message ?? "Could not delete category.");
      }
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const previous = categories;
    const next = [...categories];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setCategories(next);

    startTransition(async () => {
      const result = await reorderGroceryCategories(
        next.map((category) => category.id),
      );
      if (result.status !== "success") {
        setCategories(previous);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {categories.map((category, index) => (
          <li
            key={category.id}
            className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-2"
          >
            <GripVertical
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />

            {editingId === category.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  handleRename(category.id, String(formData.get("name") ?? ""));
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
                <span className="flex-1 text-sm">{category.displayName}</span>
                {category.isFallback && (
                  <Badge variant="secondary">Fallback</Badge>
                )}
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${category.displayName} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === categories.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${category.displayName} down`}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(category.id)}
                    aria-label={`Rename ${category.displayName}`}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  {!category.isFallback && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(category)}
                      aria-label={`Delete ${category.displayName}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
        {categories.length === 0 && (
          <li className="text-muted-foreground text-sm">Nothing here yet.</li>
        )}
      </ul>

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
        {renameError && (
          <p role="alert" className="text-destructive text-sm">
            {renameError}
          </p>
        )}
        {deleteError && (
          <p role="alert" className="text-destructive text-sm">
            {deleteError}
          </p>
        )}
      </div>
    </div>
  );
}
