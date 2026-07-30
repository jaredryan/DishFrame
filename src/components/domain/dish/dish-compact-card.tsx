import Link from "next/link";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { Badge } from "@/components/ui/badge";
import {
  dishBasePath,
  type DishCardItem,
} from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/**
 * Compact view: a genuinely scannable alternative to the image-led grid —
 * no image, title first with natural wrapping, then a chip row (cuisine,
 * lifecycle stage, last-updated) directly beneath it rather than a
 * full-width row with metadata pinned to a distant far edge.
 */
export function DishCompactCard({
  dish,
  kind,
}: {
  dish: DishCardItem;
  kind: DishKindValue;
}) {
  return (
    <Link
      href={`${dishBasePath(kind)}/${dish.id}`}
      className="group border-border bg-card hover:border-ring/50 focus-visible:ring-ring/50 flex flex-col gap-2 rounded-lg border px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="text-sm font-medium break-words sm:text-base">
        {dish.currentTitle || "Untitled"}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <StageBadge stage={dish.stage} />
        {dish.cuisine && <Badge variant="outline">{dish.cuisine}</Badge>}
        <Badge variant="outline">
          Updated {dateFormatter.format(dish.updatedAt)}
        </Badge>
      </div>
    </Link>
  );
}
