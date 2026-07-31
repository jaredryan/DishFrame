import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
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
import { NotFoundError } from "@/lib/errors";
import {
  CookingModeShell,
  type CookingModeUnit,
} from "@/components/domain/cooking/cooking-mode-shell";

export const metadata: Metadata = { title: "Cooking mode" };

export default async function CookingModePage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { sessionId } = await params;
  const { unit: focusedUnitIdParam } = await searchParams;

  let cookingSession;
  try {
    cookingSession = await getOwnedSessionOrThrow(session.user.id, sessionId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const sourceSummary = await getSessionSourceSummary(
    cookingSession.dishId,
    cookingSession.dishVersionId,
  );
  const [preference, review] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: session.user.id },
      select: { timerSoundEnabled: true },
    }),
    prisma.sessionReview.findUnique({
      where: { sessionId: cookingSession.id },
      select: { sessionId: true },
    }),
  ]);

  const isActive = cookingSession.state === "IN_PROGRESS";
  const sessionMultiplier = decimalToNumber(cookingSession.scaleFactor) ?? 1;

  let addableUnits: Array<{
    unitKey: string;
    label: string;
    parentPartLabel: string | null;
  }> = [];
  const outputByUnitKey = new Map<
    string,
    { outputQuantity: number | null; outputUnit: string | null }
  >();
  let sourceOutputQuantity: number | null = null;
  let sourceOutputUnit: string | null = null;

  if (isActive) {
    const { dish, version } = await getOwnedDishVersionOrThrow(
      session.user.id,
      cookingSession.dishId,
      cookingSession.dishVersionId,
    );
    const cookableUnits = await buildCookableUnits(
      session.user.id,
      dish,
      version,
    );
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

  return (
    <CookingModeShell
      sessionId={cookingSession.id}
      state={cookingSession.state}
      isActive={isActive}
      startedAt={cookingSession.startedAt.toISOString()}
      endedAt={
        cookingSession.endedAt ? cookingSession.endedAt.toISOString() : null
      }
      dishId={cookingSession.dishId}
      dishTitle={sourceSummary.dishTitle}
      dishKind={sourceSummary.dishKind}
      versionLabel={sourceSummary.versionLabel}
      units={units}
      addableUnits={addableUnits}
      sessionScaleFactor={sessionMultiplier}
      sourceOutputQuantity={sourceOutputQuantity}
      sourceOutputUnit={sourceOutputUnit}
      timerSoundEnabled={preference?.timerSoundEnabled ?? true}
      initialFocusedUnitId={focusedUnitIdParam ?? null}
      cookingNotes={cookingSession.cookingNotes}
      hasReview={review != null}
    />
  );
}
