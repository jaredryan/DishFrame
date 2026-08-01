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
import {
  scaleQuantity,
  scaleIngredientQuantity,
  formatCalculatedQuantity,
} from "@/lib/units/scaling";
import {
  getOwnedDishVersionOrThrow,
  getOwnedSessionOrThrow,
  findActiveSessionForDish,
  buildCookableUnits,
  sessionUnitKey,
  type CookableChecklistRaw,
  type CookableUnit,
  type OwnedCookingSession,
} from "@/lib/cooking/queries";
import { versionLabel } from "@/lib/dishes/version-note";
import type { StartCookingSessionInput } from "@/lib/cooking/schema";

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
 * Formats a structured quantity at `multiplier`, matching the same authored-
 * vs-calculated formatting split `scaled-display.ts` already established
 * for the Recipe/Part detail view's own temporary-scaling control
 * (PRODUCT_SPEC.md §52.6/§52.7): unscaled (`multiplier === 1`) renders in
 * plain authored style, any real scaling renders in kitchen-fraction/
 * decimal calculated style. Shared by checklist-row creation (below) and
 * mid-session scale recalculation (`recomputeUnitChecklistDisplay`), both of
 * which must produce byte-identical formatting for the same inputs.
 */
function formatScaledQuantity(
  quantity: number,
  quantityEnd: number | null,
  isApproximate: boolean,
  multiplier: number,
): string {
  const scaled = scaleIngredientQuantity(
    { quantity, quantityEnd, isApproximate, displayText: null },
    multiplier,
  );
  const formatFn = multiplier === 1 ? String : formatCalculatedQuantity;
  const approxPrefix = isApproximate ? "about " : "";
  const rangeText =
    scaled.quantityEnd != null ? `–${formatFn(scaled.quantityEnd)}` : "";
  return `${approxPrefix}${formatFn(scaled.quantity!)}${rangeText}`;
}

/**
 * Renders one checklist row's self-contained display fields (Correction 3)
 * at the effective multiplier for its unit, plus the structured `base*`
 * fields (Slice 8 correction) mid-session scaling recalculates from later —
 * never re-parses `displayQuantity`'s formatted string. `baseQuantity`/
 * `baseQuantityEnd` stay null for free-text or quantity-less rows, matching
 * `displayQuantity`'s own nullability so a later rescale leaves them alone.
 */
function renderChecklistDisplay(
  raw: CookableChecklistRaw,
  multiplier: number,
): {
  displayText: string;
  displayQuantity: string | null;
  displayUnit: string | null;
  baseQuantity: number | null;
  baseQuantityEnd: number | null;
  isApproximate: boolean;
} {
  if (raw.kind === "INSTRUCTION") {
    return {
      displayText: raw.text,
      displayQuantity: null,
      displayUnit: null,
      baseQuantity: null,
      baseQuantityEnd: null,
      isApproximate: false,
    };
  }

  const name = raw.name?.trim() || "Untitled ingredient";
  const displayText = raw.preparationNote
    ? `${name}, ${raw.preparationNote}`
    : name;

  if (raw.freeText) {
    return {
      displayText,
      displayQuantity: raw.freeText,
      displayUnit: null,
      baseQuantity: null,
      baseQuantityEnd: null,
      isApproximate: false,
    };
  }
  if (raw.quantity == null) {
    return {
      displayText,
      displayQuantity: null,
      displayUnit: null,
      baseQuantity: null,
      baseQuantityEnd: null,
      isApproximate: false,
    };
  }

  return {
    displayText,
    displayQuantity: formatScaledQuantity(
      raw.quantity,
      raw.quantityEnd,
      raw.isApproximate,
      multiplier,
    ),
    displayUnit: raw.unit,
    baseQuantity: raw.quantity,
    baseQuantityEnd: raw.quantityEnd,
    isApproximate: raw.isApproximate,
  };
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
export async function startCookingSession(
  ownerId: string,
  input: StartCookingSessionInput,
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
          ownerId,
          dishId: input.dishId,
          dishVersionId: input.dishVersionId,
          scaleFactor: sessionScale,
          originalScaleFactor: sessionScale,
        },
      });

      for (const [index, { unit, scaleFactor }] of selected.entries()) {
        const effectiveMultiplier = (sessionScale ?? 1) * (scaleFactor ?? 1);
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

        for (const raw of unit.checklist) {
          const display = renderChecklistDisplay(raw, effectiveMultiplier);
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

        await createPartUsageRows(tx, session.id, unitRow.id, unit);
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
) {
  const session = await getOwnedSessionOrThrow(ownerId, sessionId);
  assertActive(session);

  const { dish, version } = await getOwnedDishVersionOrThrow(
    ownerId,
    session.dishId,
    session.dishVersionId,
  );
  const cookableUnits = await buildCookableUnits(ownerId, dish, version);
  const byKey = new Map(cookableUnits.map((unit) => [unit.unitKey, unit]));

  const existingKeys = new Set(session.units.map(sessionUnitKey));
  const toAdd = [...new Set(unitKeys)].filter(
    (key) => byKey.has(key) && !existingKeys.has(key),
  );
  if (toAdd.length === 0) return;

  const maxPosition = session.units.reduce(
    (max, u) => Math.max(max, u.position),
    -1,
  );
  const sessionScale = decimalToNumber(session.scaleFactor) ?? 1;

  await prisma.$transaction(async (tx) => {
    for (const [offset, key] of toAdd.entries()) {
      const unit = byKey.get(key)!;
      const unitRow = await tx.cookingSessionUnit.create({
        data: {
          sessionId,
          position: maxPosition + 1 + offset,
          label: unit.label,
          sourceDishTitle: unit.sourceDishTitle,
          sourceDishVersionLabel: unit.sourceDishVersionLabel,
          sourceSectionLineageId: unit.sourceSectionLineageId,
          sourcePartLinkLineageId: unit.sourcePartLinkLineageId,
        },
      });
      for (const raw of unit.checklist) {
        const display = renderChecklistDisplay(raw, sessionScale);
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

    return tx.cookingSession.update({
      where: { id: sessionId },
      data: { state: outcome, endedAt, rawElapsedSeconds },
    });
  });
}

/**
 * PRODUCT_SPEC.md §27.4's narrow "Delete session" carve-out — reachable
 * only through the final-unit guard's own choice, not a general delete
 * action. A plain cascade delete (units/checklist/timers/review/ratings
 * all `onDelete: Cascade` off `CookingSession`, schema.prisma).
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
 */
async function recomputeUnitChecklistDisplay(
  tx: Prisma.TransactionClient,
  unit: {
    checklistItems: OwnedCookingSession["units"][number]["checklistItems"];
  },
  effectiveMultiplier: number,
) {
  for (const item of unit.checklistItems) {
    const baseQuantity = decimalToNumber(item.baseQuantity);
    if (baseQuantity == null) continue;
    const baseQuantityEnd = decimalToNumber(item.baseQuantityEnd);
    const displayQuantity = formatScaledQuantity(
      baseQuantity,
      baseQuantityEnd,
      item.isApproximate,
      effectiveMultiplier,
    );
    await tx.cookingSessionChecklistItem.update({
      where: { id: item.id },
      data: { displayQuantity },
    });
  }
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

  await prisma.$transaction(async (tx) => {
    await tx.cookingSession.update({
      where: { id: sessionId },
      data: { scaleFactor },
    });
    for (const unit of session.units) {
      if (unit.removedAt) continue;
      const unitMultiplier = decimalToNumber(unit.scaleFactor) ?? 1;
      await recomputeUnitChecklistDisplay(
        tx,
        unit,
        (scaleFactor ?? 1) * unitMultiplier,
      );
    }
    await tx.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  });
}

/**
 * PRODUCT_SPEC.md §24.4: an individual Section's or Part's own scale.
 * Composes with the session's current whole-session scale, same as at
 * session-start (`startCookingSession`'s `effectiveMultiplier`).
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

  const sessionMultiplier = decimalToNumber(session.scaleFactor) ?? 1;

  await prisma.$transaction(async (tx) => {
    await tx.cookingSessionUnit.update({
      where: { id: unitId },
      data: { scaleFactor },
    });
    await recomputeUnitChecklistDisplay(
      tx,
      unit,
      sessionMultiplier * (scaleFactor ?? 1),
    );
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
