import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import {
  getOwnedSessionForReview,
  listReviewTasterOptions,
} from "@/lib/reviews/queries";
import { countFinishedSessionsForDish } from "@/lib/cooking/queries";
import { getStageSuggestion } from "@/lib/dishes/stage-suggestions";
import { decimalToNumber } from "@/lib/dishes/format";
import {
  SessionReviewForm,
  type SessionContextUnit,
} from "@/components/domain/cooking/session-review-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { sessionId } = await params;
  try {
    const { dish } = await getOwnedSessionForReview(session.user.id, sessionId);
    return { title: `${dish?.currentTitle ?? "Deleted item"} — Review` };
  } catch {
    return {};
  }
}

export default async function SessionReviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { sessionId } = await params;

  let owned;
  try {
    owned = await getOwnedSessionForReview(session.user.id, sessionId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { session: cookingSession, dish } = owned;

  // PRODUCT_SPEC.md §33.1: a Review is only available once the session has
  // reached an outcome.
  if (cookingSession.state === "IN_PROGRESS") {
    redirect(`/cook/${sessionId}`);
  }

  const tasterOptions = await listReviewTasterOptions(
    session.user.id,
    sessionId,
  );
  const finishedSessionCount = dish
    ? await countFinishedSessionsForDish(dish.id)
    : 0;
  const stageSuggestion = dish
    ? getStageSuggestion(dish.stage, finishedSessionCount)
    : null;

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

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-6">
      <SessionReviewForm
        sessionId={sessionId}
        dishId={dish?.id ?? cookingSession.dishId}
        dishVersionId={cookingSession.dishVersionId}
        dishKind={dish?.kind ?? null}
        dishTitle={dish?.currentTitle ?? "Deleted item"}
        outcome={cookingSession.state as "COMPLETED" | "ENDED_EARLY"}
        contextUnits={contextUnits}
        tasterOptions={tasterOptions}
        existingReview={
          cookingSession.review
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
              }
            : null
        }
        existingRatings={existingRatings}
        rawElapsedSeconds={cookingSession.rawElapsedSeconds}
        stageSuggestion={stageSuggestion}
      />
    </div>
  );
}
