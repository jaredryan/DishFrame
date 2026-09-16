"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConflicts, useConflictResolution } from "@/lib/offline/hooks";

const ENTITY_LABELS: Record<string, string> = {
  dish: "Recipe/Part",
  cookingSession: "Cooking session",
  mealPlan: "Meal plan",
  groceryList: "Grocery list",
};

/**
 * The plan's §6.1 conflict surface: an offline change that couldn't sync
 * because the server's copy changed first. Deliberately simple — one
 * dialog listing every conflict app-wide (not a per-page banner, since a
 * conflicted entity may not be the one currently on screen), each row with
 * two explicit choices and no silent default. Mounted once from `(app)/
 * layout.tsx`; renders nothing when there are no conflicts.
 */
export function ConflictResolutionDialog() {
  const conflicts = useConflicts();
  const { discardMine, keepMine } = useConflictResolution();

  if (conflicts.length === 0) return null;

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {conflicts.length === 1
              ? "One offline change couldn't sync"
              : `${conflicts.length} offline changes couldn't sync`}
          </DialogTitle>
          <DialogDescription>
            These changed on the server while this device was offline. Choose
            whether to keep what you changed here, or use the server&apos;s
            current version instead.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-border flex flex-col divide-y">
          {conflicts.map((record) => (
            <div key={`${record.entityType}:${record.id}`} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium">
                {ENTITY_LABELS[record.entityType] ?? record.entityType}
              </p>
              <p className="text-muted-foreground text-sm">{record.conflict?.message}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => discardMine(record)}>
                  Use server&apos;s version
                </Button>
                <Button size="sm" onClick={() => keepMine(record)}>
                  Keep my change
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
