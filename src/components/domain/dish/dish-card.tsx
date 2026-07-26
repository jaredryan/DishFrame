import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import type { DishKindValue, StageValue } from "@/lib/dishes/schema";

export type DishCardItem = {
  id: string;
  currentTitle: string | null;
  stage: StageValue;
  cuisine: string | null;
  updatedAt: Date;
};

// Shared with dish-list-row.tsx, the other library view of the same data.
export function dishBasePath(kind: DishKindValue) {
  return kind === "PART" ? "/parts" : "/recipes";
}

export function DishCard({
  dish,
  kind,
}: {
  dish: DishCardItem;
  kind: DishKindValue;
}) {
  return (
    <Link href={`${dishBasePath(kind)}/${dish.id}`} className="group">
      <Card className="ring-border transition-shadow group-hover:shadow-md">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2">
              {dish.currentTitle || "Untitled"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <StageBadge stage={dish.stage} />
          {dish.cuisine && (
            <span className="text-muted-foreground text-xs">
              {dish.cuisine}
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
