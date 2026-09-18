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
/** One source-level nav entry above Cooking Mode's divider — see
 * `cooking-mode-desktop-layout.tsx`'s `SourceNavList`/`RecipePanel`. A
 * single-source session (every historical session, and any new session
 * with exactly one selected source) has exactly one row here, matching
 * `dishId`/`dishTitle`/etc. above exactly — those top-level fields stay for
 * every existing read site that doesn't need to be multi-source-aware. */
export type CookingModeSourceDto = {
  id: string;
  dishId: string;
  dishKind: DishKindValue | null;
  dishTitle: string;
  versionLabel: string;
  versionImageAssetId: string | null;
  // Live per-source rescale (completion pass, 2026-09-18) — this source's
  // own current scale and authored yield basis, the multi-source
  // counterpart of `sessionScaleFactor`/`sourceOutputQuantity`/
  // `sourceOutputUnit` above. Null (never defaulted to 1 here) means this
  // source's scale was never explicitly set — the "Scale this source"
  // dialog needs that distinction to show a blank field rather than a
  // misleading "1", same convention as `MultiSourceCookingSetup`'s own
  // `sourceScales` state.
  scaleFactor: number | null;
  outputQuantity: number | null;
  outputUnit: string | null;
};

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
  sources: CookingModeSourceDto[];
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

  const [
    sourceSummary,
    sourceSummaries,
    preference,
    review,
    sourceReviewCount,
  ] = await Promise.all([
    getSessionSourceSummary(
      cookingSession.dishId,
      cookingSession.dishVersionId,
    ),
    Promise.all(
      cookingSession.sources.map((s) =>
        getSessionSourceSummary(s.dishId, s.dishVersionId),
      ),
    ),
    prisma.userPreference.findUnique({
      where: { userId },
      select: { timerSoundEnabled: true },
    }),
    prisma.sessionReview.findUnique({
      where: { sessionId: cookingSession.id },
      select: { sessionId: true },
    }),
    // Multi-source Cooking Sessions completion pass — `SessionReview` is
    // never written for a multi-source session (only per-source
    // `CookingSessionSourceReview` rows), so `hasReview` needs this too
    // or "Add Review"/"Edit Review" would never reflect a saved review.
    prisma.cookingSessionSourceReview.count({
      where: { source: { sessionId: cookingSession.id } },
    }),
  ]);

  const sources: CookingModeSourceDto[] = cookingSession.sources.map(
    (s, index) => ({
      id: s.id,
      dishId: s.dishId,
      dishKind: sourceSummaries[index].dishKind,
      dishTitle: sourceSummaries[index].dishTitle,
      versionLabel: sourceSummaries[index].versionLabel,
      versionImageAssetId: sourceSummaries[index].versionImageAssetId,
      scaleFactor: decimalToNumber(s.scaleFactor),
      outputQuantity: sourceSummaries[index].outputQuantity,
      outputUnit: sourceSummaries[index].outputUnit,
    }),
  );
  const sourceTitleById = new Map(sources.map((s) => [s.id, s.dishTitle]));

  const isActive = cookingSession.state === "IN_PROGRESS";
  const sessionMultiplier = decimalToNumber(cookingSession.scaleFactor) ?? 1;

  const addableUnits: CookingModeSessionProps["addableUnits"] = [];
  const outputByUnitKey = new Map<
    string,
    { outputQuantity: number | null; outputUnit: string | null }
  >();
  let sourceOutputQuantity: number | null = null;
  let sourceOutputUnit: string | null = null;

  if (isActive) {
    // Multi-source audit (2026-09-18): "addable" units and each unit's own
    // output basis now come from *every* participating source's own
    // cookable units, not just the session's legacy top-level
    // dishId/dishVersionId mirror (source[0]) — the old version of this
    // block silently hid every other source's own not-yet-added units and
    // showed a blank target-yield for any unit belonging to one.
    const perSourceCookableUnits = await Promise.all(
      cookingSession.sources.map(async (s) => {
        const { dish, version } = await getOwnedDishVersionOrThrow(
          userId,
          s.dishId,
          s.dishVersionId,
        );
        const cookableUnits = await buildCookableUnits(userId, dish, version);
        return {
          cookableUnits,
          outputQuantity: decimalToNumber(version.yieldQuantity),
          outputUnit: version.yieldUnit,
        };
      }),
    );
    const existingKeys = new Set(
      cookingSession.units.flatMap((u) =>
        u.contributions.map((c) => c.sourceUnitKey),
      ),
    );
    const seenAddableKeys = new Set<string>();
    for (const { cookableUnits } of perSourceCookableUnits) {
      for (const unit of cookableUnits) {
        if (
          !existingKeys.has(unit.unitKey) &&
          !seenAddableKeys.has(unit.unitKey)
        ) {
          seenAddableKeys.add(unit.unitKey);
          addableUnits.push({
            unitKey: unit.unitKey,
            label: unit.label,
            parentPartLabel: unit.partViaTitleSnapshot,
          });
        }
        if (!outputByUnitKey.has(unit.unitKey)) {
          outputByUnitKey.set(unit.unitKey, {
            outputQuantity: unit.outputQuantity,
            outputUnit: unit.outputUnit,
          });
        }
      }
    }
    // The "whole-session scale" dialog's own basis — only ever shown for a
    // single-source session (Cooking Mode UI gates it on `sources.length`),
    // so source[0]'s own yield is the correct (and only relevant) value.
    sourceOutputQuantity = perSourceCookableUnits[0]?.outputQuantity ?? null;
    sourceOutputUnit = perSourceCookableUnits[0]?.outputUnit ?? null;
  }

  // Restrained source-attribution treatment (owner spec) — null (nothing
  // rendered) for every single-source session, single-contribution units'
  // own contributing source title otherwise, or every contributing
  // source's title joined for a genuinely consolidated unit.
  const showSourceLabels = sources.length > 1;

  const units: CookingModeUnit[] = cookingSession.units.map((unit) => {
    const unitMultiplier = decimalToNumber(unit.scaleFactor) ?? 1;
    const effectiveMultiplier = sessionMultiplier * unitMultiplier;
    const output = outputByUnitKey.get(sessionUnitKey(unit)) ?? {
      outputQuantity: null,
      outputUnit: null,
    };
    const sourceLabel = showSourceLabels
      ? [
          ...new Set(
            unit.contributions.map(
              (c) => sourceTitleById.get(c.sourceId) ?? c.source.dishId,
            ),
          ),
        ].join(" + ")
      : null;
    // Per-source allocation (owner spec's "preserve accurate per-source
    // allocation information") — only for a genuinely consolidated unit
    // (>1 contribution); scaled by this unit's own current `scaleFactor` so
    // it tracks a live "Scale this unit" change the same way the checklist
    // does, without needing `updateUnitScale` to also touch contribution
    // rows.
    const contributors =
      unit.contributions.length > 1
        ? unit.contributions.map((c) => ({
            sourceDishTitle: sourceTitleById.get(c.sourceId) ?? c.source.dishId,
            contributionQuantity:
              decimalToNumber(c.contributionQuantity) == null
                ? null
                : decimalToNumber(c.contributionQuantity)! * unitMultiplier,
            contributionUnit: c.contributionUnit,
          }))
        : null;
    return {
      id: unit.id,
      label: unit.label,
      sourceDishTitle: unit.sourceDishTitle,
      sourceDishVersionLabel: unit.sourceDishVersionLabel,
      sourceLabel,
      contributors,
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
    endedAt: cookingSession.endedAt
      ? cookingSession.endedAt.toISOString()
      : null,
    dishId: cookingSession.dishId,
    dishTitle: sourceSummary.dishTitle,
    dishKind: sourceSummary.dishKind,
    versionLabel: sourceSummary.versionLabel,
    versionImageAssetId: sourceSummary.versionImageAssetId,
    sources,
    units,
    addableUnits,
    sessionScaleFactor: sessionMultiplier,
    sourceOutputQuantity,
    sourceOutputUnit,
    timerSoundEnabled: preference?.timerSoundEnabled ?? true,
    cookingNotes: cookingSession.cookingNotes,
    hasReview: review != null || sourceReviewCount > 0,
  };
}
