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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { sessionId } = await params;
  try {
    const cookingSession = await getOwnedSessionOrThrow(
      session.user.id,
      sessionId,
    );
    const sourceSummary = await getSessionSourceSummary(
      cookingSession.dishId,
      cookingSession.dishVersionId,
    );
    return {
      title: `${sourceSummary.dishTitle} — Cooking mode`,
    };
  } catch {
    return {};
  }
}

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

  // F9 (docs/performance-architecture-audit.md): all three reads depend
  // only on `cookingSession`, already resolved above — one `Promise.all`
  // instead of `sourceSummary` awaited alone ahead of the other two.
  const [sourceSummary, preference, review] = await Promise.all([
    getSessionSourceSummary(
      cookingSession.dishId,
      cookingSession.dishVersionId,
    ),
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

  // Slice 13 metadata-classification correction pass: yield is now
  // editable in place on an already-saved DishVersion (PRODUCT_SPEC.md
  // §54), including the exact Version this session references — so this
  // `isActive` gate is now the boundary that keeps a completed/ended
  // session's display from ever reading a (possibly since-corrected) live
  // yield as if it were the session's own recorded output. Only an
  // IN_PROGRESS session's forward-looking rescale tooling ("Cook for X",
  // "add more units") legitimately reads the Version's current yield —
  // adjusting what's still ahead, never redisplaying what already
  // happened. `cooking.integration.test.ts` proves an in-place yield edit
  // never touches an existing session's own persisted rows.
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
      versionImageAssetId={sourceSummary.versionImageAssetId}
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
