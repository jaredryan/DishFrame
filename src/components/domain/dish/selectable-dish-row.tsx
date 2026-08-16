import { UtensilsCrossed, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { RatingBadge } from "@/components/domain/dish/rating-badge";
import { DishKindBadge } from "@/components/domain/dish/dish-kind-badge";
import { cn } from "@/lib/utils";
import type { DishKindValue, StageValue } from "@/lib/dishes/schema";
import type { PrincipalRating } from "@/lib/reviews/queries";

export type DishSelectionItem = {
  id: string;
  kind: DishKindValue;
  title: string;
  /** Empty string when Version doesn't apply to this row's context. */
  versionLabel: string;
  stage: StageValue;
  cuisine: string | null;
  imageAssetId: string | null;
  /** Custom tags only — the Favorite tag is a separate signal, never listed
   * here (matches every other tagNames convention in this codebase). */
  tagNames: string[];
  rating: PrincipalRating;
};

/**
 * The one rich Recipe/Part selection row shared by every modal that asks the
 * user to choose a Recipe/Part — Send, Publish, Add/Edit Meal, and the
 * `/cook` picker — so they read as one consistent treatment instead of each
 * modal inventing its own thin row. Visual baseline: the pre-existing Send/
 * Publish row (`ShareItemSelector`). Left: selection control, thumbnail,
 * name + Version, custom tags. Right: compact Recipe/Part, Stage, Cuisine,
 * and Rating chips, wrapping to a second row when the container is narrow.
 */
export function SelectableDishRow({
  item,
  selectionControl,
  selected = false,
  onSelect,
  onRemove,
  className,
}: {
  item: DishSelectionItem;
  selectionControl: "checkbox" | "radio" | "remove";
  /** Ignored (and unused) when `selectionControl` is "remove". */
  selected?: boolean;
  onSelect?: () => void;
  /** Required when `selectionControl` is "remove". */
  onRemove?: () => void;
  className?: string;
}) {
  const left = (
    <>
      {selectionControl === "checkbox" && (
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${item.title}`}
        />
      )}
      {selectionControl === "radio" && (
        <span
          aria-hidden="true"
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-primary bg-primary" : "border-input",
          )}
        >
          {selected && (
            <span className="bg-primary-foreground size-1.5 rounded-full" />
          )}
        </span>
      )}
      <div className="bg-muted flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
        {item.imageAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route
          <img
            src={`/api/images/${item.imageAssetId}`}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <UtensilsCrossed
            className="text-muted-foreground/40 size-4"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm">
          {item.title}
          {item.versionLabel && (
            <span className="text-muted-foreground font-normal">
              {" "}
              {item.versionLabel}
            </span>
          )}
        </p>
        {item.tagNames.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.tagNames.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[0.7rem]">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </>
  );

  // The "remove" row is always shown on the same tinted `bg-primary/5`
  // treatment a "selected" radio/checkbox row gets, so its kind badge should
  // read the same way even though there's no live `selected` toggle for it.
  const kindBadgeSelected = selectionControl === "remove" ? true : selected;

  const right = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      <DishKindBadge kind={item.kind} selected={kindBadgeSelected} />
      <StageBadge stage={item.stage} />
      {item.cuisine && <Badge variant="outline">{item.cuisine}</Badge>}
      <RatingBadge rating={item.rating} />
    </div>
  );

  if (selectionControl === "remove") {
    return (
      <div
        className={cn(
          "border-primary bg-primary/5 flex items-center gap-3 rounded-lg border p-2",
          className,
        )}
      >
        {left}
        {right}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${item.title}`}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    );
  }

  if (selectionControl === "radio") {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={cn(
          "hover:bg-muted/50 flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left",
          selected && "bg-primary/5 ring-primary/40 ring-1",
          className,
        )}
      >
        {left}
        {right}
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-3 p-2", className)}>
      {left}
      {right}
    </div>
  );
}
