"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import { deleteGroceryList } from "@/lib/grocery/list-actions";

export type GroceryListRowItem = {
  id: string;
  title: string;
  createdAt: Date;
  _count: { items: number };
};

/**
 * Single Grocery List row, shared by the Grocery Lists index
 * (`GroceryListRows`) and the Home dashboard's "Grocery lists" section. The
 * whole card stays a "stretched link" to the list — View is the default
 * destination for both variants, since opening a list is as likely to mean
 * shopping from it as editing it.
 */
export function GroceryListCard({ list }: { list: GroceryListRowItem }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteGroceryList({ listId: list.id });
      setDeleteOpen(false);
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message ?? "Could not delete this list.");
      }
    });
  }

  return (
    <li className="border-border bg-card relative flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <Link
        href={`/grocery-lists/${list.id}`}
        aria-label={`Open ${list.title}`}
        className="absolute inset-0 z-0 rounded-lg"
      />
      <div className="min-w-0">
        <p className="text-foreground truncate text-sm font-medium">
          {list.title}
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          {list.createdAt.toLocaleDateString()} · {list._count.items} item
          {list._count.items === 1 ? "" : "s"}
        </p>
        {error && (
          <p role="alert" className="text-destructive-text mt-1 text-xs">
            {error}
          </p>
        )}
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        <TooltipIconButton
          label={`View ${list.title}`}
          tooltip="View"
          icon={Eye}
          onClick={() => router.push(`/grocery-lists/${list.id}`)}
        />
        <TooltipIconButton
          label={`Delete ${list.title}`}
          tooltip="Delete"
          icon={Trash2}
          className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
          onClick={() => setDeleteOpen(true)}
        />
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{list.title}&rdquo;?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/**
 * Grocery Lists index — Active/Completed columns, same two-column layout as
 * the Cook and Meal Plans pages, each row a `GroceryListCard`.
 */
export function GroceryListRows({
  active,
  completed,
}: {
  active: GroceryListRowItem[];
  completed: GroceryListRowItem[];
}) {
  if (active.length === 0 && completed.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
        <ShoppingCart className="size-8" aria-hidden="true" />
        <p>No grocery lists yet — generate one from a Recipe or Part.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Active
        </h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active grocery lists.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((list) => (
              <GroceryListCard key={list.id} list={list} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Completed
        </h2>
        {completed.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No completed grocery lists yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {completed.map((list) => (
              <GroceryListCard key={list.id} list={list} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
