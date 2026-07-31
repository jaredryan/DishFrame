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
  scaleIngredientQuantity,
  formatCalculatedQuantity,
} from "@/lib/units/scaling";
import {
  getOwnedDishVersionOrThrow,
  getOwnedSessionOrThrow,
  findActiveSessionForDish,
  buildCookableUnits,
  type CookableChecklistRaw,
  type OwnedCookingSession,
} from "@/lib/cooking/queries";
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

function unitKeyFor(unit: {
  sourceSectionLineageId: string | null;
  sourcePartLinkLineageId: string | null;
}): string {
  return unit.sourceSectionLineageId
    ? `section:${unit.sourceSectionLineageId}`
    : `part:${unit.sourcePartLinkLineageId}`;
}

/**
 * Renders one checklist row's self-contained display fields (Correction 3)
 * at the effective multiplier for its unit — matching the same authored-
 * vs-calculated formatting split `scaled-display.ts` already established
 * for the Recipe/Part detail view's own temporary-scaling control
 * (PRODUCT_SPEC.md §52.6/§52.7): unscaled (`multiplier === 1`) renders in
 * plain authored style, any real scaling renders in kitchen-fraction/
 * decimal calculated style.
 */
function renderChecklistDisplay(
  raw: CookableChecklistRaw,
  multiplier: number,
): {
  displayText: string;
  displayQuantity: string | null;
  displayUnit: string | null;
} {
  if (raw.kind === "INSTRUCTION") {
    return { displayText: raw.text, displayQuantity: null, displayUnit: null };
  }

  const name = raw.name?.trim() || "Untitled ingredient";
  const displayText = raw.preparationNote
    ? `${name}, ${raw.preparationNote}`
    : name;

  if (raw.freeText) {
    return { displayText, displayQuantity: raw.freeText, displayUnit: null };
  }
  if (raw.quantity == null) {
    return { displayText, displayQuantity: null, displayUnit: null };
  }

  const scaled = scaleIngredientQuantity(
    {
      quantity: raw.quantity,
      quantityEnd: raw.quantityEnd,
      isApproximate: raw.isApproximate,
      displayText: null,
    },
    multiplier,
  );
  const formatFn = multiplier === 1 ? String : formatCalculatedQuantity;
  const approxPrefix = raw.isApproximate ? "about " : "";
  const rangeText =
    scaled.quantityEnd != null ? `–${formatFn(scaled.quantityEnd)}` : "";

  return {
    displayText,
    displayQuantity: `${approxPrefix}${formatFn(scaled.quantity!)}${rangeText}`,
    displayUnit: raw.unit,
  };
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
        },
      });

      for (const [index, { unit, scaleFactor }] of selected.entries()) {
        const effectiveMultiplier = (sessionScale ?? 1) * (scaleFactor ?? 1);
        const unitRow = await tx.cookingSessionUnit.create({
          data: {
            sessionId: session.id,
            position: index,
            scaleFactor,
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
              sourceLineageId: raw.sourceLineageId,
            },
          });
        }
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

  const existingKeys = new Set(session.units.map(unitKeyFor));
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
            sourceLineageId: raw.sourceLineageId,
          },
        });
      }
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
 * items, timers, completion) survives regardless. The final-unit guard is
 * a pre-transaction read-then-decide check (Gate 4), not a DB constraint —
 * a removal that would empty the plan is rejected before anything is
 * written, so the caller can offer Delete session / Keep editing.
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

  const activeCount = session.units.filter((u) => !u.removedAt).length;
  if (activeCount <= 1) {
    throw new FinalUnitGuardError();
  }

  const hasProgress =
    unit.completedAt != null ||
    unit.checklistItems.some((item) => item.checkedAt != null) ||
    unit.timers.length > 0;

  await prisma.$transaction([
    prisma.cookingSessionUnit.update({
      where: { id: unitId },
      data: { removedAt: new Date(), removedAfterProgress: hasProgress },
    }),
    prisma.cookingSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    }),
  ]);
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
 * PRODUCT_SPEC.md §25/§30: Finish or End early. Ended sessions never
 * silently return to In progress — this is the only lifecycle-state
 * transition, and it is rejected outright once already ended.
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

  return prisma.cookingSession.update({
    where: { id: sessionId },
    data: { state: outcome, endedAt, rawElapsedSeconds },
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
