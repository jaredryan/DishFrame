import { Clock, Flame, Gauge, History, Soup } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { RatingBadge } from "@/components/domain/dish/rating-badge";
import { PlatePlaceholderIcon } from "@/components/domain/dish/plate-placeholder-icon";
import type { PrincipalRating } from "@/lib/reviews/queries";
import type { StageValue } from "@/lib/dishes/schema";

// Shared read-only Recipe/Part presentation pieces (nav/details QA batch
// item 7) — used by both the normal Details page and Version History so the
// two never drift into separate near-copies of the same content.

/** Same major section-heading treatment as "Details"/"Nutrition" in the editor. */
export function DetailSectionHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return <h2 className="font-heading text-lg font-medium">{children}</h2>;
}

/**
 * The responsive cover-photo treatment: a wide right-column image at `lg+`,
 * a compact full-width one above the content on narrow, and the same
 * placeholder either way when there's no photo. Renders both siblings —
 * drop `{children}` directly into the same two-column flex row as the rest
 * of the details column.
 */
export function DishCoverImage({
  imageAssetId,
}: {
  imageAssetId: string | null;
}) {
  const placeholder = (
    <div className="text-muted-foreground/80 flex size-full items-center justify-center">
      <PlatePlaceholderIcon className="size-24" aria-hidden="true" />
    </div>
  );
  return (
    <>
      <div className="border-border bg-muted relative hidden w-full overflow-hidden rounded-lg border lg:block lg:min-h-40 lg:w-[320px] lg:shrink-0">
        {imageAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
          <img
            src={`/api/images/${imageAssetId}`}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0">{placeholder}</div>
        )}
      </div>
      <div className="border-border bg-muted h-[200px] w-full overflow-hidden rounded-lg border lg:hidden">
        {imageAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
          <img
            src={`/api/images/${imageAssetId}`}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          placeholder
        )}
      </div>
    </>
  );
}

/** The lifecycle/identity + cooking-metadata chip row shown under the title. */
export function DishMetaChips({
  stage,
  versionLabel,
  cuisineNames,
  flavorProfileNames,
  tagNames,
  rating,
  lastCookedAt,
  yieldQuantity,
  yieldUnit,
  prepTimeMinutes,
  cookTimeMinutes,
  difficulty,
}: {
  stage?: StageValue;
  versionLabel: string;
  cuisineNames?: string[];
  flavorProfileNames?: string[];
  tagNames?: string[];
  rating?: PrincipalRating;
  lastCookedAt?: Date | null;
  yieldQuantity?: number | null;
  yieldUnit?: string | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  difficulty?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stage && <StageBadge stage={stage} />}
      <SemanticChip semantic="purple" className="tabular-nums">
        {versionLabel}
      </SemanticChip>
      {rating && rating.kind !== "none" && <RatingBadge rating={rating} />}
      {cuisineNames?.map((name) => (
        <SemanticChip key={`cuisine-${name}`} semantic="green">
          {name}
        </SemanticChip>
      ))}
      {flavorProfileNames?.map((name) => (
        <SemanticChip key={`flavor-${name}`} semantic="green">
          {name}
        </SemanticChip>
      ))}
      {tagNames?.map((name) => (
        <SemanticChip key={`tag-${name}`} semantic="neutral">
          {name}
        </SemanticChip>
      ))}
      {lastCookedAt && (
        <SemanticChip semantic="orange">
          <History className="size-3" aria-hidden="true" />
          Last cooked {lastCookedAt.toLocaleDateString()}
        </SemanticChip>
      )}
      {yieldQuantity != null && (
        <SemanticChip semantic="orange">
          <Soup className="size-3" aria-hidden="true" />
          Makes {yieldQuantity} {yieldUnit ?? ""}
        </SemanticChip>
      )}
      {prepTimeMinutes != null && (
        <Badge variant="outline" className="gap-1">
          <Clock className="size-3" aria-hidden="true" />
          Prep {prepTimeMinutes} min
        </Badge>
      )}
      {cookTimeMinutes != null && (
        <Badge variant="outline" className="gap-1">
          <Flame className="size-3" aria-hidden="true" />
          Cook {cookTimeMinutes} min
        </Badge>
      )}
      {difficulty && (
        <SemanticChip semantic="orange">
          <Gauge className="size-3" aria-hidden="true" />
          {difficulty}
        </SemanticChip>
      )}
    </div>
  );
}

export function DishDescriptionNote({
  description,
  versionNote,
}: {
  description?: string | null;
  versionNote?: string | null;
}) {
  if (!description && !versionNote) return null;
  return (
    <div className="flex flex-col gap-2">
      {description && (
        <p className="text-foreground text-sm whitespace-pre-wrap">
          {description}
        </p>
      )}
      {versionNote && (
        <p className="text-muted-foreground text-sm italic">{versionNote}</p>
      )}
    </div>
  );
}
