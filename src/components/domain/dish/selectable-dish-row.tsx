import { UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { RatingBadge } from "@/components/domain/dish/rating-badge";
import { DishKindBadge } from "@/components/domain/dish/dish-kind-badge";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
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
 * user to choose a Recipe/Part — Send, Publish, Grocery, Add/Edit Meal, the
 * `/cook` picker, and Attach-a-Part — so they read as one consistent
 * treatment instead of each modal inventing its own thin row. Used by
 * `RecipePartPicker`, the shared search-and-select picker. Left: selection
 * control, thumbnail,
 * name + Version, custom tags. Right: compact Recipe/Part, Stage, Cuisine,
 * and Rating chips, wrapping to a second row when the container is narrow.
 */
export function SelectableDishRow({
  item,
  selectionControl,
  selected = false,
  onSelect,
  onRemove,
  disabled = false,
  statusLabel,
  className,
}: {
  item: DishSelectionItem;
  selectionControl: "checkbox" | "radio" | "remove";
  /** Ignored (and unused) when `selectionControl` is "remove". */
  selected?: boolean;
  onSelect?: () => void;
  /** Required when `selectionControl` is "remove". */
  onRemove?: () => void;
  /** Checkbox rows only: unselectable, e.g. already shared to this recipient. */
  disabled?: boolean;
  /** Short status chip shown when `disabled` (e.g. "Already shared", "Pending"). */
  statusLabel?: string;
  className?: string;
}) {
  // Selection control + thumbnail + name stay together on their own row at
  // every width — only the metadata below is allowed to drop to a second
  // row on narrow screens (mobile-responsiveness correction pass).
  const leftRow = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {selectionControl === "checkbox" && (
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          // The row itself also toggles on click (below) — stopping
          // propagation here keeps a direct checkbox click from ALSO
          // reaching the row's handler and double-toggling.
          onClick={(event) => event.stopPropagation()}
          disabled={disabled}
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
              <SemanticChip
                key={tag}
                semantic="neutral"
                className="text-[0.7rem]"
              >
                {tag}
              </SemanticChip>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // The "remove" row is always shown on the same tinted `bg-primary/5`
  // treatment a "selected" radio/checkbox row gets, so its kind badge should
  // read the same way even though there's no live `selected` toggle for it.
  const kindBadgeSelected = selectionControl === "remove" ? true : selected;

  const metadata = (
    <>
      {statusLabel && (
        <SemanticChip semantic="neutral">{statusLabel}</SemanticChip>
      )}
      <DishKindBadge kind={item.kind} selected={kindBadgeSelected} />
      <StageBadge stage={item.stage} />
      {item.cuisine && (
        <SemanticChip semantic="green">{item.cuisine}</SemanticChip>
      )}
      <RatingBadge rating={item.rating} />
    </>
  );

  // On narrow screens this metadata row drops below `leftRow` and wraps
  // freely instead of squeezing the name or forcing the row wider than its
  // container; `sm:` restores the original single-row, right-aligned
  // desktop treatment.
  const metadataRowClass =
    "flex w-full flex-wrap items-center gap-1 sm:w-auto sm:shrink-0 sm:justify-end";

  if (selectionControl === "remove") {
    return (
      <div
        className={cn(
          "border-primary bg-primary/5 flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center sm:gap-3",
          className,
        )}
      >
        {leftRow}
        <div className={metadataRowClass}>
          {metadata}
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
          "hover:bg-muted/50 flex w-full cursor-pointer flex-col gap-2 rounded-lg p-2 text-left sm:flex-row sm:items-center sm:gap-3",
          selected && "bg-primary/5 ring-primary/40 ring-1",
          className,
        )}
      >
        {leftRow}
        <div className={metadataRowClass}>{metadata}</div>
      </button>
    );
  }

  // Checkbox rows: the whole row is also a click target (not just the
  // checkbox itself), matching the radio variant's full-row click area.
  // The row is deliberately not a focusable/keyboard-operable element of
  // its own — the nested `Checkbox` above already is one, and duplicating
  // that (e.g. wrapping in a `role="button"`) would create a second,
  // redundant interactive/focus target reading the same row twice.
  return (
    <div
      onClick={disabled ? undefined : onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-lg p-2 sm:flex-row sm:items-center sm:gap-3",
        disabled ? "opacity-60" : "hover:bg-muted/50 cursor-pointer",
        className,
      )}
    >
      {leftRow}
      <div className={metadataRowClass}>{metadata}</div>
    </div>
  );
}
