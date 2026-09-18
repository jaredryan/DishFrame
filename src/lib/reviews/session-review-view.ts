import "server-only";
import {
  getOwnedSessionForReview,
  listReviewTasterOptions,
} from "@/lib/reviews/queries";
import { decimalToNumber } from "@/lib/dishes/format";
import type { SessionContextUnit } from "@/components/domain/cooking/session-review-form";

/**
 * `<SessionReviewForm>`'s exact prop assembly, extracted from `(cook)/cook/
 * [sessionId]/review/page.tsx` so the offline snapshot builder
 * (`offline-sync/cooking.ts`) can ship the identical shape — same pattern
 * as `lib/cooking/session-view.ts` for the active-session page and
 * `lib/dishes/detail-view.ts` for Dish detail.
 *
 * Only reachable offline for a session already in the local replica —
 * bootstrap only ships `IN_PROGRESS` sessions (`offline-sync/cooking.ts`'s
 * `listAllCookingSessionSnapshots` doc comment), so this only helps the
 * realistic case: a session ended on *this* device (whose `cooking.
 * endSession` mutation already wrote a fresh snapshot, including this
 * field, into the replica), immediately followed by "Review." Opening an
 * older completed session's Review after a fresh bootstrap (a different
 * device, a reinstall, an account switch) is still a "requires connection"
 * gap, same boundary as Dishes' version history.
 */
export async function buildSessionReviewProps(
  userId: string,
  sessionId: string,
) {
  const { session: cookingSession, dish } = await getOwnedSessionForReview(
    userId,
    sessionId,
  );
  const tasterOptions = await listReviewTasterOptions(userId, sessionId);

  const contextUnits: SessionContextUnit[] = cookingSession.units
    .filter((u) => !u.removedAt)
    .map((u) => ({
      id: u.id,
      label: u.label,
      completed: u.completedAt != null,
    }));

  const existingRatings = cookingSession.ratings.map((r) => ({
    tasterId: r.tasterId,
    value: r.value,
  }));

  return {
    sessionId,
    dishId: dish?.id ?? cookingSession.dishId,
    dishVersionId: cookingSession.dishVersionId,
    dishKind: dish?.kind ?? null,
    dishTitle: dish?.currentTitle ?? "Deleted item",
    outcome: cookingSession.state as
      "IN_PROGRESS" | "COMPLETED" | "ENDED_EARLY",
    contextUnits,
    tasterOptions,
    existingReview: cookingSession.review
      ? {
          whatWentWell: cookingSession.review.whatWentWell,
          whatDidNotGoWell: cookingSession.review.whatDidNotGoWell,
          anythingElse: cookingSession.review.anythingElse,
          actualAmountQuantity: decimalToNumber(
            cookingSession.review.actualAmountQuantity,
          ),
          actualAmountUnit: cookingSession.review.actualAmountUnit,
          reviewAdjustedDurationSeconds:
            cookingSession.review.reviewAdjustedDurationSeconds,
          includedUnitIds: cookingSession.review.includedUnitIds,
        }
      : null,
    existingRatings,
    rawElapsedSeconds: cookingSession.rawElapsedSeconds,
    currentStage: dish?.stage ?? null,
  };
}

export type SessionReviewProps = Awaited<
  ReturnType<typeof buildSessionReviewProps>
>;

/**
 * Multi-source Cooking Sessions completion pass (2026-09-18) — one entry
 * per participating source, each shaped exactly like `SessionReviewProps`
 * (plus its own `sourceId`) so `<SessionReviewForm>` renders identically
 * per source, walked through one at a time by the review wizard. A
 * single-source session's own review keeps using `buildSessionReviewProps`
 * above, completely unchanged — this is only ever read for
 * `sources.length > 1`.
 */
export async function buildMultiSourceSessionReviewProps(
  userId: string,
  sessionId: string,
) {
  const { session: cookingSession, dishById } = await getOwnedSessionForReview(
    userId,
    sessionId,
  );
  const tasterOptions = await listReviewTasterOptions(userId, sessionId);

  return cookingSession.sources.map((source) => {
    const dish = dishById.get(source.dishId) ?? null;
    const sourceUnits = cookingSession.units.filter(
      (u) =>
        !u.removedAt && u.contributions.some((c) => c.sourceId === source.id),
    );
    const contextUnits: SessionContextUnit[] = sourceUnits.map((u) => ({
      id: u.id,
      label: u.label,
      completed: u.completedAt != null,
    }));
    const existingRatings = cookingSession.ratings
      .filter((r) => r.dishId === source.dishId)
      .map((r) => ({ tasterId: r.tasterId, value: r.value }));

    return {
      sourceId: source.id,
      sessionId,
      dishId: dish?.id ?? source.dishId,
      dishVersionId: source.dishVersionId,
      dishKind: dish?.kind ?? null,
      dishTitle: dish?.currentTitle ?? "Deleted item",
      outcome: cookingSession.state as
        "IN_PROGRESS" | "COMPLETED" | "ENDED_EARLY",
      contextUnits,
      tasterOptions,
      existingReview: source.review
        ? {
            whatWentWell: source.review.whatWentWell,
            whatDidNotGoWell: source.review.whatDidNotGoWell,
            anythingElse: source.review.anythingElse,
            actualAmountQuantity: decimalToNumber(
              source.review.actualAmountQuantity,
            ),
            actualAmountUnit: source.review.actualAmountUnit,
            reviewAdjustedDurationSeconds:
              source.review.reviewAdjustedDurationSeconds,
            includedUnitIds: source.review.includedUnitIds,
          }
        : null,
      existingRatings,
      rawElapsedSeconds: cookingSession.rawElapsedSeconds,
      currentStage: dish?.stage ?? null,
    };
  });
}

export type MultiSourceSessionReviewProps = Awaited<
  ReturnType<typeof buildMultiSourceSessionReviewProps>
>;
