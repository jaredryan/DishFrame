"use client";

import { useRouter } from "next/navigation";
import { Star, Eye, Pencil } from "lucide-react";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { RatingBadge } from "@/components/domain/dish/rating-badge";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import { Badge } from "@/components/ui/badge";
import { EntityRowActions } from "@/components/ui/entity-row-actions";
import { DishKindBadge } from "@/components/domain/dish/dish-kind-badge";
import {
  dishBasePath,
  type DishCardItem,
} from "@/components/domain/dish/dish-card";
import {
  CLICKABLE_ROW_CLASS,
  ClickableRowOverlay,
} from "@/components/ui/clickable-row";
import { cn } from "@/lib/utils";
import type { DishKindValue } from "@/lib/dishes/schema";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/**
 * Compact view: a genuinely scannable alternative to the image-led grid —
 * no image, title first with natural wrapping, then a chip row (cuisine,
 * lifecycle stage, last-updated) directly beneath it. The whole row is also
 * a click target for View, its primary/leftmost action; Edit stays an
 * explicit icon-only control.
 */
export function DishCompactCard({
  dish,
  kind,
  showKind = false,
}: {
  dish: DishCardItem;
  kind: DishKindValue;
  /** Home dashboard's "Recently updated" combines Recipes and Parts in one
   * list — this surfaces the type badge that a kind-scoped library page
   * doesn't need. */
  showKind?: boolean;
}) {
  const router = useRouter();
  const basePath = dishBasePath(kind);
  const title = dish.currentTitle || "Untitled";

  return (
    <div
      className={cn(
        "border-border bg-card @container relative flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
        CLICKABLE_ROW_CLASS,
      )}
    >
      <ClickableRowOverlay
        href={`${basePath}/${dish.id}`}
        label={`View ${title}`}
      />
      <div className="min-w-0">
        <span className="text-foreground flex items-center gap-1.5 text-sm font-medium break-words">
          {dish.isFavorite && (
            <Star
              className="fill-brand-orange text-brand-orange size-3.5 shrink-0"
              aria-label="Favorite"
            />
          )}
          {title}
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showKind && <DishKindBadge kind={kind} />}
          <StageBadge stage={dish.stage} />
          {dish.rating && <RatingBadge rating={dish.rating} />}
          {dish.cuisineNames.map((cuisineName) => (
            <SemanticChip key={cuisineName} semantic="green">
              {cuisineName}
            </SemanticChip>
          ))}
          <Badge variant="outline">
            Updated {dateFormatter.format(dish.updatedAt)}
          </Badge>
        </div>
      </div>
      <EntityRowActions
        className="relative z-10"
        actions={[
          {
            key: "view",
            label: `View ${title}`,
            tooltip: "View",
            icon: Eye,
            onClick: () => router.push(`${basePath}/${dish.id}`),
          },
          {
            key: "edit",
            label: `Edit ${title}`,
            tooltip: "Edit",
            icon: Pencil,
            onClick: () => router.push(`${basePath}/${dish.id}/edit`),
          },
        ]}
      />
    </div>
  );
}
