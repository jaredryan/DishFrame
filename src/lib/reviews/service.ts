import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ValidationError } from "@/lib/errors";
import { getOwnedSessionOrThrow } from "@/lib/cooking/queries";
import { versionLabel } from "@/lib/dishes/version-note";
import type { SaveSessionReviewInput } from "@/lib/reviews/schema";

/**
 * Session Review + Rating writes (ARCHITECTURE_PROPOSAL.md §I: "Save/edit/
 * delete a Session Review + Ratings — one transaction covering SessionReview
 * + all Rating rows for that session"). Ended sessions may still receive or
 * edit a Review/Cooking notes (PRODUCT_SPEC.md §33.5) — only their preserved
 * cooking evidence (checklist, timers) is immutable, which this module never
 * touches.
 */

/** The same "completed at session end" default the Review page itself
 * prefills checkboxes from — used here only to detect whether the
 * reviewer's submitted selection is a deliberate deviation worth saving on
 * its own. */
function defaultIncludedUnitIds(
  units: Array<{ id: string; removedAt: Date | null; completedAt: Date | null }>,
): string[] {
  return units
    .filter((u) => !u.removedAt && u.completedAt != null)
    .map((u) => u.id);
}

function sameUnitIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((id) => bSet.has(id));
}

function hasMeaningfulContent(
  input: SaveSessionReviewInput,
  defaultUnitIds: string[],
): boolean {
  return (
    !!input.whatWentWell ||
    !!input.whatDidNotGoWell ||
    !!input.anythingElse ||
    input.actualAmountQuantity != null ||
    input.reviewAdjustedDurationSeconds != null ||
    input.ratings.length > 0 ||
    !sameUnitIdSet(input.includedUnitIds, defaultUnitIds)
  );
}

async function clearReviewAndRatings(sessionId: string) {
  await prisma.$transaction([
    prisma.rating.deleteMany({ where: { sessionId } }),
    prisma.sessionReview.deleteMany({ where: { sessionId } }),
  ]);
}

/**
 * PRODUCT_SPEC.md §33.3/§33.4: a Review is created only when it carries at
 * least one meaningful value; text-only, rating-only, amount-only, and
 * duration-only all qualify. Saving an existing Review down to nothing is
 * treated the same as deleting it, rather than leaving a stale empty row.
 */
export async function saveSessionReview(
  ownerId: string,
  input: SaveSessionReviewInput,
): Promise<{ deleted: boolean }> {
  const session = await getOwnedSessionOrThrow(ownerId, input.sessionId);
  if (session.state === "IN_PROGRESS") {
    throw new ValidationError(
      "Finish or end this Cooking Session before saving a Review.",
    );
  }

  // Never trust client-supplied unit ids past this session's own active
  // units — silently drops anything else rather than erroring, matching
  // this module's general "re-derive server-side" posture.
  const validUnitIds = new Set(
    session.units.filter((u) => !u.removedAt).map((u) => u.id),
  );
  const includedUnitIds = input.includedUnitIds.filter((id) =>
    validUnitIds.has(id),
  );
  const defaultUnitIds = defaultIncludedUnitIds(session.units);

  if (!hasMeaningfulContent(input, defaultUnitIds)) {
    await clearReviewAndRatings(input.sessionId);
    return { deleted: true };
  }

  const tasterIds = input.ratings.map((r) => r.tasterId);
  const uniqueTasterIds = new Set(tasterIds);
  if (uniqueTasterIds.size !== tasterIds.length) {
    throw new ValidationError(
      "Each Taster can have only one rating per session.",
    );
  }
  if (uniqueTasterIds.size > 0) {
    const ownedCount = await prisma.taster.count({
      where: { id: { in: [...uniqueTasterIds] }, ownerId },
    });
    if (ownedCount !== uniqueTasterIds.size) {
      throw new ValidationError(
        "One of the selected Tasters is no longer available.",
      );
    }
  }

  const [dish, dishVersion] = await Promise.all([
    prisma.dish.findFirst({
      where: { id: session.dishId },
      select: { currentTitle: true },
    }),
    prisma.dishVersion.findFirst({
      where: { id: session.dishVersionId },
      select: { majorVersion: true, minorVersion: true },
    }),
  ]);
  const dishTitleSnapshot = dish?.currentTitle ?? "Deleted item";
  const dishVersionLabelSnapshot = dishVersion
    ? versionLabel(dishVersion.majorVersion, dishVersion.minorVersion)
    : "—";

  await prisma.$transaction(async (tx) => {
    await tx.sessionReview.upsert({
      where: { sessionId: input.sessionId },
      create: {
        sessionId: input.sessionId,
        whatWentWell: input.whatWentWell,
        whatDidNotGoWell: input.whatDidNotGoWell,
        anythingElse: input.anythingElse,
        actualAmountQuantity: input.actualAmountQuantity,
        actualAmountUnit: input.actualAmountUnit,
        reviewAdjustedDurationSeconds: input.reviewAdjustedDurationSeconds,
        includedUnitIds,
      },
      update: {
        whatWentWell: input.whatWentWell,
        whatDidNotGoWell: input.whatDidNotGoWell,
        anythingElse: input.anythingElse,
        actualAmountQuantity: input.actualAmountQuantity,
        actualAmountUnit: input.actualAmountUnit,
        reviewAdjustedDurationSeconds: input.reviewAdjustedDurationSeconds,
        includedUnitIds,
      },
    });

    // Replace the session's rating set wholesale — simplest correct
    // implementation of "add or remove ratings" editing (§33.5) that still
    // honors the one-rating-per-Taster-per-session-per-item invariant
    // (§35.3), enforced again by the `@@unique([sessionId, tasterId,
    // dishId])` constraint as the database backstop.
    await tx.rating.deleteMany({ where: { sessionId: input.sessionId } });
    if (input.ratings.length > 0) {
      await tx.rating.createMany({
        data: input.ratings.map((r) => ({
          sessionId: input.sessionId,
          dishId: session.dishId,
          dishVersionId: session.dishVersionId,
          tasterId: r.tasterId,
          value: r.value,
          dishTitleSnapshot,
          dishVersionLabelSnapshot,
        })),
      });
    }
  });

  return { deleted: false };
}

/** PRODUCT_SPEC.md §33.6: removes Review text and every Rating tied to this
 * session, preserving the CookingSession, its checklist/timer history, and
 * Cooking notes untouched. */
export async function deleteSessionReview(ownerId: string, sessionId: string) {
  await getOwnedSessionOrThrow(ownerId, sessionId);
  await clearReviewAndRatings(sessionId);
}

/** PRODUCT_SPEC.md §31.3: independent of the structured Review, editable at
 * any time regardless of session state. */
export async function updateCookingNotes(
  ownerId: string,
  sessionId: string,
  cookingNotes: string | null,
) {
  await getOwnedSessionOrThrow(ownerId, sessionId);
  await prisma.cookingSession.update({
    where: { id: sessionId },
    data: { cookingNotes },
  });
}
