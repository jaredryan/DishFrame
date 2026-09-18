"use client";

import { useSearchParams } from "next/navigation";
import { SessionReviewForm } from "@/components/domain/cooking/session-review-form";
import type { MultiSourceSessionReviewProps } from "@/lib/reviews/session-review-view";

/**
 * Multi-source Cooking Sessions completion pass (2026-09-18) — walks the
 * reviewer through each participating source's own review one at a time,
 * reusing `<SessionReviewForm>` unchanged per step (its `sourceId`/
 * `nextHref`/`stepLabel` props exist for exactly this). The session-wide
 * "review this session? / not now" decision already happened before this
 * ever renders (`CookingModeShell`'s `handleEnd` still routes to this same
 * `/cook/[sessionId]/review` route regardless of source count); from here,
 * each step's own "Skip this one"/"Continue" advances the wizard, and the
 * last step's return to `/cook/{sessionId}` is the wizard's own exit.
 *
 * Step position is a plain `?source={sourceId}` query param rather than
 * local state, so refreshing mid-wizard (or a queued offline save that
 * later syncs) lands back on the same step.
 */
export function MultiSourceSessionReviewWizard({
  sessionId,
  sources,
}: {
  sessionId: string;
  sources: MultiSourceSessionReviewProps;
}) {
  const searchParams = useSearchParams();
  const requestedSourceId = searchParams.get("source");
  const currentIndex = Math.max(
    0,
    sources.findIndex((s) => s.sourceId === requestedSourceId),
  );
  const current = sources[currentIndex];
  if (!current) return null;

  const isLast = currentIndex === sources.length - 1;
  const nextHref = isLast
    ? `/cook/${sessionId}`
    : `/cook/${sessionId}/review?source=${sources[currentIndex + 1].sourceId}`;

  return (
    <SessionReviewForm
      // Remounts cleanly per step — each source's own draft state (text
      // fields, ratings, included units) never leaks into the next one.
      key={current.sourceId}
      sessionId={sessionId}
      sourceId={current.sourceId}
      stepLabel={`Reviewing ${currentIndex + 1} of ${sources.length}`}
      nextHref={nextHref}
      dishId={current.dishId}
      dishVersionId={current.dishVersionId}
      dishKind={current.dishKind}
      dishTitle={current.dishTitle}
      outcome={current.outcome as "COMPLETED" | "ENDED_EARLY"}
      contextUnits={current.contextUnits}
      tasterOptions={current.tasterOptions}
      existingReview={current.existingReview}
      existingRatings={current.existingRatings}
      rawElapsedSeconds={current.rawElapsedSeconds}
      currentStage={current.currentStage}
    />
  );
}
