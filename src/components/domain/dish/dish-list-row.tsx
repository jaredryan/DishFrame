import Link from "next/link";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import {
  dishBasePath,
  type DishCardItem,
} from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export function DishListRow({
  dish,
  kind,
}: {
  dish: DishCardItem;
  kind: DishKindValue;
}) {
  return (
    <Link
      href={`${dishBasePath(kind)}/${dish.id}`}
      className="group border-border bg-card hover:border-ring/50 flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">
          {dish.currentTitle || "Untitled"}
        </span>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {dish.cuisine && <span>{dish.cuisine}</span>}
          <span>Updated {dateFormatter.format(dish.updatedAt)}</span>
        </div>
      </div>
      <StageBadge stage={dish.stage} className="shrink-0" />
    </Link>
  );
}
