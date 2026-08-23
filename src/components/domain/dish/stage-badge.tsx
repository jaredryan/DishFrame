import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import type { StageValue } from "@/lib/dishes/schema";

// PRODUCT_SPEC.md §5.3 / BRANDING.md §5.3 — Stage is user-facing "Recipe
// Status" language.
export const STAGE_LABEL: Record<StageValue, string> = {
  IDEA: "Idea",
  EXPERIMENTAL: "Experimental",
  PROVEN: "Proven",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

/** Semantic chip-color pass: Stage always renders blue regardless of which
 * Stage it is — the label text communicates the actual Stage, and blue
 * consistently communicates "this chip is lifecycle Stage" (not a
 * per-Stage color, which read as more differentiated meaning than Stage
 * alone carries). */
export function StageBadge({
  stage,
  className,
}: {
  stage: StageValue;
  className?: string;
}) {
  return (
    <SemanticChip semantic="blue" className={className}>
      {STAGE_LABEL[stage]}
    </SemanticChip>
  );
}
