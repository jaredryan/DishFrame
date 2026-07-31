import type { StageValue, RestorableStageValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §40.3/§40.4: gentle, explainable, positive-only Stage
 * suggestions after meaningful use — never a downgrade, never automatic
 * (§40.2), and never imposing a score threshold or required session count.
 * "Meaningful use" is read here as at least one Completed or Ended-early
 * session, the same evidence bar the Review flow itself is offered against.
 */
export type StageSuggestion = {
  targetStage: RestorableStageValue;
  message: string;
};

const SUGGESTIONS: Partial<Record<StageValue, StageSuggestion>> = {
  IDEA: {
    targetStage: "EXPERIMENTAL",
    message: "This has now been tested. Move it to Experimental?",
  },
  EXPERIMENTAL: {
    targetStage: "PROVEN",
    message: "Feeling confident in it? Mark it Proven.",
  },
  PROVEN: {
    targetStage: "ACTIVE",
    message: "Add this to your Active rotation?",
  },
};

export function getStageSuggestion(
  stage: StageValue,
  finishedSessionCount: number,
): StageSuggestion | null {
  if (finishedSessionCount < 1) return null;
  return SUGGESTIONS[stage] ?? null;
}
