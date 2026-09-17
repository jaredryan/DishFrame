"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { MealPlanEditor } from "@/components/domain/mealplans/meal-plan-editor";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity, putEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import type { MealPlanDetailDto } from "@/lib/mealplans/schema";
import type { MealPlanEntryCandidate } from "@/lib/mealplans/queries";

const EDITOR_OPTIONS_ID = "mealPlanEditorOptions";

type EditorOptions = {
  candidates: MealPlanEntryCandidate[];
  tagOptions: { id: string; displayName: string }[];
  cuisineOptions: { id: string; displayName: string }[];
  flavorProfileOptions: { id: string; displayName: string }[];
};

type Props =
  | {
      mode: "create";
      mealPlanId?: undefined;
      serverMealPlan?: undefined;
      serverOptions: EditorOptions;
    }
  | {
      mode: "edit";
      mealPlanId: string;
      // `null` for the proactively-precached neutral shell and for a real
      // navigation served that same shell (`public/sw.js`'s route-shell
      // fallback) — see `DishOfflineBoundary`'s doc comment for the full
      // reasoning.
      serverMealPlan: MealPlanDetailDto | null;
      serverOptions: EditorOptions;
    };

/**
 * Offline document bootstrap for the Meal Plan editor — reconciles both the
 * plan being edited (edit mode only) and the shared candidate-Dish/tag/
 * cuisine/flavor-profile option lists (`referenceData`, bootstrapped once
 * for the whole account, not per-plan) against the local replica, same
 * pattern as `MealPlanOfflineBoundary`/`GroceryListOfflineBoundary`.
 */
export function MealPlanEditorOfflineBoundary(props: Props) {
  // Identity for edit mode comes from `useParams()`, not the `mealPlanId`/
  // `serverMealPlan` props — see `DishOfflineBoundary`'s doc comment for
  // why (`public/sw.js`'s route-shell fallback can serve a different
  // plan's cached payload for this route pattern on a first-ever offline
  // visit). Called unconditionally (hooks can't be conditional); unused in
  // "create" mode, which has no per-record identity to mismatch.
  const params = useParams<{ id?: string }>();
  const realMealPlanId =
    props.mode === "edit" ? (params.id ?? props.mealPlanId) : undefined;
  const isShellFallback =
    props.mode === "edit" &&
    (props.serverMealPlan === null ||
      props.serverMealPlan.id !== realMealPlanId);

  const [mealPlan, setMealPlan] = React.useState<MealPlanDetailDto | undefined>(
    props.mode === "edit" && !isShellFallback
      ? (props.serverMealPlan ?? undefined)
      : undefined,
  );
  const [options, setOptions] = React.useState<EditorOptions>(
    props.serverOptions,
  );

  React.useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      if (props.mode === "edit" && realMealPlanId) {
        const local = await getEntity<MealPlanDetailDto>(
          "mealPlan",
          realMealPlanId,
        );
        if (cancelled) return;
        if (isShellFallback || !props.serverMealPlan) {
          setMealPlan(local?.doc);
        } else if (local?.dirty) {
          setMealPlan(local.doc);
        } else {
          const serverMealPlan = props.serverMealPlan;
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
      }

      const localOptions = await getEntity<EditorOptions>(
        "referenceData",
        EDITOR_OPTIONS_ID,
      );
      if (cancelled) return;
      if (localOptions?.doc) {
        setOptions(localOptions.doc);
      }
      // Always persist fresh server options when this render has them —
      // reference data has no "dirty" concept of its own (it's never
      // edited locally), so there's no risk of clobbering an unsynced
      // change here.
      await putEntity({
        entityType: "referenceData",
        id: EDITOR_OPTIONS_ID,
        doc: props.serverOptions,
        serverRevision: new Date().toISOString(),
        localUpdatedAt: new Date().toISOString(),
        dirty: false,
        conflict: null,
      });
      setOptions(props.serverOptions);
    }

    void reconcile();
    const unsubscribe = onSyncActivity(() => void reconcile());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    props.mode,
    realMealPlanId,
    isShellFallback,
    props.serverMealPlan,
    props.serverOptions,
  ]);

  if (props.mode === "edit") {
    if (!mealPlan) {
      return <OfflineShellPlaceholder />;
    }
    return (
      <MealPlanEditor
        mode="edit"
        mealPlan={mealPlan}
        candidates={options.candidates}
        tagOptions={options.tagOptions}
        cuisineOptions={options.cuisineOptions}
        flavorProfileOptions={options.flavorProfileOptions}
      />
    );
  }

  return (
    <MealPlanEditor
      mode="create"
      candidates={options.candidates}
      tagOptions={options.tagOptions}
      cuisineOptions={options.cuisineOptions}
      flavorProfileOptions={options.flavorProfileOptions}
    />
  );
}
