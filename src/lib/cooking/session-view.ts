import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  getOwnedSessionOrThrow,
  getSessionSourceSummary,
  getOwnedDishVersionOrThrow,
  buildCookableUnits,
  sessionUnitKey,
  computeChecklistItemConflict,
} from "@/lib/cooking/queries";
import { decimalToNumber } from "@/lib/dishes/format";
import type { CookingModeUnit } from "@/components/domain/cooking/cooking-mode-shell";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * Assembles every prop `CookingModeShell` needs for one session — extracted
 * from `(cook)/cook/[sessionId]/page.tsx` (docs/OFFLINE_IMPLEMENTATION_PLAN.md)
 * so the offline sync snapshot builder (`offline-sync/cooking.ts`) renders
 * from exactly the same assembly the live page uses, rather than a second
 * hand-maintained copy of this mapping. The page itself now just calls this
 * and passes the result straight to `<CookingModeShell />`.
 */
export type CookingModeSessionProps = {
  sessionId: string;
  state: "IN_PROGRESS" | "COMPLETED" | "ENDED_EARLY";
  isActive: boolean;
  startedAt: string;
  endedAt: string | null;
  dishId: string;
  dishTitle: string;
  dishKind: DishKindValue | null;
  versionLabel: string;
  versionImageAssetId: string | null;
  units: CookingModeUnit[];
  addableUnits: Array<{
    unitKey: string;
    label: string;
    parentPartLabel: string | null;
  }>;
  sessionScaleFactor: number;
  sourceOutputQuantity: number | null;
  sourceOutputUnit: string | null;
  timerSoundEnabled: boolean;
  cookingNotes: string | null;
  hasReview: boolean;
};

export async function buildCookingModeSessionProps(
  userId: string,
  sessionId: string,
): Promise<CookingModeSessionProps> {
  const cookingSession = await getOwnedSessionOrThrow(userId, sessionId);

  const [sourceSummary, preference, review] = await Promise.all([
    getSessionSourceSummary(cookingSession.dishId, cookingSession.dishVersionId),
    prisma.userPreference.findUnique({
      where: { userId },
      select: { timerSoundEnabled: true },
    }),
    prisma.sessionReview.findUnique({
      where: { sessionId: cookingSession.id },
      select: { sessionId: true },
    }),
  ]);

  const isActive = cookingSession.state === "IN_PROGRESS";
  const sessionMultiplier = decimalToNumber(cookingSession.scaleFactor) ?? 1;

  let addableUnits: CookingModeSessionProps["addableUnits"] = [];
  const outputByUnitKey = new Map<
    string,
    { outputQuantity: number | null; outputUnit: string | null }
  >();
  let sourceOutputQuantity: number | null = null;
  let sourceOutputUnit: string | null = null;

  if (isActive) {
    const { dish, version } = await getOwnedDishVersionOrThrow(
      userId,
      cookingSession.dishId,
      cookingSession.dishVersionId,
    );
    const cookableUnits = await buildCookableUnits(userId, dish, version);
    const existingKeys = new Set(cookingSession.units.map(sessionUnitKey));
    addableUnits = cookableUnits
      .filter((unit) => !existingKeys.has(unit.unitKey))
      .map((unit) => ({
        unitKey: unit.unitKey,
        label: unit.label,
        parentPartLabel: unit.partViaTitleSnapshot,
      }));
    for (const unit of cookableUnits) {
      outputByUnitKey.set(unit.unitKey, {
        outputQuantity: unit.outputQuantity,
        outputUnit: unit.outputUnit,
      });
    }
    sourceOutputQuantity = decimalToNumber(version.yieldQuantity);
    sourceOutputUnit = version.yieldUnit;
  }

  const units: CookingModeUnit[] = cookingSession.units.map((unit) => {
    const unitMultiplier = decimalToNumber(unit.scaleFactor) ?? 1;
    const effectiveMultiplier = sessionMultiplier * unitMultiplier;
    const output = outputByUnitKey.get(sessionUnitKey(unit)) ?? {
      outputQuantity: null,
      outputUnit: null,
    };
    return {
      id: unit.id,
      label: unit.label,
      sourceDishTitle: unit.sourceDishTitle,
      sourceDishVersionLabel: unit.sourceDishVersionLabel,
      removedAt: unit.removedAt ? unit.removedAt.toISOString() : null,
      removedAfterProgress: unit.removedAfterProgress,
      completedAt: unit.completedAt ? unit.completedAt.toISOString() : null,
      scaleFactor: unitMultiplier,
      outputQuantity: output.outputQuantity,
      outputUnit: output.outputUnit,
      checklistItems: unit.checklistItems.map((item) => ({
        id: item.id,
        kind: item.kind,
        displayText: item.displayText,
        displayQuantity: item.displayQuantity,
        displayUnit: item.displayUnit,
        checkedAt: item.checkedAt ? item.checkedAt.toISOString() : null,
        conflict: computeChecklistItemConflict(
          decimalToNumber(item.baseQuantity),
          decimalToNumber(item.checkedQuantity),
          effectiveMultiplier,
        ),
      })),
      timers: unit.timers.map((timer) => ({
        id: timer.id,
        name: timer.name,
        durationSeconds: timer.durationSeconds,
        targetEndAt: timer.targetEndAt ? timer.targetEndAt.toISOString() : null,
        remainingSeconds: timer.remainingSeconds,
        state: timer.state,
      })),
    };
  });

  return {
    sessionId: cookingSession.id,
    state: cookingSession.state,
    isActive,
    startedAt: cookingSession.startedAt.toISOString(),
    endedAt: cookingSession.endedAt ? cookingSession.endedAt.toISOString() : null,
    dishId: cookingSession.dishId,
    dishTitle: sourceSummary.dishTitle,
    dishKind: sourceSummary.dishKind,
    versionLabel: sourceSummary.versionLabel,
    versionImageAssetId: sourceSummary.versionImageAssetId,
    units,
    addableUnits,
    sessionScaleFactor: sessionMultiplier,
    sourceOutputQuantity,
    sourceOutputUnit,
    timerSoundEnabled: preference?.timerSoundEnabled ?? true,
    cookingNotes: cookingSession.cookingNotes,
    hasReview: review != null,
  };
}
