import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  NotFoundError,
  ValidationError,
  ActiveSessionConflictError,
  FinalUnitGuardError,
} from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { scaleQuantity } from "@/lib/units/scaling";
import {
  formatScaledQuantity,
  renderChecklistDisplay,
} from "@/lib/cooking/checklist-render";
import {
  getOwnedDishVersionOrThrow,
  getOwnedSessionOrThrow,
  findActiveSessionForDish,
  findActiveSessionForSourceDishes,
  buildCookableUnits,
  type CookableUnit,
  type OwnedCookingSession,
} from "@/lib/cooking/queries";
import {
  consolidateSources,
  recomputeContributionAggregate,
  type ConsolidatedUnit,
} from "@/lib/cooking/consolidation";
import { versionLabel } from "@/lib/dishes/version-note";
import type {
  StartCookingSessionInput,
  StartMultiSourceCookingSessionInput,
} from "@/lib/cooking/schema";

/**
 * Cooking Session domain functions (ARCHITECTURE_PROPOSAL.md §I's "Begin a
 * Cooking Session" / "Edit an active Cooking Session's plan" / "End a
 * Cooking Session" rows, Gate 4). Framework-agnostic (ARCHITECTURE_PROPOSAL
 * §K.4), same conflict-mapping idiom as `grocery/service.ts`.
 */

const P2002_UNIQUE_CONSTRAINT = "P2002";

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === P2002_UNIQUE_CONSTRAINT
  );
}

function assertActive(session: OwnedCookingSession): void {
  if (session.state !== "IN_PROGRESS") {
    throw new ValidationError("This Cooking Session has already ended.");
  }
}

/**
 * SLICE_9.md refinement pass (2026-07-31) — persists exactly one
 * `CookingSessionPartUsage` row for one selected PART-kind unit, straight
 * from that unit's own fields (`buildCookableUnits`/`buildPartUnitTree`
 * already resolved its exact identity, relation, and authored path when the
 * unit was built). A no-op for a SECTION unit. Never re-walks the source
 * graph here — a nested Part only gets a usage row because it was itself an
 * independently selected session unit, not because some ancestor unit was
 * selected (PRODUCT_SPEC.md §23.4's Section→Part rule, generalized to
 * Part→Part). Called once, inside the same transaction as the unit's own
 * creation, from both `startCookingSession` and `addSessionUnits` — the
 * only two places a `CookingSessionUnit` is ever created.
 */
async function createPartUsageRows(
  tx: Prisma.TransactionClient,
  sessionId: string,
  unitId: string,
  unit: CookableUnit,
): Promise<void> {
  if (unit.kind !== "PART" || !unit.targetDishId || !unit.targetDishVersionId) {
    return;
  }
  await tx.cookingSessionPartUsage.create({
    data: {
      sessionId,
      unitId,
      partDishId: unit.targetDishId,
      partVersionId: unit.targetDishVersionId,
      partTitleSnapshot: unit.label,
      partVersionLabelSnapshot: unit.sourceDishVersionLabel,
      relation: unit.partRelation ?? "DIRECT",
      viaPartTitleSnapshot: unit.partViaTitleSnapshot,
      pathSnapshot: unit.partPathSnapshot ?? unit.label,
    },
  });
}

/**
 * Begins a Cooking Session (PRODUCT_SPEC.md §21.3). The transient Setup
 * selection only ever reaches here as identifiers/order/scale — every
 * label, source title, Version label, and checklist value is re-derived
 * server-side from `buildCookableUnits`, never trusted from the client
 * (§22.4). One transaction creates the session + every selected unit +
 * checklist row (Arch §I); the partial unique index
 * (`one_active_session_per_dish`) is the authoritative concurrency guard —
 * a duplicate "Start cooking" surfaces as `ActiveSessionConflictError`
 * (§26.2), never a raw constraint error.
 */
/**
 * docs/OFFLINE_IMPLEMENTATION_PLAN.md's client-generated-id strategy, applied
 * three levels deep: the session itself, plus (best-effort) its units and
 * their checklist rows. Only the session's own id matters for the "no
 * temporary-id remapping" guarantee (a session started offline needs a
 * stable id immediately, so a checklist-toggle mutation queued moments
 * later can reference it before the start-session mutation has synced) —
 * unit/checklist ids are accepted purely so a client that *also* knows
 * them in advance (from its own replicated "cookable units" template, the
 * same data `buildCookableUnits` below produces) doesn't have its optimistic
 * local rows silently diverge from the eventually-synced ones. If a unit's
 * `checklistItemIds` array doesn't line up 1:1 with what `buildCookableUnits`
 * re-derives for it here (e.g. the Version changed between the client's
 * last template refresh and this sync), those ids are silently ignored for
 * that unit and Prisma's own defaults take over — never a hard failure over
 * a cosmetic id mismatch, since checklist *content* is always authoritatively
 * re-derived server-side regardless (§22.4, see this function's own doc
 * comment above) and was never trusted from the client to begin with.
 */
export type StartCookingSessionClientIds = {
  sessionId?: string;
  units?: Record<string, { unitId?: string; checklistItemIds?: string[] }>;
};

export async function startCookingSession(
  ownerId: string,
  input: StartCookingSessionInput,
  clientIds?: StartCookingSessionClientIds,
) {
  const { dish, version } = await getOwnedDishVersionOrThrow(
    ownerId,
    input.dishId,
    input.dishVersionId,
  );
  const cookableUnits = await buildCookableUnits(ownerId, dish, version);
  const byKey = new Map(cookableUnits.map((unit) => [unit.unitKey, unit]));

  const seen = new Set<string>();
  const selected: Array<{
    unit: (typeof cookableUnits)[number];
    scaleFactor: number | null;
  }> = [];
  for (const entry of input.units) {
    if (seen.has(entry.unitKey)) continue;
    seen.add(entry.unitKey);
    const unit = byKey.get(entry.unitKey);
    if (!unit) {
      throw new ValidationError(
        "One of the selected Sections or Parts is no longer available.",
      );
    }
    selected.push({ unit, scaleFactor: entry.scaleFactor ?? null });
  }
  if (selected.length === 0) {
    throw new ValidationError("Select at least one Section or Part to cook.");
  }

  const sessionScale = input.scaleFactor ?? null;

  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.cookingSession.create({
        data: {
          ...(clientIds?.sessionId ? { id: clientIds.sessionId } : {}),
          ownerId,
          dishId: input.dishId,
          dishVersionId: input.dishVersionId,
          scaleFactor: sessionScale,
          originalScaleFactor: sessionScale,
        },
      });

      // Multi-source Cooking Sessions (2026-09-17) — every session, single-
      // or multi-source, gets exactly one CookingSessionSource row per
      // participating dish, so `startMultiSourceCookingSession`'s own
      // conflict detection (which only ever queries this table) correctly
      // sees a session started through this older, still-primary
      // single-source path too. Purely additive: nothing else in this
      // function changes.
      const sourceRow = await tx.cookingSessionSource.create({
        data: {
          sessionId: session.id,
          position: 0,
          dishId: input.dishId,
          dishVersionId: input.dishVersionId,
          scaleFactor: sessionScale,
          originalScaleFactor: sessionScale,
        },
      });

      for (const [index, { unit, scaleFactor }] of selected.entries()) {
        const effectiveMultiplier = (sessionScale ?? 1) * (scaleFactor ?? 1);
        const unitClientIds = clientIds?.units?.[unit.unitKey];
        const unitRow = await tx.cookingSessionUnit.create({
          data: {
            ...(unitClientIds?.unitId ? { id: unitClientIds.unitId } : {}),
            sessionId: session.id,
            position: index,
            scaleFactor,
            originalScaleFactor: scaleFactor,
            label: unit.label,
            sourceDishTitle: unit.sourceDishTitle,
            sourceDishVersionLabel: unit.sourceDishVersionLabel,
            sourceSectionLineageId: unit.sourceSectionLineageId,
            sourcePartLinkLineageId: unit.sourcePartLinkLineageId,
          },
        });

        // Best-effort positional zip against the client's own cached
        // template — only trusted when the count matches (see this
        // function's doc comment above).
        const checklistIds =
          unitClientIds?.checklistItemIds?.length === unit.checklist.length
            ? unitClientIds.checklistItemIds
            : null;

        for (const [itemIndex, raw] of unit.checklist.entries()) {
          const display = renderChecklistDisplay(raw, effectiveMultiplier);
          await tx.cookingSessionChecklistItem.create({
            data: {
              ...(checklistIds ? { id: checklistIds[itemIndex] } : {}),
              unitId: unitRow.id,
              kind: raw.kind,
              displayText: display.displayText,
              displayQuantity: display.displayQuantity,
              displayUnit: display.displayUnit,
              baseQuantity: display.baseQuantity,
              baseQuantityEnd: display.baseQuantityEnd,
              isApproximate: display.isApproximate,
              sourceLineageId: raw.sourceLineageId,
            },
          });
        }

        await createPartUsageRows(tx, session.id, unitRow.id, unit);

        // Multi-source Cooking Sessions (2026-09-17) — every unit, in every
        // session, gets exactly one CookingSessionUnitContribution row
        // (this source's own, wholly-owning one) so the multi-source-aware
        // read/write paths (`addSessionUnits`, `session-view.ts`'s
        // addable-units computation) don't need a separate code path for a
        // unit created through this older, still-primary single-source
        // function. `multiplier` mirrors this unit's own per-unit
        // `scaleFactor` composed with the session's scale — the same
        // `effectiveMultiplier` already used to render its checklist above.
        await tx.cookingSessionUnitContribution.create({
          data: {
            unitId: unitRow.id,
            sourceId: sourceRow.id,
            sourceUnitKey: unit.unitKey,
            multiplier: effectiveMultiplier,
            contributionQuantity:
              unit.outputQuantity == null
                ? null
                : unit.outputQuantity *
                  unit.linkMultiplier *
                  effectiveMultiplier,
            contributionUnit: unit.outputUnit,
          },
        });
      }

      return session;
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const existing = await findActiveSessionForDish(ownerId, input.dishId);
      throw new ActiveSessionConflictError(existing?.id ?? null);
    }
    throw error;
  }
}

/**
 * Multi-source Cooking Sessions (owner spec, 2026-09-17) — the generic
 * Start Cooking picker's counterpart to `startCookingSession` above, which
 * stays completely untouched for every existing single-source entry point
 * (direct per-Recipe/Part "Prepare to cook," `mealplans/service.ts`'s
 * `startSessionFromEntry`). One transaction creates the `CookingSession` +
 * one `CookingSessionSource` row per selected top-level source + every
 * selected *consolidated* unit (see `consolidateSources`) + its checklist +
 * one `CookingSessionUnitContribution`/`CookingSessionPartUsage` pair per
 * contributing source — atomic exactly like `startCookingSession`: any
 * source dish already active elsewhere throws before any row of this new
 * session is visible (the partial unique index `one_active_session_per_dish_source`
 * fires inside the same transaction, which the caught `P2002` maps to
 * `ActiveSessionConflictError`, never a partially-created session).
 *
 * `CookingSession.dishId`/`dishVersionId`/`scaleFactor`/`originalScaleFactor`
 * mirror `sources[0]` (position 0) purely for the many existing read sites
 * that still read those columns directly — never authoritative for this
 * session; `sources` is (see schema.prisma's `CookingSession` doc comment).
 */
/** Offline start (docs/OFFLINE_IMPLEMENTATION_PLAN.md's client-generated-id
 * strategy) needs the session's own id immediately, same rationale as
 * `StartCookingSessionClientIds` above — a follow-up mutation queued
 * moments later (e.g. ending the session) can reference it before this
 * creation mutation has synced. Per-unit/per-source client ids aren't
 * threaded through here: the offline creation path never renders a rich
 * optimistic preview to begin with (`offline-start.ts`'s own `optimisticDoc`
 * is a no-op), so there's nothing yet that could diverge from them. */
export async function startMultiSourceCookingSession(
  ownerId: string,
  input: StartMultiSourceCookingSessionInput,
  clientIds?: { sessionId?: string },
) {
  const dishIds = input.sources.map((s) => s.dishId);
  if (new Set(dishIds).size !== dishIds.length) {
    throw new ValidationError(
      "Each Recipe or Part can only be selected once per session.",
    );
  }

  const resolvedSources = await Promise.all(
    input.sources.map((s) =>
      getOwnedDishVersionOrThrow(ownerId, s.dishId, s.dishVersionId),
    ),
  );
  const cookableUnitsPerSource = await Promise.all(
    resolvedSources.map(({ dish, version }) =>
      buildCookableUnits(ownerId, dish, version),
    ),
  );

  const consolidated = consolidateSources(
    input.sources.map((s, index) => ({
      cookableUnits: cookableUnitsPerSource[index],
      scaleFactor: s.scaleFactor ?? null,
    })),
  );
  const byMergeKey = new Map(consolidated.map((u) => [u.mergeKey, u]));

  const seen = new Set<string>();
  const selected: Array<{
    unit: ConsolidatedUnit;
    scaleFactor: number | null;
  }> = [];
  for (const entry of input.units) {
    if (seen.has(entry.mergeKey)) continue;
    seen.add(entry.mergeKey);
    const unit = byMergeKey.get(entry.mergeKey);
    if (!unit) {
      throw new ValidationError(
        "One of the selected Sections or Parts is no longer available.",
      );
    }
    selected.push({ unit, scaleFactor: entry.scaleFactor ?? null });
  }
  if (selected.length === 0) {
    throw new ValidationError("Select at least one Section or Part to cook.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const primary = input.sources[0];
      const session = await tx.cookingSession.create({
        data: {
          ...(clientIds?.sessionId ? { id: clientIds.sessionId } : {}),
          ownerId,
          dishId: primary.dishId,
          dishVersionId: primary.dishVersionId,
          scaleFactor: primary.scaleFactor ?? null,
          originalScaleFactor: primary.scaleFactor ?? null,
        },
      });

      const sourceRows: { id: string }[] = [];
      for (const [index, s] of input.sources.entries()) {
        sourceRows.push(
          await tx.cookingSessionSource.create({
            data: {
              sessionId: session.id,
              position: index,
              dishId: s.dishId,
              dishVersionId: s.dishVersionId,
              scaleFactor: s.scaleFactor ?? null,
              originalScaleFactor: s.scaleFactor ?? null,
            },
          }),
        );
      }

      for (const [
        index,
        { unit: consolidatedUnit, scaleFactor },
      ] of selected.entries()) {
        const unit = consolidatedUnit.unit;
        const unitRow = await tx.cookingSessionUnit.create({
          data: {
            sessionId: session.id,
            position: index,
            scaleFactor,
            originalScaleFactor: scaleFactor,
            label: unit.label,
            sourceDishTitle: unit.sourceDishTitle,
            sourceDishVersionLabel: unit.sourceDishVersionLabel,
            sourceSectionLineageId: unit.sourceSectionLineageId,
            sourcePartLinkLineageId: unit.sourcePartLinkLineageId,
          },
        });

        // Completion pass fix (2026-09-18): an *ordinary* (single-
        // contribution) unit's checklist quantities were previously
        // rendered using only the per-unit scale, silently ignoring the
        // owning source's own configured scale — a Chicken Bowl scaled 2x
        // never actually scaled its own Sections' ingredients. A
        // *consolidated* unit's checklist is already source-scale-weighted
        // by `aggregateChecklist` (see consolidation.ts), so multiplying by
        // source scale again here would double-count it — only an ordinary
        // unit needs it applied at this step.
        const owningSourceScale =
          consolidatedUnit.contributions.length === 1
            ? (input.sources[consolidatedUnit.contributions[0].sourceIndex]
                .scaleFactor ?? 1)
            : 1;
        const checklistMultiplier = owningSourceScale * (scaleFactor ?? 1);

        for (const raw of unit.checklist) {
          const display = renderChecklistDisplay(raw, checklistMultiplier);
          await tx.cookingSessionChecklistItem.create({
            data: {
              unitId: unitRow.id,
              kind: raw.kind,
              displayText: display.displayText,
              displayQuantity: display.displayQuantity,
              displayUnit: display.displayUnit,
              baseQuantity: display.baseQuantity,
              baseQuantityEnd: display.baseQuantityEnd,
              isApproximate: display.isApproximate,
              sourceLineageId: raw.sourceLineageId,
            },
          });
        }

        for (const contribution of consolidatedUnit.contributions) {
          const sourceRow = sourceRows[contribution.sourceIndex];
          await tx.cookingSessionUnitContribution.create({
            data: {
              unitId: unitRow.id,
              sourceId: sourceRow.id,
              sourceUnitKey: contribution.sourceUnitKey,
              multiplier: contribution.weight,
              contributionQuantity: contribution.contributionQuantity,
              contributionUnit: contribution.contributionUnit,
            },
          });

          // Generalizes createPartUsageRows above to one row per
          // contributing source for a consolidated Part, rather than one
          // per merged unit — see CookingSessionUnitContribution's own
          // schema.prisma doc comment.
          const contributedUnit = contribution.unit;
          if (
            contributedUnit.kind === "PART" &&
            contributedUnit.targetDishId &&
            contributedUnit.targetDishVersionId
          ) {
            await tx.cookingSessionPartUsage.create({
              data: {
                sessionId: session.id,
                unitId: unitRow.id,
                partDishId: contributedUnit.targetDishId,
                partVersionId: contributedUnit.targetDishVersionId,
                partTitleSnapshot: contributedUnit.label,
                partVersionLabelSnapshot:
                  contributedUnit.sourceDishVersionLabel,
                relation: contributedUnit.partRelation ?? "DIRECT",
                viaPartTitleSnapshot: contributedUnit.partViaTitleSnapshot,
                pathSnapshot:
                  contributedUnit.partPathSnapshot ?? contributedUnit.label,
              },
            });
          }
        }
      }

      return session;
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const conflict = await findActiveSessionForSourceDishes(ownerId, dishIds);
      const conflictingSource = resolvedSources.find(
        (_, i) => input.sources[i].dishId === conflict?.dishId,
      );
      const message = conflictingSource
        ? `"${conflictingSource.dish.currentTitle ?? "This item"}" is already being cooked in another session.`
        : undefined;
      throw new ActiveSessionConflictError(
        conflict?.sessionId ?? null,
        message,
      );
    }
    throw error;
  }
}

/**
 * PRODUCT_SPEC.md §27.1 add: only units eligible from the session's own
 * pinned source Version (re-derived fresh, same rule as session-start) and
 * not already present as a row (active or removed) may be added. Newly
 * added units start with no per-unit scale override (mid-session scaling
 * is Slice 8) — checklist rows reflect only the session's existing overall
 * scale.
 */
export async function addSessionUnits(
  ownerId: string,
  sessionId: string,
  unitKeys: string[],
  // See `StartCookingSessionClientIds`'s doc comment — same best-effort,
  // positional, count-must-match contract, keyed by unitKey here too.
  clientIds?: Record<string, { unitId?: string; checklistItemIds?: string[] }>,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  // Multi-source audit (2026-09-18): searches every participating source's
  // own cookable units, not just the session's legacy top-level
  // dishId/dishVersionId mirror (source[0]) — the old single-source-only
  // version of this function silently no-opped when asked to add a unit
  // belonging to any other source. A single-source session has exactly one
  // row in `session.sources`, so this is a strict generalization.
  const perSource = await Promise.all(
    session.sources.map(async (s) => {
      const { dish, version } = await getOwnedDishVersionOrThrow(
        ownerId,
        s.dishId,
        s.dishVersionId,
      );
      const cookableUnits = await buildCookableUnits(ownerId, dish, version);
      return { source: s, cookableUnits };
    }),
  );
  // unitKey is only ever generated from one source's own local lineage id,
  // so at most one source can ever offer a given key — first match wins.
  const byKey = new Map<
    string,
    { source: (typeof session.sources)[number]; unit: CookableUnit }
  >();
  for (const { source, cookableUnits } of perSource) {
    for (const unit of cookableUnits) {
      if (!byKey.has(unit.unitKey)) byKey.set(unit.unitKey, { source, unit });
    }
  }

  const existingKeys = new Set(
    session.units.flatMap((u) => u.contributions.map((c) => c.sourceUnitKey)),
  );
  const toAdd = [...new Set(unitKeys)].filter(
    (key) => byKey.has(key) && !existingKeys.has(key),
  );
  if (toAdd.length === 0) return;

  // Shared-Part consolidation (owner spec, 2026-09-17): a requested unit
  // whose exact Part+Version already has an active unit in this session
  // (contributed by a different source) gets a new contribution on *that*
  // unit instead of a second, duplicate CookingSessionUnit.
  const existingPartUsage = await prisma.cookingSessionPartUsage.findMany({
    where: { sessionId, unit: { removedAt: null } },
    select: { unitId: true, partDishId: true, partVersionId: true },
  });
  const existingUnitIdByTarget = new Map(
    existingPartUsage
      .filter((u) => u.partDishId && u.partVersionId)
      .map((u) => [`${u.partDishId}:${u.partVersionId}`, u.unitId]),
  );

  const maxPosition = session.units.reduce(
    (max, u) => Math.max(max, u.position),
    -1,
  );

  await prisma.$transaction(async (tx) => {
    let offset = 0;
    for (const key of toAdd) {
      const { source, unit } = byKey.get(key)!;
      const sourceScale = decimalToNumber(source.scaleFactor) ?? 1;
      const targetKey =
        unit.targetDishId && unit.targetDishVersionId
          ? `${unit.targetDishId}:${unit.targetDishVersionId}`
          : null;
      const existingUnitId = targetKey
        ? existingUnitIdByTarget.get(targetKey)
        : undefined;

      const contributionQuantity =
        unit.outputQuantity == null
          ? null
          : unit.outputQuantity * unit.linkMultiplier * sourceScale;

      if (existingUnitId) {
        await tx.cookingSessionUnitContribution.create({
          data: {
            unitId: existingUnitId,
            sourceId: source.id,
            sourceUnitKey: unit.unitKey,
            multiplier: sourceScale,
            contributionQuantity,
            contributionUnit: unit.outputUnit,
          },
        });
        await createPartUsageRows(tx, sessionId, existingUnitId, unit);

        // Re-aggregates the now-shared unit's checklist from every
        // contribution's current source scale, exactly like
        // `updateSourceScale`'s own recompute — never resets progress
        // (only baseQuantity/displayQuantity are touched, in place).
        const existingUnit = session.units.find(
          (u) => u.id === existingUnitId,
        )!;
        const otherContributions = await Promise.all(
          existingUnit.contributions.map(async (c) => {
            const contribSource =
              c.sourceId === source.id
                ? source
                : session.sources.find((s) => s.id === c.sourceId)!;
            const { dish, version } = await getOwnedDishVersionOrThrow(
              ownerId,
              contribSource.dishId,
              contribSource.dishVersionId,
            );
            const rawUnits = await buildCookableUnits(ownerId, dish, version);
            const rawUnit = rawUnits.find((u) => u.unitKey === c.sourceUnitKey);
            return rawUnit
              ? {
                  unit: rawUnit,
                  weight: decimalToNumber(contribSource.scaleFactor) ?? 1,
                }
              : null;
          }),
        );
        const aggregate = recomputeContributionAggregate([
          ...otherContributions.filter(
            (c): c is { unit: CookableUnit; weight: number } => c != null,
          ),
          { unit, weight: sourceScale },
        ]);
        const unitMultiplier = decimalToNumber(existingUnit.scaleFactor) ?? 1;
        const updates = existingUnit.checklistItems
          .map((item) => {
            const aggRaw = aggregate.checklist.find(
              (r) => r.sourceLineageId === item.sourceLineageId,
            );
            if (
              !aggRaw ||
              aggRaw.kind !== "INGREDIENT" ||
              aggRaw.quantity == null
            ) {
              return null;
            }
            return {
              id: item.id,
              baseQuantity: aggRaw.quantity,
              baseQuantityEnd: aggRaw.quantityEnd,
              displayQuantity: formatScaledQuantity(
                aggRaw.quantity,
                aggRaw.quantityEnd,
                item.isApproximate,
                unitMultiplier,
              ),
            };
          })
          .filter((u): u is NonNullable<typeof u> => u != null);
        await applyChecklistBaseAndDisplayUpdates(tx, updates);
        continue;
      }

      const unitClientIds = clientIds?.[key];
      const unitRow = await tx.cookingSessionUnit.create({
        data: {
          ...(unitClientIds?.unitId ? { id: unitClientIds.unitId } : {}),
          sessionId,
          position: maxPosition + 1 + offset,
          label: unit.label,
          sourceDishTitle: unit.sourceDishTitle,
          sourceDishVersionLabel: unit.sourceDishVersionLabel,
          sourceSectionLineageId: unit.sourceSectionLineageId,
          sourcePartLinkLineageId: unit.sourcePartLinkLineageId,
        },
      });
      offset += 1;
      const checklistIds =
        unitClientIds?.checklistItemIds?.length === unit.checklist.length
          ? unitClientIds.checklistItemIds
          : null;
      for (const [itemIndex, raw] of unit.checklist.entries()) {
        const display = renderChecklistDisplay(raw, sourceScale);
        await tx.cookingSessionChecklistItem.create({
          data: {
            ...(checklistIds ? { id: checklistIds[itemIndex] } : {}),
            unitId: unitRow.id,
            kind: raw.kind,
            displayText: display.displayText,
            displayQuantity: display.displayQuantity,
            displayUnit: display.displayUnit,
            baseQuantity: display.baseQuantity,
            baseQuantityEnd: display.baseQuantityEnd,
            isApproximate: display.isApproximate,
            sourceLineageId: raw.sourceLineageId,
          },
        });
      }

      await tx.cookingSessionUnitContribution.create({
        data: {
          unitId: unitRow.id,
          sourceId: source.id,
          sourceUnitKey: unit.unitKey,
          multiplier: sourceScale,
          contributionQuantity,
          contributionUnit: unit.outputUnit,
        },
      });
      await createPartUsageRows(tx, sessionId, unitRow.id, unit);
    }
    await tx.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  });
}

/**
 * PRODUCT_SPEC.md §27.2/§27.3/§27.4: removal is a clean delete from the
 * *active* view (`removedAt`), never a row delete — evidence (checked
 * items, timers, completion) survives regardless. The final-unit guard
 * re-checks the active count *inside* a transaction holding a row lock on
 * the parent `CookingSession` (`SELECT ... FOR UPDATE`), not from the
 * pre-fetched `session` snapshot above — a plain read-then-write (the
 * original Slice 7 approach) let two near-simultaneous removals of the last
 * two units both read `activeCount > 1` and both commit, silently emptying
 * the session under real concurrency. The lock serializes concurrent
 * removals for the same session so only one can win the guard check.
 */
export async function removeSessionUnit(
  ownerId: string,
  sessionId: string,
  unitId: string,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const unit = session.units.find((u) => u.id === unitId);
  if (!unit) throw new NotFoundError("Unit not found in this session.");
  if (unit.removedAt) return;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CookingSession" WHERE id = ${sessionId} FOR UPDATE`;

    const freshUnit = await tx.cookingSessionUnit.findFirst({
      where: { id: unitId, sessionId },
      include: { checklistItems: true, timers: true },
    });
    if (!freshUnit) throw new NotFoundError("Unit not found in this session.");
    if (freshUnit.removedAt) return;

    const activeCount = await tx.cookingSessionUnit.count({
      where: { sessionId, removedAt: null },
    });
    if (activeCount <= 1) {
      throw new FinalUnitGuardError();
    }

    const hasProgress =
      freshUnit.completedAt != null ||
      freshUnit.checklistItems.some((item) => item.checkedAt != null) ||
      freshUnit.timers.length > 0;

    await tx.cookingSessionUnit.update({
      where: { id: unitId },
      data: { removedAt: new Date(), removedAfterProgress: hasProgress },
    });
    await tx.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  });
}

export async function restoreSessionUnit(
  ownerId: string,
  sessionId: string,
  unitId: string,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const unit = session.units.find((u) => u.id === unitId);
  if (!unit) throw new NotFoundError("Unit not found in this session.");
  if (!unit.removedAt) return;

  await prisma.$transaction([
    prisma.cookingSessionUnit.update({
      where: { id: unitId },
      data: { removedAt: null },
    }),
    prisma.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

/** PRODUCT_SPEC.md §27.1 reorder — scoped to the currently active plan; the
 * provided id set must exactly match the session's active units, so a
 * stale client can't silently drop or duplicate a unit via reorder. */
export async function reorderSessionUnits(
  ownerId: string,
  sessionId: string,
  orderedUnitIds: string[],
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const activeIds = new Set(
    session.units.filter((u) => !u.removedAt).map((u) => u.id),
  );
  const providedIds = new Set(orderedUnitIds);
  const matches =
    activeIds.size === providedIds.size &&
    [...activeIds].every((id) => providedIds.has(id));
  if (!matches) {
    throw new ValidationError(
      "The active plan changed. Please refresh and try again.",
    );
  }

  await prisma.$transaction([
    ...orderedUnitIds.map((id, index) =>
      prisma.cookingSessionUnit.update({
        where: { id },
        data: { position: index },
      }),
    ),
    prisma.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

/**
 * SLICE_9.md refinement pass (2026-07-31) — one-time backfill for
 * `CookingSessionUnit` rows created before the durable Part-use log
 * existed. Idempotent: only considers a PART-kind unit with zero
 * `CookingSessionPartUsage` rows, so it is safe to run more than once (or
 * resume after an interruption) without ever creating duplicates. Every
 * candidate unit predates the independently-selectable nested-Part model
 * (a session with a nested unit already gets its usage row written at
 * creation time, so it is never a zero-usage candidate here) — so a
 * candidate's `sourcePartLinkLineageId` always resolves against the
 * session's own top-level `dishVersionId` and always reconstructs as
 * `DIRECT`, never `NESTED`. Reconstructs only where the source is still
 * resolvable — the unit's own `PartLink` must still be `LIVE` with a live
 * target. A session whose Part was already permanently deleted before this
 * backfill runs has nothing left to reconstruct from and is left as-is —
 * its own `CookingSession`/`CookingSessionUnit` rows are never touched or
 * discarded, only the derived usage-log join can't be populated for that
 * one unit.
 */
export async function backfillCookingSessionPartUsage(): Promise<{
  scanned: number;
  created: number;
}> {
  const candidateUnits = await prisma.cookingSessionUnit.findMany({
    where: {
      sourcePartLinkLineageId: { not: null },
      partUsages: { none: {} },
    },
    select: {
      id: true,
      sourcePartLinkLineageId: true,
      session: {
        select: {
          id: true,
          ownerId: true,
          dishId: true,
          dishVersionId: true,
        },
      },
    },
  });

  let created = 0;
  for (const unit of candidateUnits) {
    const rootLink = await prisma.partLink.findFirst({
      where: {
        containerVersionId: unit.session.dishVersionId,
        lineageId: unit.sourcePartLinkLineageId!,
        linkState: "LIVE",
      },
      select: { targetDishId: true, targetDishVersionId: true },
    });
    if (!rootLink?.targetDishId || !rootLink.targetDishVersionId) continue;

    const targetDish = await prisma.dish.findFirst({
      where: {
        id: rootLink.targetDishId,
        ownerId: unit.session.ownerId,
        kind: "PART",
      },
      select: { currentTitle: true },
    });
    if (!targetDish) continue;

    const targetVersion = await prisma.dishVersion.findFirst({
      where: {
        id: rootLink.targetDishVersionId,
        dishId: rootLink.targetDishId,
      },
      select: { majorVersion: true, minorVersion: true },
    });
    if (!targetVersion) continue;

    const rootDish = await prisma.dish.findFirst({
      where: { id: unit.session.dishId },
      select: { currentTitle: true },
    });
    const title = targetDish.currentTitle ?? "Untitled Part";

    await prisma.cookingSessionPartUsage.create({
      data: {
        sessionId: unit.session.id,
        unitId: unit.id,
        partDishId: rootLink.targetDishId,
        partVersionId: rootLink.targetDishVersionId,
        partTitleSnapshot: title,
        partVersionLabelSnapshot: versionLabel(
          targetVersion.majorVersion,
          targetVersion.minorVersion,
        ),
        relation: "DIRECT",
        viaPartTitleSnapshot: null,
        pathSnapshot: `${rootDish?.currentTitle ?? "Untitled"} → ${title}`,
      },
    });
    created += 1;
  }

  return { scanned: candidateUnits.length, created };
}

/**
 * PRODUCT_SPEC.md §25/§30: Finish or End early. Ended sessions never
 * silently return to In progress — this is the only lifecycle-state
 * transition, and it is rejected outright once already ended.
 *
 * §30.3/§30.4: both outcomes "stop active timer countdowns" while
 * "preserving timer state" — every still-RUNNING timer is frozen into
 * PAUSED with its remaining time snapshotted at `endedAt`, rather than left
 * counting down against a target time a now-ended session can no longer
 * meaningfully represent.
 */
export async function endCookingSession(
  ownerId: string,
  sessionId: string,
  outcome: "COMPLETED" | "ENDED_EARLY",
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const endedAt = new Date();
  const rawElapsedSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
  );

  return prisma.$transaction(async (tx) => {
    for (const unit of session.units) {
      for (const timer of unit.timers) {
        if (timer.state !== "RUNNING" || !timer.targetEndAt) continue;
        const remainingSeconds = Math.max(
          0,
          Math.round((timer.targetEndAt.getTime() - endedAt.getTime()) / 1000),
        );
        await tx.timer.update({
          where: { id: timer.id },
          data: { state: "PAUSED", remainingSeconds, targetEndAt: null },
        });
      }
    }

    // BUILD_PLAN.md Slice 15, PRODUCT_SPEC.md §78: a Completed session marks
    // its linked Meal Plan entry Cooked; an Ended-early session does not.
    // A plain `MealPlanEntry` join-table update, not a `mealplans` import —
    // this closes the loop the schema's `linkedSessionId` relation already
    // models (Slice 2), it doesn't introduce a new cross-module dependency.
    if (outcome === "COMPLETED") {
      await tx.mealPlanEntry.updateMany({
        where: { linkedSessionId: sessionId, status: "IN_PROGRESS" },
        data: { status: "COOKED" },
      });
    }

    // Multi-source Cooking Sessions (2026-09-17) — releases every one of
    // this session's source dishes from the partial unique index
    // `one_active_session_per_dish_source` the moment the session ends.
    // Without this, an ended session's source rows would stay `isActive`
    // forever, permanently blocking any future session on that dish —
    // there is no reactivation path (`assertActive` above already rejects
    // ending a session twice), so this is the only place this ever needs
    // to run.
    await tx.cookingSessionSource.updateMany({
      where: { sessionId },
      data: { isActive: false },
    });

    return tx.cookingSession.update({
      where: { id: sessionId },
      data: { state: outcome, endedAt, rawElapsedSeconds },
    });
  });
}

/**
 * PRODUCT_SPEC.md §27.4's "Delete session" carve-out. Reachable through the
 * final-unit guard's own choice on an active session, and (Slice 22 logged-
 * in polish pass) as a row action on the Cook page's Completed sessions. A
 * plain cascade delete (units/checklist/timers/review/ratings all
 * `onDelete: Cascade` off `CookingSession`, schema.prisma).
 */
export async function deleteCookingSession(ownerId: string, sessionId: string) {
  await getOwnedSessionOrThrow(ownerId, sessionId);
  await prisma.cookingSession.delete({ where: { id: sessionId } });
}

// ============================================================================
// Slice 8 — checklist checkoffs, unit completion, mid-session scaling, timers
// ============================================================================

function findOwnedUnit(session: OwnedCookingSession, unitId: string) {
  return session.units.find((u) => u.id === unitId) ?? null;
}

function findOwnedChecklistItem(session: OwnedCookingSession, itemId: string) {
  for (const unit of session.units) {
    const item = unit.checklistItems.find((i) => i.id === itemId);
    if (item) return { unit, item };
  }
  return null;
}

function findOwnedTimer(session: OwnedCookingSession, timerId: string) {
  for (const unit of session.units) {
    const timer = unit.timers.find((t) => t.id === timerId);
    if (timer) return { unit, timer };
  }
  return null;
}

/**
 * PRODUCT_SPEC.md §28.1: checkoffs belong only to the session, are always
 * optional, and persist across navigation/refresh. Checking an item snapshots
 * its current scaled quantity into `checkedQuantity` — the reference value
 * `updateSessionScale`/`updateUnitScale` later compare a fresh scale against
 * to flag a progress discrepancy (§24.5); unchecking clears it, since the
 * item is no longer asserting any particular amount was added.
 */
export async function toggleChecklistItem(
  ownerId: string,
  sessionId: string,
  itemId: string,
  checked: boolean,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const found = findOwnedChecklistItem(session, itemId);
  if (!found)
    throw new NotFoundError("Checklist item not found in this session.");
  const { unit, item } = found;

  if (!checked) {
    await prisma.cookingSessionChecklistItem.update({
      where: { id: itemId },
      data: { checkedAt: null, checkedQuantity: null },
    });
  } else {
    const effectiveMultiplier =
      (decimalToNumber(session.scaleFactor) ?? 1) *
      (decimalToNumber(unit.scaleFactor) ?? 1);
    const baseQuantity = decimalToNumber(item.baseQuantity);
    const checkedQuantity =
      baseQuantity != null
        ? scaleQuantity(baseQuantity, effectiveMultiplier)
        : null;
    await prisma.cookingSessionChecklistItem.update({
      where: { id: itemId },
      data: { checkedAt: new Date(), checkedQuantity },
    });
  }

  await prisma.cookingSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });
}

/**
 * PRODUCT_SPEC.md §28.3: completing a unit checks off whatever the user left
 * unchecked (never requires checking every item by hand) and marks the unit
 * complete; reversible while the session stays In progress (`completed:
 * false` simply clears `completedAt` — it deliberately does not un-check
 * items, since checkoffs are informational evidence of what happened, not a
 * transaction this reverses).
 */
export async function setUnitCompletion(
  ownerId: string,
  sessionId: string,
  unitId: string,
  completed: boolean,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const unit = findOwnedUnit(session, unitId);
  if (!unit) throw new NotFoundError("Unit not found in this session.");

  if (!completed) {
    await prisma.$transaction([
      prisma.cookingSessionUnit.update({
        where: { id: unitId },
        data: { completedAt: null },
      }),
      prisma.cookingSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return;
  }

  const effectiveMultiplier =
    (decimalToNumber(session.scaleFactor) ?? 1) *
    (decimalToNumber(unit.scaleFactor) ?? 1);
  const now = new Date();

  await prisma.$transaction([
    ...unit.checklistItems
      .filter((item) => item.checkedAt == null)
      .map((item) => {
        const baseQuantity = decimalToNumber(item.baseQuantity);
        const checkedQuantity =
          baseQuantity != null
            ? scaleQuantity(baseQuantity, effectiveMultiplier)
            : null;
        return prisma.cookingSessionChecklistItem.update({
          where: { id: item.id },
          data: { checkedAt: now, checkedQuantity },
        });
      }),
    prisma.cookingSessionUnit.update({
      where: { id: unitId },
      data: { completedAt: now },
    }),
    prisma.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

/**
 * Recalculates every ingredient checklist row's `displayQuantity` for one
 * unit at a new effective multiplier, reading from the structured `base*`
 * fields rather than re-parsing any formatted string (Slice 8 correction).
 * Free-text/quantity-less rows (`baseQuantity == null`) are left untouched,
 * matching §24.3's "leaves free-text quantities unchanged."
 *
 * F8 (docs/performance-architecture-audit.md): pure — builds the rows to
 * write without writing them, so a caller rescaling several units (a
 * whole-session rescale) can collect every unit's rows into one batch
 * instead of writing unit-by-unit.
 */
function computeChecklistDisplayUpdates(
  checklistItems: OwnedCookingSession["units"][number]["checklistItems"],
  effectiveMultiplier: number,
): { id: string; displayQuantity: string }[] {
  const updates: { id: string; displayQuantity: string }[] = [];
  for (const item of checklistItems) {
    const baseQuantity = decimalToNumber(item.baseQuantity);
    if (baseQuantity == null) continue;
    const baseQuantityEnd = decimalToNumber(item.baseQuantityEnd);
    updates.push({
      id: item.id,
      displayQuantity: formatScaledQuantity(
        baseQuantity,
        baseQuantityEnd,
        item.isApproximate,
        effectiveMultiplier,
      ),
    });
  }
  return updates;
}

/**
 * F8: one `UPDATE ... FROM (VALUES ...)` statement instead of one
 * individually-awaited `update()` per checklist item — each row's
 * `displayQuantity` differs, so a plain `updateMany` can't express this in
 * one statement. Values are passed as query parameters via `Prisma.sql`
 * (never string-concatenated), so this is parameterized exactly like any
 * other Prisma query.
 */
async function applyChecklistDisplayUpdates(
  tx: Prisma.TransactionClient,
  updates: { id: string; displayQuantity: string }[],
): Promise<void> {
  if (updates.length === 0) return;
  await tx.$executeRaw`
    UPDATE "CookingSessionChecklistItem" AS c
    SET "displayQuantity" = v.display_quantity
    FROM (VALUES ${Prisma.join(
      updates.map(
        (u) => Prisma.sql`(${u.id}::text, ${u.displayQuantity}::text)`,
      ),
    )}) AS v(id, display_quantity)
    WHERE c.id = v.id
  `;
}

/**
 * PRODUCT_SPEC.md §24.4: whole-session scale change. `originalScaleFactor`
 * is never touched after creation (Slice 8 correction) — only the current/
 * final `scaleFactor` mutates. Every active unit's checklist is recalculated
 * against its own per-unit override composed with the new session scale;
 * removed units are skipped (nothing to show).
 */
export async function updateSessionScale(
  ownerId: string,
  sessionId: string,
  scaleFactor: number | null,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  // F8: every active unit's checklist rows collected into one batch up
  // front — previously one individually-awaited `update()` per checklist
  // item, across every unit, all sequential inside the transaction.
  const updates = session.units
    .filter((unit) => !unit.removedAt)
    .flatMap((unit) => {
      const unitMultiplier = decimalToNumber(unit.scaleFactor) ?? 1;
      return computeChecklistDisplayUpdates(
        unit.checklistItems,
        (scaleFactor ?? 1) * unitMultiplier,
      );
    });

  await prisma.$transaction(async (tx) => {
    await tx.cookingSession.update({
      where: { id: sessionId },
      data: { scaleFactor },
    });
    await applyChecklistDisplayUpdates(tx, updates);
    await tx.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  });
}

/**
 * PRODUCT_SPEC.md §24.4: an individual Section's or Part's own scale.
 * Composes with the *owning* source's own current scale — except a
 * single-source session (every historical session, and any new session
 * started with exactly one selected source), where that's
 * `CookingSession.scaleFactor` instead: `updateSessionScale` (the
 * single-source "whole-session scale" path) only ever mutates that column,
 * never the lone `CookingSessionSource.scaleFactor` row (nothing in the
 * single-source UI/API exposes a separate per-source scale to keep it in
 * sync with), so that row goes stale the moment a single-source session's
 * whole-session scale changes. A multi-source session has no such
 * "whole-session" column to fall back to (each source's own
 * `CookingSessionSource.scaleFactor` is independently live — see
 * `updateSourceScale`), so its owning source's own row is read directly. A
 * consolidated (multi-contribution) unit's `baseQuantity` is already the
 * source-scale-weighted aggregate (`aggregateChecklist`/
 * `recomputeContributionAggregate`), so composing another source multiplier
 * here would double-count it — only an ordinary (single-contribution) unit
 * needs its owning source's scale applied, exactly like
 * `startMultiSourceCookingSession`'s own `owningSourceScale`.
 */
export async function updateUnitScale(
  ownerId: string,
  sessionId: string,
  unitId: string,
  scaleFactor: number | null,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const unit = findOwnedUnit(session, unitId);
  if (!unit) throw new NotFoundError("Unit not found in this session.");
  if (unit.removedAt) {
    throw new ValidationError("Removed units cannot be rescaled.");
  }

  const owningSourceScale =
    session.sources.length === 1
      ? (decimalToNumber(session.scaleFactor) ?? 1)
      : unit.contributions.length === 1
        ? (decimalToNumber(unit.contributions[0].source.scaleFactor) ?? 1)
        : 1;
  const updates = computeChecklistDisplayUpdates(
    unit.checklistItems,
    owningSourceScale * (scaleFactor ?? 1),
  );

  await prisma.$transaction(async (tx) => {
    await tx.cookingSessionUnit.update({
      where: { id: unitId },
      data: { scaleFactor },
    });
    await applyChecklistDisplayUpdates(tx, updates);
    await tx.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  });
}

/**
 * F8-style batched write, generalizing `applyChecklistDisplayUpdates` to
 * also touch `baseQuantity`/`baseQuantityEnd` — needed only by a
 * consolidated unit's rescale recompute below, where the aggregate itself
 * (not just its display formatting) changes. Never touches `checkedAt`/
 * `checkedQuantity`: an already-checked item's snapshotted amount is left
 * exactly as it was, so the existing `computeChecklistItemConflict`
 * mechanism (queries.ts) naturally flags it as stale against the new
 * amount — the same "flagged, never silently rewritten" rule §24.5 already
 * establishes for an ordinary rescale, generalized here rather than
 * reinvented.
 */
async function applyChecklistBaseAndDisplayUpdates(
  tx: Prisma.TransactionClient,
  updates: Array<{
    id: string;
    baseQuantity: number;
    baseQuantityEnd: number | null;
    displayQuantity: string;
  }>,
): Promise<void> {
  if (updates.length === 0) return;
  await tx.$executeRaw`
    UPDATE "CookingSessionChecklistItem" AS c
    SET
      "baseQuantity" = v.base_quantity::numeric,
      "baseQuantityEnd" = v.base_quantity_end::numeric,
      "displayQuantity" = v.display_quantity
    FROM (VALUES ${Prisma.join(
      updates.map(
        (u) =>
          Prisma.sql`(${u.id}::text, ${u.baseQuantity}::text, ${u.baseQuantityEnd}::text, ${u.displayQuantity}::text)`,
      ),
    )}) AS v(id, base_quantity, base_quantity_end, display_quantity)
    WHERE c.id = v.id
  `;
}

/**
 * Live per-source rescale (owner completion-pass spec, 2026-09-18) — the
 * multi-source generalization of `updateSessionScale`: each
 * `CookingSessionSource` keeps its own independent, live scale, since "no
 * meaningful single global scale spans unrelated Recipes/Parts." Rescaling
 * one source never touches another's `CookingSessionSource.scaleFactor`,
 * and every recompute below only ever *updates* existing rows — never
 * deletes/recreates a `CookingSessionUnit`/`CookingSessionChecklistItem`/
 * `Timer`, so checkoffs, completion, and running timers all survive
 * untouched (the same "checked-off is evidence of what happened, not a
 * transaction rescaling reverses" rule as an ordinary rescale, §24.5).
 *
 * - A unit this source is the *sole* contributor to (ordinary) is
 *   recomputed exactly like `updateUnitScale`: `baseQuantity` is left
 *   alone (it was never source-scaled to begin with — only the display
 *   formatting is) and only `displayQuantity` changes.
 * - A unit with more than one contribution (consolidated) has its
 *   `baseQuantity` itself recomputed — it *is* the weighted sum of every
 *   contributor's own current scale — by re-deriving each contributor's
 *   fresh `buildCookableUnits()` (this source's new scale; every other
 *   contributor's own existing, unchanged scale) and re-running the exact
 *   same aggregation `consolidateSources` uses at creation
 *   (`recomputeContributionAggregate`). Every *other* source's own
 *   contribution row is left untouched — "retain the other sources'
 *   existing contributions."
 */
export async function updateSourceScale(
  ownerId: string,
  sessionId: string,
  sourceId: string,
  scaleFactor: number | null,
): Promise<void> {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const source = session.sources.find((s) => s.id === sourceId);
  if (!source) throw new NotFoundError("Source not found in this session.");

  const { dish, version } = await getOwnedDishVersionOrThrow(
    ownerId,
    source.dishId,
    source.dishVersionId,
  );
  const myCookableUnits = await buildCookableUnits(ownerId, dish, version);
  const myCookableByKey = new Map(myCookableUnits.map((u) => [u.unitKey, u]));

  // Re-derives one other contributing source's own cookable units at most
  // once per rescale, however many consolidated units it and the rescaled
  // source both contribute to.
  const otherSourceUnitsCache = new Map<string, Map<string, CookableUnit>>();
  async function cookableUnitsFor(contributionSource: {
    id: string;
    dishId: string;
    dishVersionId: string;
  }): Promise<Map<string, CookableUnit>> {
    if (contributionSource.id === sourceId) return myCookableByKey;
    const cached = otherSourceUnitsCache.get(contributionSource.id);
    if (cached) return cached;
    const { dish, version } = await getOwnedDishVersionOrThrow(
      ownerId,
      contributionSource.dishId,
      contributionSource.dishVersionId,
    );
    const units = await buildCookableUnits(ownerId, dish, version);
    const byKey = new Map(units.map((u) => [u.unitKey, u]));
    otherSourceUnitsCache.set(contributionSource.id, byKey);
    return byKey;
  }

  const displayOnlyUpdates: { id: string; displayQuantity: string }[] = [];
  const baseAndDisplayUpdates: Array<{
    id: string;
    baseQuantity: number;
    baseQuantityEnd: number | null;
    displayQuantity: string;
  }> = [];
  const contributionUpdates: Array<{
    id: string;
    multiplier: number;
    contributionQuantity: number | null;
    contributionUnit: string | null;
  }> = [];

  for (const unit of session.units) {
    if (unit.removedAt) continue;
    const myContribution = unit.contributions.find(
      (c) => c.sourceId === sourceId,
    );
    if (!myContribution) continue; // this source doesn't own/contribute here

    const myRawUnit = myCookableByKey.get(myContribution.sourceUnitKey);
    if (!myRawUnit) continue; // this source's own content changed since creation; nothing to re-derive from

    const contributionQuantity =
      myRawUnit.outputQuantity == null
        ? null
        : myRawUnit.outputQuantity *
          myRawUnit.linkMultiplier *
          (scaleFactor ?? 1);
    contributionUpdates.push({
      id: myContribution.id,
      multiplier: scaleFactor ?? 1,
      contributionQuantity,
      contributionUnit: myRawUnit.outputUnit,
    });

    const unitMultiplier = decimalToNumber(unit.scaleFactor) ?? 1;

    if (unit.contributions.length === 1) {
      // Ordinary: same mechanism as updateUnitScale, substituting this
      // source's scale for the session-level one.
      displayOnlyUpdates.push(
        ...computeChecklistDisplayUpdates(
          unit.checklistItems,
          (scaleFactor ?? 1) * unitMultiplier,
        ),
      );
      continue;
    }

    // Consolidated: re-derive every contributor's current raw unit +
    // current weight (this source's new scale; every other contributor's
    // own existing CookingSessionSource.scaleFactor, untouched).
    const contributionInputs = await Promise.all(
      unit.contributions.map(async (c) => {
        const byKey = await cookableUnitsFor(c.source);
        const rawUnit = byKey.get(c.sourceUnitKey);
        const weight =
          c.sourceId === sourceId
            ? (scaleFactor ?? 1)
            : (decimalToNumber(c.source.scaleFactor) ?? 1);
        return rawUnit ? { unit: rawUnit, weight } : null;
      }),
    );
    const resolvedInputs = contributionInputs.filter(
      (c): c is { unit: CookableUnit; weight: number } => c != null,
    );
    if (resolvedInputs.length === 0) continue;

    const aggregate = recomputeContributionAggregate(resolvedInputs);
    for (const item of unit.checklistItems) {
      const aggRaw = aggregate.checklist.find(
        (r) => r.sourceLineageId === item.sourceLineageId,
      );
      if (!aggRaw || aggRaw.kind !== "INGREDIENT" || aggRaw.quantity == null) {
        continue;
      }
      baseAndDisplayUpdates.push({
        id: item.id,
        baseQuantity: aggRaw.quantity,
        baseQuantityEnd: aggRaw.quantityEnd,
        displayQuantity: formatScaledQuantity(
          aggRaw.quantity,
          aggRaw.quantityEnd,
          item.isApproximate,
          unitMultiplier,
        ),
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.cookingSessionSource.update({
      where: { id: sourceId },
      data: { scaleFactor },
    });
    await applyChecklistDisplayUpdates(tx, displayOnlyUpdates);
    await applyChecklistBaseAndDisplayUpdates(tx, baseAndDisplayUpdates);
    for (const c of contributionUpdates) {
      await tx.cookingSessionUnitContribution.update({
        where: { id: c.id },
        data: {
          multiplier: c.multiplier,
          contributionQuantity: c.contributionQuantity,
          contributionUnit: c.contributionUnit,
        },
      });
    }
    await tx.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  });
}

const MIN_TIMER_DURATION_SECONDS = 1;

/**
 * PRODUCT_SPEC.md §29.1/§29.2: creating a timer starts it immediately (the
 * natural single action for "set 10 minutes" while cooking) — reset/pause
 * are the separate actions for anything past that.
 */
export async function createTimer(
  ownerId: string,
  sessionId: string,
  unitId: string,
  name: string,
  durationSeconds: number,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const unit = findOwnedUnit(session, unitId);
  if (!unit) throw new NotFoundError("Unit not found in this session.");
  if (unit.removedAt) {
    throw new ValidationError("Removed units cannot start new timers.");
  }
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < MIN_TIMER_DURATION_SECONDS
  ) {
    throw new ValidationError("Enter a timer duration greater than zero.");
  }

  const now = new Date();
  return prisma.timer.create({
    data: {
      unitId,
      name: name.trim() || "Timer",
      durationSeconds,
      targetEndAt: new Date(now.getTime() + durationSeconds * 1000),
      state: "RUNNING",
    },
  });
}

export async function renameTimer(
  ownerId: string,
  sessionId: string,
  timerId: string,
  name: string,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const found = findOwnedTimer(session, timerId);
  if (!found) throw new NotFoundError("Timer not found in this session.");

  await prisma.timer.update({
    where: { id: timerId },
    data: { name: name.trim() || "Timer" },
  });
}

/**
 * Starts a never-run (post-reset) timer or resumes a paused one — both are
 * "count down from the current remaining duration," so one function covers
 * both PRODUCT_SPEC.md §29.2 actions; the UI decides whether to label its
 * button "Start" or "Resume".
 */
export async function startTimer(
  ownerId: string,
  sessionId: string,
  timerId: string,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const found = findOwnedTimer(session, timerId);
  if (!found) throw new NotFoundError("Timer not found in this session.");
  const { timer } = found;
  if (timer.state === "DISMISSED") {
    throw new ValidationError("This timer was dismissed.");
  }

  const remaining = Math.max(
    0,
    timer.remainingSeconds ?? timer.durationSeconds,
  );
  await prisma.timer.update({
    where: { id: timerId },
    data: {
      state: "RUNNING",
      targetEndAt: new Date(Date.now() + remaining * 1000),
      remainingSeconds: null,
    },
  });
}

export async function pauseTimer(
  ownerId: string,
  sessionId: string,
  timerId: string,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const found = findOwnedTimer(session, timerId);
  if (!found) throw new NotFoundError("Timer not found in this session.");
  const { timer } = found;
  if (timer.state !== "RUNNING" || !timer.targetEndAt) return;

  const remainingSeconds = Math.max(
    0,
    Math.round((timer.targetEndAt.getTime() - Date.now()) / 1000),
  );
  await prisma.timer.update({
    where: { id: timerId },
    data: { state: "PAUSED", remainingSeconds, targetEndAt: null },
  });
}

/** Returns to the timer's current nominal duration, paused (not auto-running). */
export async function resetTimer(
  ownerId: string,
  sessionId: string,
  timerId: string,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const found = findOwnedTimer(session, timerId);
  if (!found) throw new NotFoundError("Timer not found in this session.");
  const { timer } = found;
  if (timer.state === "DISMISSED") {
    throw new ValidationError("This timer was dismissed.");
  }

  await prisma.timer.update({
    where: { id: timerId },
    data: {
      state: "PAUSED",
      remainingSeconds: timer.durationSeconds,
      targetEndAt: null,
    },
  });
}

/**
 * Add (positive) or subtract (negative) time. Updates the nominal
 * `durationSeconds` too, so a later Reset returns to the adjusted duration,
 * not the original creation value — the natural reading of "add 2 minutes"
 * while cooking.
 */
export async function adjustTimer(
  ownerId: string,
  sessionId: string,
  timerId: string,
  deltaSeconds: number,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const found = findOwnedTimer(session, timerId);
  if (!found) throw new NotFoundError("Timer not found in this session.");
  const { timer } = found;
  if (timer.state === "DISMISSED") {
    throw new ValidationError("This timer was dismissed.");
  }
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return;

  const durationSeconds = Math.max(0, timer.durationSeconds + deltaSeconds);

  if (timer.state === "RUNNING" && timer.targetEndAt) {
    await prisma.timer.update({
      where: { id: timerId },
      data: {
        durationSeconds,
        targetEndAt: new Date(
          timer.targetEndAt.getTime() + deltaSeconds * 1000,
        ),
      },
    });
  } else {
    const remainingSeconds = Math.max(
      0,
      (timer.remainingSeconds ?? timer.durationSeconds) + deltaSeconds,
    );
    await prisma.timer.update({
      where: { id: timerId },
      data: { durationSeconds, remainingSeconds },
    });
  }
}

/** PRODUCT_SPEC.md §29.2 "complete or dismiss" — one terminal action; the UI
 * may label it either way depending on whether the timer had expired. */
export async function dismissTimer(
  ownerId: string,
  sessionId: string,
  timerId: string,
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const found = findOwnedTimer(session, timerId);
  if (!found) throw new NotFoundError("Timer not found in this session.");

  await prisma.timer.update({
    where: { id: timerId },
    data: { state: "DISMISSED" },
  });
}
