"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ContentCard,
  CONTENT_CARD_TITLE_CLASS,
} from "@/components/domain/dish/content-card";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import {
  addSessionUnits,
  removeSessionUnit,
  restoreSessionUnit,
  reorderSessionUnits,
  endCookingSession,
  deleteCookingSession,
} from "@/lib/cooking/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

export type SessionUnit = {
  id: string;
  label: string;
  sourceDishTitle: string;
  sourceDishVersionLabel: string;
  removedAt: string | null;
  removedAfterProgress: boolean;
  checklistItems: Array<{
    id: string;
    kind: "INGREDIENT" | "INSTRUCTION";
    displayText: string;
    displayQuantity: string | null;
    displayUnit: string | null;
  }>;
};

export type AddableUnit = { unitKey: string; label: string };

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function ChecklistPreview({ items }: { items: SessionUnit["checklistItems"] }) {
  const ingredients = items.filter((i) => i.kind === "INGREDIENT");
  const instructions = items.filter((i) => i.kind === "INSTRUCTION");
  return (
    <div className="flex flex-col gap-2">
      {ingredients.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {ingredients.map((item) => (
            <li key={item.id}>
              {[item.displayQuantity, item.displayUnit, item.displayText]
                .filter(Boolean)
                .join(" ")}
            </li>
          ))}
        </ul>
      )}
      {instructions.length > 0 && (
        <ol className="flex flex-col gap-1 text-sm">
          {instructions.map((item, i) => (
            <li key={item.id} className="flex gap-2">
              <span className="text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              <span>{item.displayText}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * The Slice 7 Cooking Session shell (PRODUCT_SPEC.md §21-27) — source
 * identity, active-plan editing, and lifecycle actions. The dedicated,
 * minimal-chrome Cooking Mode (unit focus, checkoffs, timers) is Slice 8;
 * this renders every unit's full checklist inline, read from its own
 * stored snapshot (Correction 3) rather than any live source.
 */
export function CookingSessionShell({
  sessionId,
  state,
  startedAt,
  endedAt,
  rawElapsedSeconds,
  dishId,
  dishTitle,
  dishKind,
  versionLabel,
  activeUnits,
  removedUnits,
  addableUnits,
}: {
  sessionId: string;
  state: "IN_PROGRESS" | "COMPLETED" | "ENDED_EARLY";
  startedAt: string;
  endedAt: string | null;
  rawElapsedSeconds: number | null;
  dishId: string;
  dishTitle: string;
  dishKind: DishKindValue | null;
  versionLabel: string;
  activeUnits: SessionUnit[];
  removedUnits: SessionUnit[];
  addableUnits: AddableUnit[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [finalUnitGuard, setFinalUnitGuard] = React.useState(false);
  const [confirmingEnd, setConfirmingEnd] = React.useState<
    "COMPLETED" | "ENDED_EARLY" | null
  >(null);

  const isActive = state === "IN_PROGRESS";

  function runEdit(
    action: () => Promise<{ status: string; message?: string }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status === "final-unit-guard") {
        setFinalUnitGuard(true);
      } else if (result.status === "error") {
        setError(result.message ?? "Something went wrong.");
      } else {
        router.refresh();
      }
    });
  }

  function handleMove(unitId: string, direction: -1 | 1) {
    const ids = activeUnits.map((u) => u.id);
    const index = ids.indexOf(unitId);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    runEdit(() => reorderSessionUnits({ sessionId, orderedUnitIds: ids }));
  }

  function handleRemove(unitId: string) {
    runEdit(() => removeSessionUnit({ sessionId, unitId }));
  }

  function handleRestore(unitId: string) {
    runEdit(() => restoreSessionUnit({ sessionId, unitId }));
  }

  function handleAdd(unitKey: string) {
    runEdit(() => addSessionUnits({ sessionId, unitKeys: [unitKey] }));
  }

  function handleDeleteSession() {
    startTransition(async () => {
      await deleteCookingSession({ sessionId });
      router.push("/cook");
    });
  }

  function handleEnd(outcome: "COMPLETED" | "ENDED_EARLY") {
    setError(null);
    startTransition(async () => {
      const result = await endCookingSession({ sessionId, outcome });
      setConfirmingEnd(null);
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.refresh();
      }
    });
  }

  const stateLabel =
    state === "IN_PROGRESS"
      ? "In progress"
      : state === "COMPLETED"
        ? "Completed"
        : "Ended early";
  const duration = formatDuration(rawElapsedSeconds);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            {dishTitle}
          </h1>
          <Badge variant="outline">{versionLabel}</Badge>
          <Badge
            variant="outline"
            className={
              state === "IN_PROGRESS"
                ? "border-primary/40 text-primary"
                : undefined
            }
          >
            {stateLabel}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {dishKind && (
            <Link
              href={`${dishBasePath(dishKind)}/${dishId}`}
              className="hover:underline"
            >
              View source {dishKind === "PART" ? "Part" : "Recipe"}
            </Link>
          )}
          {" · "}
          Started {new Date(startedAt).toLocaleString()}
          {endedAt && ` · Ended ${new Date(endedAt).toLocaleString()}`}
          {duration && ` · ${duration}`}
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <ContentCard>
        <h2 className={CONTENT_CARD_TITLE_CLASS}>Active plan</h2>
        {activeUnits.length === 0 && (
          <p className="text-muted-foreground text-sm">No active units.</p>
        )}
        <ul className="flex flex-col gap-3">
          {activeUnits.map((unit, index) => (
            <li key={unit.id} className="border-border rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium">
                    {unit.label}
                  </p>
                  {unit.sourceDishTitle !== dishTitle && (
                    <p className="text-muted-foreground text-xs">
                      From {unit.sourceDishTitle} —{" "}
                      {unit.sourceDishVersionLabel}
                    </p>
                  )}
                </div>
                {isActive && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <TooltipIconButton
                      label={`Move ${unit.label} up`}
                      icon={ChevronUp}
                      onClick={() => handleMove(unit.id, -1)}
                      disabled={isPending || index === 0}
                    />
                    <TooltipIconButton
                      label={`Move ${unit.label} down`}
                      icon={ChevronDown}
                      onClick={() => handleMove(unit.id, 1)}
                      disabled={isPending || index === activeUnits.length - 1}
                    />
                    <TooltipIconButton
                      label={`Remove ${unit.label}`}
                      icon={Trash2}
                      onClick={() => handleRemove(unit.id)}
                      disabled={isPending}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    />
                  </div>
                )}
              </div>
              <div className="mt-2">
                <ChecklistPreview items={unit.checklistItems} />
              </div>
            </li>
          ))}
        </ul>
      </ContentCard>

      {isActive && addableUnits.length > 0 && (
        <ContentCard>
          <h2 className={CONTENT_CARD_TITLE_CLASS}>Add to this session</h2>
          <ul className="flex flex-col gap-2">
            {addableUnits.map((unit) => (
              <li
                key={unit.unitKey}
                className="border-border flex items-center justify-between gap-2 rounded-lg border border-dashed p-3"
              >
                <p className="text-muted-foreground text-sm">{unit.label}</p>
                <TooltipIconButton
                  label={`Add ${unit.label}`}
                  icon={Plus}
                  onClick={() => handleAdd(unit.unitKey)}
                  disabled={isPending}
                />
              </li>
            ))}
          </ul>
        </ContentCard>
      )}

      {removedUnits.length > 0 && (
        <ContentCard>
          <h2 className={CONTENT_CARD_TITLE_CLASS}>
            Removed from this session
          </h2>
          <ul className="flex flex-col gap-2">
            {removedUnits.map((unit) => (
              <li
                key={unit.id}
                className="border-border flex items-center justify-between gap-2 rounded-lg border border-dashed p-3"
              >
                <div className="min-w-0">
                  <p className="text-muted-foreground text-sm">{unit.label}</p>
                  {unit.removedAfterProgress && (
                    <Badge variant="outline" className="mt-1">
                      Removed after progress
                    </Badge>
                  )}
                </div>
                {isActive && (
                  <TooltipIconButton
                    label={`Restore ${unit.label}`}
                    icon={RotateCcw}
                    onClick={() => handleRestore(unit.id)}
                    disabled={isPending}
                  />
                )}
              </li>
            ))}
          </ul>
        </ContentCard>
      )}

      {isActive && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setConfirmingEnd("COMPLETED")}
            disabled={isPending}
          >
            Finish session
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmingEnd("ENDED_EARLY")}
            disabled={isPending}
          >
            End early
          </Button>
        </div>
      )}

      <Dialog
        open={finalUnitGuard}
        onOpenChange={(open) => !open && setFinalUnitGuard(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This is the last active unit</DialogTitle>
            <DialogDescription>
              Removing it would leave this Cooking Session empty. Keep editing,
              or delete the whole session instead.
              {activeUnits.some((u) => u.checklistItems.length > 0) &&
                " Deleting removes any progress recorded in this session."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalUnitGuard(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSession}
              disabled={isPending}
            >
              Delete session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmingEnd != null}
        onOpenChange={(open) => !open && setConfirmingEnd(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmingEnd === "COMPLETED"
                ? "Finish this Cooking Session?"
                : "End this Cooking Session early?"}
            </DialogTitle>
            <DialogDescription>
              {confirmingEnd === "COMPLETED"
                ? "Marks this session as completed. This preserves everything recorded so far."
                : "Marks this session as ended early. Partial progress is preserved and can still be reviewed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingEnd(null)}>
              Keep cooking
            </Button>
            <Button
              onClick={() => confirmingEnd && handleEnd(confirmingEnd)}
              disabled={isPending}
            >
              {confirmingEnd === "COMPLETED" ? "Finish session" : "End early"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
