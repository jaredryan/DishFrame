"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleFavorite } from "@/lib/dishes/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §45.9: a familiar one-tap Favorite action — a design
 * optimization over the protected Favorite tag, not a separate data model.
 */
export function FavoriteToggle({
  dishId,
  kind,
  isFavorite,
}: {
  dishId: string;
  kind: DishKindValue;
  isFavorite: boolean;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = React.useState(isFavorite);
  const [isPending, startTransition] = React.useTransition();

  // Resets local optimistic state when the server-provided `isFavorite`
  // changes (e.g. after `router.refresh()`) — adjusted during render rather
  // than in an effect, per React's guidance for state derived from props.
  const [prevIsFavorite, setPrevIsFavorite] = React.useState(isFavorite);
  if (isFavorite !== prevIsFavorite) {
    setPrevIsFavorite(isFavorite);
    setOptimistic(isFavorite);
  }

  function handleClick() {
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      const result = await toggleFavorite(kind, { dishId });
      if (result.status === "success") {
        router.refresh();
      } else {
        setOptimistic(!next);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={optimistic}
      aria-label={optimistic ? "Remove from Favorites" : "Add to Favorites"}
      title={optimistic ? "Remove from Favorites" : "Add to Favorites"}
    >
      <Star
        className={cn("size-4", optimistic && "text-brand-orange fill-current")}
        aria-hidden="true"
      />
    </Button>
  );
}
