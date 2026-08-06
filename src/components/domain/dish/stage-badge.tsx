import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StageValue } from "@/lib/dishes/schema";

// PRODUCT_SPEC.md §5.3 / BRANDING.md §5.3 — Stage is user-facing "Recipe
// Status" language, with the evolution-violet/positive-green accents
// BRANDING.md §6 assigns (Proven/Active read as "what works").
export const STAGE_LABEL: Record<StageValue, string> = {
  IDEA: "Idea",
  EXPERIMENTAL: "Experimental",
  PROVEN: "Proven",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

// Design remediation pass: Active and Proven previously used the same
// green family at two opacities, too close to read as distinct at a
// glance. Active now uses the primary blue family (still an accessible,
// on-brand accent — BRANDING.md §6's --primary *is* --brand-blue) to read
// as "in main rotation," leaving green legible as Proven's own "what
// works" meaning.
const STAGE_CLASSNAME: Record<StageValue, string> = {
  IDEA: "bg-muted text-muted-foreground",
  EXPERIMENTAL: "bg-brand-violet/10 text-brand-violet-text",
  PROVEN: "bg-brand-green/10 text-brand-green-text",
  ACTIVE: "bg-primary/15 text-brand-blue-text",
  ARCHIVED: "bg-muted text-muted-foreground",
};

export function StageBadge({
  stage,
  className,
}: {
  stage: StageValue;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", STAGE_CLASSNAME[stage], className)}
    >
      {STAGE_LABEL[stage]}
    </Badge>
  );
}
