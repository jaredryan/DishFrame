"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChefHat } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DragHandle } from "@/components/ui/drag-handle";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import { cn } from "@/lib/utils";
import { startCookingSession, endCookingSession } from "@/lib/cooking/actions";
import {
  TargetScaleField,
  computeOutputBasis,
} from "@/components/domain/cooking/scale-control";
import {
  VersionPicker,
  type VersionOption,
} from "@/components/domain/dish/version-picker";

export type SetupUnit = {
  unitKey: string;
  kind: "SECTION" | "PART";
  label: string;
  estimatedDurationMinutes: number | null;
  ingredientCount: number;
  instructionCount: number;
  outputQuantity: number | null;
  outputUnit: string | null;
  // SLICE_9.md refinement pass — set only for a Part reached by linking
  // through another Part (never a top-level or Section-nested Part), so the
  // list can show it's a nested, independently selectable unit rather than a
  // sibling of the thing that links to it (PRODUCT_SPEC.md §23.4).
  parentPartLabel: string | null;
};

const SECTION_HEADING_CLASS = "font-heading text-lg font-medium";

function countsLabel(unit: SetupUnit): string {
  const parts: string[] = [];
  if (unit.ingredientCount > 0) {
    parts.push(
      `${unit.ingredientCount} ingredient${unit.ingredientCount === 1 ? "" : "s"}`,
    );
  }
  if (unit.instructionCount > 0) {
    parts.push(
      `${unit.instructionCount} step${unit.instructionCount === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" · ");
}

/**
 * Cooking Setup (PRODUCT_SPEC.md §21.2): a mandatory, transient planning
 * step. No Cooking Session exists until "Start cooking" is pressed — every
 * control here is local React state; canceling or navigating away leaves
 * no residue by construction (Gate 4), never an explicit cleanup call.
 */
export function CookingSetup({
  dishId,
  dishKind,
  dishVersionId,
  dishTitle,
  versionLabel,
  isCurrent,
  currentVersionId,
  versions,
  units,
  sourceOutputQuantity,
  sourceOutputUnit,
  cancelHref,
}: {
  dishId: string;
  dishKind: "RECIPE" | "PART";
  dishVersionId: string;
  dishTitle: string;
  versionLabel: string;
  isCurrent: boolean;
  // The Recipe/Part's actual current Version id, for the picker's
  // "(current)" suffix — distinct from `dishVersionId`, the Version this
  // setup screen is showing, whenever a historical Version is selected.
  currentVersionId: string | null;
  // Every saved Version, for the Version picker — switching navigates to
  // this same setup screen for the chosen Version's own content.
  versions: VersionOption[];
  units: SetupUnit[];
  sourceOutputQuantity: number | null;
  sourceOutputUnit: string | null;
  // Where Cancel returns to: the page this setup was opened from (Home, the
  // Cook sessions list, or — the default — the item's own detail page).
  cancelHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Changing Version re-navigates this setup screen so the server re-derives
  // the cookable units/yield from that Version's own content — the same
  // "switch and re-fetch" pattern `VersionSelector`/`VersionComparePicker`
  // use elsewhere, rather than trying to patch units/yield client-side.
  function handleVersionChange(versionId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("versionId", versionId);
    router.push(`${pathname}?${params.toString()}`);
  }

  // §23.3: every eligible unit begins included. `order` is the user's
  // manually chosen sequence for every unit — included or not — so
  // unchecking a unit never displaces it; re-checking restores it exactly
  // where it was (QA item 7). `includedKeys`, derived below, is `order`
  // filtered down to what's actually checked — that's what drives Cooking
  // Mode's content and order.
  const [order, setOrder] = React.useState<string[]>(
    units.map((u) => u.unitKey),
  );
  const [included, setIncluded] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(units.map((u) => [u.unitKey, true])),
  );
  const [sessionMultiplier, setSessionMultiplier] = React.useState<
    number | null
  >(null);
  const [unitMultipliers, setUnitMultipliers] = React.useState<
    Record<string, number | null>
  >({});
  const [isPending, startTransition] = React.useTransition();
  const { showToast } = useToast();
  const [conflict, setConflict] = React.useState<{
    existingSessionId: string | null;
  } | null>(null);
  const [resolvingConflict, setResolvingConflict] = React.useState(false);

  const unitByKey = React.useMemo(
    () => new Map(units.map((u) => [u.unitKey, u])),
    [units],
  );
  const includedKeys = order.filter((key) => included[key]);

  const sensors = useReorderSensors();
  const announcements = createReorderAnnouncements(
    (id) => unitByKey.get(id)?.label ?? "unit",
    (id) => ({ index: order.indexOf(id), total: order.length }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function toggleIncluded(unitKey: string, checked: boolean) {
    setIncluded((prev) => ({ ...prev, [unitKey]: checked }));
  }

  function handleStart() {
    startTransition(async () => {
      const result = await startCookingSession({
        dishId,
        dishVersionId,
        scaleFactor: sessionMultiplier,
        units: includedKeys.map((unitKey) => ({
          unitKey,
          scaleFactor: unitMultipliers[unitKey] ?? null,
        })),
      });

      if (result.status === "success") {
        router.push(`/cook/${result.sessionId}`);
      } else if (result.status === "conflict") {
        setConflict({ existingSessionId: result.existingSessionId });
      } else {
        showToast({ variant: "error", title: result.message });
      }
    });
  }

  function handleEndExisting() {
    if (!conflict?.existingSessionId) return;
    setResolvingConflict(true);
    startTransition(async () => {
      await endCookingSession({
        sessionId: conflict.existingSessionId!,
        outcome: "ENDED_EARLY",
      });
      setResolvingConflict(false);
      setConflict(null);
    });
  }

  const kindNoun = dishKind === "PART" ? "part" : "recipe";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Cooking setup
        </h1>
        <p className="text-muted-foreground text-sm">
          {dishTitle} — {versionLabel}
          {!isCurrent && " (historical version)"}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className={SECTION_HEADING_CLASS}>Version</h2>
        <VersionPicker
          id="cooking-setup-version"
          versions={versions}
          currentVersionId={currentVersionId}
          value={dishVersionId}
          onChangeAction={handleVersionChange}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className={SECTION_HEADING_CLASS}>Whole-session scale</h2>
        <p className="text-muted-foreground text-sm">
          Adjust the entire {kindNoun} to cook the amount you need.
        </p>
        <TargetScaleField
          id="cooking-setup-whole-session-scale"
          outputQuantity={sourceOutputQuantity}
          outputUnit={sourceOutputUnit}
          subjectLabel={dishKind === "PART" ? "The part" : "The recipe"}
          targetLabel="Cook for"
          multiplierLabel="Scale the whole session"
          onMultiplierChange={setSessionMultiplier}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className={SECTION_HEADING_CLASS}>Cooking order and scale</h2>
        <p className="text-muted-foreground text-sm">
          Choose what to include, change the order it appears in Cooking Mode,
          and scale each section or Part for exactly what you want to cook.
        </p>

        {order.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing to cook for this Version.
          </p>
        ) : (
          <DndContext
            id="cooking-setup-order"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{ announcements }}
          >
            <SortableContext
              items={order}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {order.map((unitKey) => {
                  const unit = unitByKey.get(unitKey);
                  if (!unit) return null;
                  return (
                    <SetupUnitRow
                      key={unitKey}
                      unit={unit}
                      isIncluded={!!included[unitKey]}
                      onToggleIncluded={(checked) =>
                        toggleIncluded(unitKey, checked)
                      }
                      outputQuantity={computeOutputBasis(
                        unit.outputQuantity,
                        sessionMultiplier ?? 1,
                      )}
                      onMultiplierChange={(multiplier) =>
                        setUnitMultipliers((prev) => ({
                          ...prev,
                          [unitKey]: multiplier,
                        }))
                      }
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleStart}
          disabled={includedKeys.length === 0}
          loading={isPending}
        >
          <ChefHat className="size-4" aria-hidden="true" />
          Start cooking
        </Button>
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>

      <Dialog
        open={conflict != null}
        onOpenChange={(open) => !open && setConflict(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A session is already in progress</DialogTitle>
            <DialogDescription>
              Only one Cooking Session can be in progress for this item at a
              time. Resume it, end it, or cancel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflict(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleEndExisting}
              disabled={!conflict?.existingSessionId}
              loading={resolvingConflict}
            >
              End current session
            </Button>
            <Button
              disabled={!conflict?.existingSessionId}
              onClick={() =>
                conflict?.existingSessionId &&
                router.push(`/cook/${conflict.existingSessionId}`)
              }
            >
              Resume current session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * One draggable, checkable unit card. The checkbox (inclusion) sits on the
 * left — the conventional selection position — and the drag handle sits on
 * the right (QA item 8's deliberate exception to drag handles normally
 * appearing on the left), so the two responsibilities read distinctly: left
 * = "is this part of this cooking session," right = "where does it appear."
 * Only the handle is a drag-initiation target (`useSortable`'s
 * `attributes`/`listeners` are applied to `DragHandle` alone), since the
 * card also hosts the interactive per-unit scale field.
 */
function SetupUnitRow({
  unit,
  isIncluded,
  onToggleIncluded,
  outputQuantity,
  onMultiplierChange,
}: {
  unit: SetupUnit;
  isIncluded: boolean;
  onToggleIncluded: (checked: boolean) => void;
  outputQuantity: number | null;
  onMultiplierChange: (multiplier: number | null) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: unit.unitKey });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-3",
        !isIncluded && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isIncluded}
          onCheckedChange={(checked) => onToggleIncluded(checked === true)}
          aria-label={`Include ${unit.label} in this cooking session`}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-medium">{unit.label}</p>
          <p className="text-muted-foreground text-xs">
            {[
              unit.parentPartLabel
                ? `Part · nested in ${unit.parentPartLabel}`
                : unit.kind === "PART"
                  ? "Part"
                  : "Section",
              unit.estimatedDurationMinutes != null
                ? `~${unit.estimatedDurationMinutes} min`
                : null,
              countsLabel(unit) || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <DragHandle
          label={`Drag to reorder ${unit.label}`}
          attributes={attributes}
          listeners={listeners}
          isDragging={isDragging}
          className="mt-0.5"
        />
      </div>
      {isIncluded && (
        <TargetScaleField
          id={`cooking-setup-scale-${unit.unitKey}`}
          outputQuantity={outputQuantity}
          outputUnit={unit.outputUnit}
          subjectLabel={unit.kind === "PART" ? "This part" : "This section"}
          targetLabel="Make"
          multiplierLabel="Scale this unit"
          onMultiplierChange={onMultiplierChange}
        />
      )}
    </li>
  );
}
