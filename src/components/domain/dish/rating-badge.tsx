import { Star } from "lucide-react";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import type { PrincipalRating } from "@/lib/reviews/queries";

/**
 * PRODUCT_SPEC.md §36.4/§49.2: the one restrained value an ordinary card or
 * header shows — `★ 4.6/5` for a genuine current-item rating, `~4.6/5` for
 * a provisional value inherited from prior/source evidence (§36.5/§49.3).
 * The provisional variant is deliberately muted and unfilled so it never
 * reads as a real current rating at a glance.
 */
export function RatingBadge({
  rating,
  className,
}: {
  rating: PrincipalRating;
  className?: string;
}) {
  if (rating.kind === "none") return null;

  const isProvisional = rating.kind === "provisional";
  const label = `${isProvisional ? "~" : ""}${rating.value.toFixed(1)}/5`;
  const title =
    rating.kind === "provisional"
      ? rating.source.type === "duplicate-source"
        ? `Provisional — starting point from ${rating.source.title} ${rating.source.versionLabel}`
        : `Provisional — from ${rating.source.versionLabel}`
      : undefined;

  return (
    <SemanticChip
      semantic="purple"
      className={`tabular-nums ${isProvisional ? "text-muted-foreground bg-muted" : ""} ${className ?? ""}`}
      title={title}
    >
      <Star
        className={
          isProvisional
            ? "text-muted-foreground size-3"
            : "size-3 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
        }
        aria-hidden="true"
      />
      {label}
    </SemanticChip>
  );
}
