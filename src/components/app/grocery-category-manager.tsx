"use client";

import * as React from "react";
import type { FormEvent } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createGroceryCategory,
  deleteGroceryCategory,
  reorderGroceryCategories,
} from "@/lib/grocery/actions";
import { initialActionState } from "@/lib/grocery/schema";

type Category = { id: string; displayName: string; position: number };

export function GroceryCategoryManager({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  const [categories, setCategories] = React.useState(initialCategories);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    setCreateError(null);
    startTransition(async () => {
      const result = await createGroceryCategory(initialActionState, formData);
      if (result.status === "success") {
        setCategories((prev) => [
          ...prev,
          { id: crypto.randomUUID(), displayName: name, position: prev.length },
        ]);
        formRef.current?.reset();
      } else {
        setCreateError(result.message ?? "Could not add category.");
      }
    });
  }

  function handleDelete(id: string) {
    setCategories((prev) => prev.filter((category) => category.id !== id));
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      await deleteGroceryCategory(initialActionState, formData);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const next = [...categories];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setCategories(next);

    startTransition(async () => {
      await reorderGroceryCategories(next.map((category) => category.id));
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
            <span className="flex-1 text-sm">{category.displayName}</span>
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
                onClick={() => handleDelete(category.id)}
                aria-label={`Delete ${category.displayName}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
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

      {createError && (
        <p role="alert" className="text-destructive text-sm">
          {createError}
        </p>
      )}
    </div>
  );
}
