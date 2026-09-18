"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  startMultiSourceCookingSession,
  endCookingSession,
  getMultiSourceSetupData,
  type MultiSourceSetupSourceDto,
} from "@/lib/cooking/actions";
import { startMultiSourceCookingSessionOffline } from "@/lib/cooking/offline-start";
import {
  TargetScaleField,
  computeOutputBasis,
} from "@/components/domain/cooking/scale-control";
import { VersionPicker } from "@/components/domain/dish/version-picker";
import type { ConsolidatedSetupUnit } from "@/lib/cooking/setup-units";

const SECTION_HEADING_CLASS = "font-heading text-lg font-medium";

function countsLabel(unit: ConsolidatedSetupUnit): string {
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
 * Multi-source Cooking Setup (owner spec, 2026-09-17) — the generic Start
 * Cooking picker's hand-off destination once two or more sources are
 * selected. Same section shape and reorder interaction as the single-source
 * `CookingSetup` (Version + scale per source, one combined "Cooking order
 * and scale" list) — kept as a separate component rather than retrofitting
 * `CookingSetup`'s own singular dishId/dishVersionId props, so every
 * existing direct-entry caller of that component stays completely
 * untouched (see docs/MULTI_SOURCE_COOKING_SESSIONS.md for why). No
 * Cooking Session exists until "Start cooking" is pressed, same as today.
 */
export function MultiSourceCookingSetup({
  sources: initialSources,
  units: initialUnits,
  cancelHref,
}: {
  sources: MultiSourceSetupSourceDto[];
  units: ConsolidatedSetupUnit[];
  cancelHref: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [sources, setSources] = React.useState(initialSources);
  const [units, setUnits] = React.useState(initialUnits);
  const [order, setOrder] = React.useState<string[]>(
    initialUnits.map((u) => u.mergeKey),
  );
  const [included, setIncluded] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialUnits.map((u) => [u.mergeKey, true])),
  );
  const [sourceScales, setSourceScales] = React.useState<
    Record<string, number | null>
  >({});
  const [unitScales, setUnitScales] = React.useState<
    Record<string, number | null>
  >({});
  const [isPending, startTransition] = React.useTransition();
  const [changingVersionFor, setChangingVersionFor] = React.useState<
    string | null
  >(null);
  const [conflict, setConflict] = React.useState<{
    dishTitle: string;
    existingSessionId: string | null;
  } | null>(null);
  const [resolvingConflict, setResolvingConflict] = React.useState(false);

  const unitByKey = React.useMemo(
    () => new Map(units.map((u) => [u.mergeKey, u])),
    [units],
  );

  /** Switching one source's Version re-derives the whole combined
   * consolidated list server-side (a different Version can add/remove/
   * reshape cookable units, including which Parts it shares with the other
   * selected sources) — matching single-source Cooking Setup's own
   * "switch and re-fetch" convention, generalized: every local order/
   * inclusion/scale choice resets, exactly as a full page reload would
   * reset them for the single-source case. */
  async function handleVersionChange(dishId: string, newVersionId: string) {
    setChangingVersionFor(dishId);
    const result = await getMultiSourceSetupData({
      sources: sources.map((s) => ({
        dishId: s.dishId,
        dishVersionId: s.dishId === dishId ? newVersionId : s.dishVersionId,
      })),
    });
    setChangingVersionFor(null);
    if (result.status !== "success") {
      showToast({ variant: "error", title: result.message });
      return;
    }
    setSources(result.sources);
    setUnits(result.units);
    setOrder(result.units.map((u) => u.mergeKey));
    setIncluded(
      Object.fromEntries(result.units.map((u) => [u.mergeKey, true])),
    );
    setSourceScales({});
    setUnitScales({});
  }
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

  function toggleIncluded(mergeKey: string, checked: boolean) {
    setIncluded((prev) => ({ ...prev, [mergeKey]: checked }));
  }

  function handleStart() {
    startTransition(async () => {
      const input = {
        sources: sources.map((s) => ({
          dishId: s.dishId,
          dishVersionId: s.dishVersionId,
          scaleFactor: sourceScales[s.dishId] ?? null,
        })),
        units: includedKeys.map((mergeKey) => ({
          mergeKey,
          scaleFactor: unitScales[mergeKey] ?? null,
        })),
      };
      const result =
        typeof navigator !== "undefined" && navigator.onLine === false
          ? await startMultiSourceCookingSessionOffline(input)
          : await startMultiSourceCookingSession(input);

      if (result.status === "success") {
        router.push(`/cook/${result.sessionId}`);
      } else if (result.status === "conflict") {
        setConflict({
          dishTitle: result.message,
          existingSessionId: result.existingSessionId,
        });
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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Cooking setup
        </h1>
        <p className="text-muted-foreground text-sm">
          {sources.map((s) => s.dishTitle).join(" + ")}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className={SECTION_HEADING_CLASS}>Sources</h2>
        {sources.map((source) => (
          <div
            key={source.dishId}
            className="border-border bg-card flex flex-col gap-3 rounded-lg border p-3"
          >
            <p className="text-foreground text-sm font-medium">
              {source.dishTitle}
            </p>
            {source.versions.length > 1 ? (
              <VersionPicker
                id={`multi-source-setup-version-${source.dishId}`}
                versions={source.versions}
                currentVersionId={source.currentVersionId}
                value={source.dishVersionId}
                onChange={(versionId) =>
                  handleVersionChange(source.dishId, versionId)
                }
                disabled={changingVersionFor === source.dishId}
                triggerClassName="bg-card dark:bg-card"
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {source.versionLabel}
                {/* Offline Setup only ever replicates one Version's own
                    cookable units (offline-multi-source-setup.ts), so a
                    single-Version `versions` array means either that's
                    genuinely all this Dish has, or Setup is offline right
                    now — either way, nothing to switch to. */}
              </p>
            )}
            <TargetScaleField
              id={`multi-source-setup-scale-${source.dishId}`}
              outputQuantity={source.outputQuantity}
              outputUnit={source.outputUnit}
              subjectLabel={
                source.dishKind === "PART" ? "This part" : "This recipe"
              }
              targetLabel="Cook for"
              multiplierLabel="Scale this source"
              onMultiplierChange={(multiplier) =>
                setSourceScales((prev) => ({
                  ...prev,
                  [source.dishId]: multiplier,
                }))
              }
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className={SECTION_HEADING_CLASS}>Cooking order and scale</h2>
        <p className="text-muted-foreground text-sm">
          Choose what to include, change the order it appears in Cooking Mode,
          and scale each section or Part for exactly what you want to cook.
          Units shared by more than one source are combined into one.
        </p>

        {order.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing to cook for these sources.
          </p>
        ) : (
          <DndContext
            id="multi-source-cooking-setup-order"
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
                {order.map((mergeKey) => {
                  const unit = unitByKey.get(mergeKey);
                  if (!unit) return null;
                  return (
                    <ConsolidatedUnitRow
                      key={mergeKey}
                      unit={unit}
                      isIncluded={!!included[mergeKey]}
                      onToggleIncluded={(checked) =>
                        toggleIncluded(mergeKey, checked)
                      }
                      outputQuantity={computeOutputBasis(
                        unit.outputQuantity,
                        1,
                      )}
                      onMultiplierChange={(multiplier) =>
                        setUnitScales((prev) => ({
                          ...prev,
                          [mergeKey]: multiplier,
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
              {conflict?.dishTitle ??
                "One of these items is already part of an active Cooking Session."}{" "}
              Resume it, end it, or cancel — this new session hasn&apos;t been
              created.
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

function ConsolidatedUnitRow({
  unit,
  isIncluded,
  onToggleIncluded,
  outputQuantity,
  onMultiplierChange,
}: {
  unit: ConsolidatedSetupUnit;
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
  } = useSortable({ id: unit.mergeKey });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isShared = unit.contributors.length > 1;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-border bg-card flex flex-col gap-2 rounded-lg border p-3",
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
              isShared
                ? "Shared"
                : unit.parentPartLabel
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
          {isShared && (
            // Restrained source-attribution treatment (owner spec) — a
            // small text line, never a nested card, so ordinary
            // single-source units stay exactly as compact as today.
            <p className="text-muted-foreground text-xs">
              {unit.contributors
                .map((c) =>
                  c.contributionQuantity != null
                    ? `${c.sourceDishTitle} — ${c.contributionQuantity}${c.contributionUnit ? ` ${c.contributionUnit}` : ""}`
                    : c.sourceDishTitle,
                )
                .join(" · ")}
            </p>
          )}
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
          id={`multi-source-setup-unit-scale-${unit.mergeKey}`}
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
