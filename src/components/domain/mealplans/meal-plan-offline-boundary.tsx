"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { MealPlanView } from "@/components/domain/mealplans/meal-plan-view";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity, putEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import type { MealPlanDetailDto } from "@/lib/mealplans/schema";

/**
 * Same "offline document bootstrap" pattern as
 * `CookingModeOfflineBoundary`/`GroceryListOfflineBoundary`.
 *
 * Identity comes from `useParams()`, not `serverMealPlan.id` — see
 * `DishOfflineBoundary`'s doc comment for why (`public/sw.js`'s route-
 * shell fallback can serve a different plan's cached payload for this
 * route pattern on a first-ever offline visit). When the ids disagree,
 * only the replica's own record for the real id is ever shown.
 */
export function MealPlanOfflineBoundary({
  serverMealPlan,
}: {
  serverMealPlan: MealPlanDetailDto | null;
}) {
  const { id: realMealPlanId } = useParams<{ id: string }>();
  const isShellFallback =
    serverMealPlan === null || serverMealPlan.id !== realMealPlanId;
  const [mealPlan, setMealPlan] = React.useState<MealPlanDetailDto | null>(
    isShellFallback ? null : serverMealPlan,
  );

  React.useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const local = await getEntity<MealPlanDetailDto>(
        "mealPlan",
        realMealPlanId,
      );
      if (cancelled) return;

      if (isShellFallback) {
        setMealPlan(local?.doc ?? null);
        return;
      }

      if (local?.dirty) {
        setMealPlan(local.doc);
        return;
      }

      await putEntity({
        entityType: "mealPlan",
        id: realMealPlanId,
        doc: serverMealPlan,
        serverRevision: new Date().toISOString(),
        localUpdatedAt: new Date().toISOString(),
        dirty: false,
        conflict: null,
      });
      setMealPlan(serverMealPlan);
    }

    void reconcile();
    const unsubscribe = onSyncActivity(() => void reconcile());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [realMealPlanId, isShellFallback, serverMealPlan]);

  if (!mealPlan) {
    return <OfflineShellPlaceholder />;
  }

  return <MealPlanView mealPlan={mealPlan} />;
}
