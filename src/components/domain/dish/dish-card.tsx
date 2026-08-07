import Link from "next/link";
import { Star, UtensilsCrossed } from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { RatingBadge } from "@/components/domain/dish/rating-badge";
import type { DishKindValue, StageValue } from "@/lib/dishes/schema";
import type { PrincipalRating } from "@/lib/reviews/queries";

export type DishCardItem = {
  id: string;
  currentTitle: string | null;
  stage: StageValue;
  cuisine: string | null;
  updatedAt: Date;
  imageAssetId: string | null;
  isFavorite?: boolean;
  rating?: PrincipalRating;
};

// Shared with dish-compact-card.tsx, the other library view of the same data.
export function dishBasePath(kind: DishKindValue) {
  return kind === "PART" ? "/parts" : "/recipes";
}

/**
 * Grid view: image-led, per the design remediation pass — the photo is the
 * primary visual anchor, with title and compact metadata beneath it rather
 * than competing with it. Private images load through the existing
 * authorized `/api/images/[assetId]` route; an item with no photo gets a
 * restrained placeholder rather than an empty gap, so the grid keeps a
 * consistent rhythm either way.
 */
export function DishCard({
  dish,
  kind,
}: {
  dish: DishCardItem;
  kind: DishKindValue;
}) {
  return (
    <Link href={`${dishBasePath(kind)}/${dish.id}`} className="group block">
      <Card className="ring-border gap-0 overflow-hidden pt-0 transition-shadow group-hover:shadow-md">
        <div className="bg-muted relative aspect-[4/3] w-full overflow-hidden">
          {dish.imageAssetId ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
            <img
              src={`/api/images/${dish.imageAssetId}`}
              alt=""
              className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            // Slice 6A: a restrained food-themed placeholder rather than a
            // generic "missing image" glyph — reads as intentional in both
            // themes without competing with a real photo elsewhere in the
            // grid.
            <div className="text-muted-foreground/40 flex size-full items-center justify-center">
              <UtensilsCrossed className="size-8" aria-hidden="true" />
            </div>
          )}
          {dish.isFavorite && (
            <Star
              className="fill-brand-orange text-brand-orange absolute top-2 right-2 size-4 drop-shadow"
              aria-label="Favorite"
            />
          )}
        </div>
        <CardContent className="flex flex-col gap-1.5 pt-3">
          <CardTitle className="line-clamp-2 font-sans text-sm font-medium">
            {dish.currentTitle || "Untitled"}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <StageBadge stage={dish.stage} />
            {dish.rating && <RatingBadge rating={dish.rating} />}
            {dish.cuisine && (
              <span className="text-muted-foreground text-xs">
                {dish.cuisine}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
