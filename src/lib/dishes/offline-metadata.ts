"use client";

import { runOrQueueMutation } from "@/lib/offline/mutate";
import { generateClientId } from "@/lib/offline/ids";
import { getEntity } from "@/lib/offline/db";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { ToggleFavoriteActionState } from "@/lib/dishes/actions";
import type {
  DishSnapshotDoc,
  DishLibraryOptionsDoc,
} from "@/lib/offline-sync/dishes";
import type { DishDetailViewProps } from "@/lib/dishes/detail-view";

type ActionState = { status: "success" } | { status: "error"; message: string };

async function libraryOptions(): Promise<DishLibraryOptionsDoc> {
  const record = await getEntity<DishLibraryOptionsDoc>(
    "referenceData",
    "dishLibraryOptions",
  );
  return (
    record?.doc ?? {
      tagOptions: [],
      cuisineOptions: [],
      flavorProfileOptions: [],
    }
  );
}

/** Re-derives the handful of `detail` display fields that mirror
 * tag/cuisine/Flavor-profile *selections* (names, not just ids) so
 * `<DishDetailView>` reflects an offline edit immediately, using the
 * already-replicated `dishLibraryOptions` reference data for id->name
 * resolution — the same lookup `lib/dishes/offline-library.ts` uses. */
function patchDetailMetadata(
  detail: unknown,
  options: DishLibraryOptionsDoc,
  patch: {
    tagIds?: string[];
    cuisineIds?: string[];
    flavorProfileValueIds?: string[];
  },
): unknown {
  if (!detail || !(detail as DishDetailViewProps).hasVersion) return detail;
  const hasVersionDetail = detail as Extract<
    DishDetailViewProps,
    { hasVersion: true }
  >;
  const tagById = new Map(options.tagOptions.map((t) => [t.id, t]));
  const cuisineNameById = new Map(
    options.cuisineOptions.map((c) => [c.id, c.displayName]),
  );
  const flavorProfileNameById = new Map(
    options.flavorProfileOptions.map((f) => [f.id, f.displayName]),
  );
  return {
    ...hasVersionDetail,
    ...(patch.tagIds
      ? {
          isFavorite: patch.tagIds.some((id) => tagById.get(id)?.isFavorite),
          tagNames: patch.tagIds
            .map((id) => tagById.get(id))
            .filter((t) => t && !t.isFavorite)
            .map((t) => t!.displayName),
          selectedTagIds: patch.tagIds,
        }
      : {}),
    ...(patch.cuisineIds
      ? {
          cuisineNames: patch.cuisineIds
            .map((id) => cuisineNameById.get(id))
            .filter((name): name is string => Boolean(name)),
          selectedCuisineIds: patch.cuisineIds,
        }
      : {}),
    ...(patch.flavorProfileValueIds
      ? {
          flavorProfileNames: patch.flavorProfileValueIds
            .map((id) => flavorProfileNameById.get(id))
            .filter((name): name is string => Boolean(name)),
          selectedFlavorProfileValueIds: patch.flavorProfileValueIds,
        }
      : {}),
  };
}

/**
 * Drop-in offline-capable replacements for the Dish-metadata Server
 * Actions `FavoriteToggle`/`DishTagFlavorEditor` call directly today —
 * same names/signatures, routed through the `dish.*` sync ops that were
 * already built but unused by these two components
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md §5).
 */
export async function toggleFavoriteOffline(
  kind: DishKindValue,
  values: { dishId: string },
): Promise<ToggleFavoriteActionState> {
  const existing = await getEntity<DishSnapshotDoc>("dish", values.dishId);
  const options = await libraryOptions();
  const tagById = new Map(options.tagOptions.map((t) => [t.id, t]));
  const favoriteTagId = options.tagOptions.find((t) => t.isFavorite)?.id;
  const currentTagIds = existing?.doc.tagIds ?? [];
  const isCurrentlyFavorite = currentTagIds.some(
    (id) => tagById.get(id)?.isFavorite,
  );
  const nextTagIds = isCurrentlyFavorite
    ? currentTagIds.filter((id) => !tagById.get(id)?.isFavorite)
    : favoriteTagId
      ? [...currentTagIds, favoriteTagId]
      : currentTagIds;

  const result = await runOrQueueMutation({
    op: "dish.toggleFavorite",
    entityType: "dish",
    entityId: values.dishId,
    payload: { dishId: values.dishId, kind },
    optimisticDoc: (current: unknown) => {
      const doc = current as DishSnapshotDoc | undefined;
      if (!doc) return current;
      return {
        ...doc,
        tagIds: nextTagIds,
        detail: patchDetailMetadata(doc.detail, options, {
          tagIds: nextTagIds,
        }),
      };
    },
    mutationId: generateClientId(),
  });
  if (!result.ok) return { status: "error", message: result.message };
  return {
    status: "success",
    dishId: values.dishId,
    isFavorite: !isCurrentlyFavorite,
  };
}

export async function setDishTagsOffline(
  kind: DishKindValue,
  values: { dishId: string; tagIds: string[] },
): Promise<ActionState> {
  const options = await libraryOptions();
  const result = await runOrQueueMutation({
    op: "dish.setTags",
    entityType: "dish",
    entityId: values.dishId,
    payload: { dishId: values.dishId, kind, tagIds: values.tagIds },
    optimisticDoc: (current: unknown) => {
      const doc = current as DishSnapshotDoc | undefined;
      if (!doc) return current;
      return {
        ...doc,
        tagIds: values.tagIds,
        detail: patchDetailMetadata(doc.detail, options, {
          tagIds: values.tagIds,
        }),
      };
    },
    mutationId: generateClientId(),
  });
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function setDishFlavorProfilesOffline(
  kind: DishKindValue,
  values: { dishId: string; flavorProfileValueIds: string[] },
): Promise<ActionState> {
  const options = await libraryOptions();
  const result = await runOrQueueMutation({
    op: "dish.setFlavorProfiles",
    entityType: "dish",
    entityId: values.dishId,
    payload: {
      dishId: values.dishId,
      kind,
      flavorProfileValueIds: values.flavorProfileValueIds,
    },
    optimisticDoc: (current: unknown) => {
      const doc = current as DishSnapshotDoc | undefined;
      if (!doc) return current;
      return {
        ...doc,
        flavorProfileValueIds: values.flavorProfileValueIds,
        detail: patchDetailMetadata(doc.detail, options, {
          flavorProfileValueIds: values.flavorProfileValueIds,
        }),
      };
    },
    mutationId: generateClientId(),
  });
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function setDishCuisinesOffline(
  kind: DishKindValue,
  values: { dishId: string; cuisineIds: string[] },
): Promise<ActionState> {
  const options = await libraryOptions();
  const result = await runOrQueueMutation({
    op: "dish.setCuisines",
    entityType: "dish",
    entityId: values.dishId,
    payload: { dishId: values.dishId, kind, cuisineIds: values.cuisineIds },
    optimisticDoc: (current: unknown) => {
      const doc = current as DishSnapshotDoc | undefined;
      if (!doc) return current;
      return {
        ...doc,
        cuisineIds: values.cuisineIds,
        detail: patchDetailMetadata(doc.detail, options, {
          cuisineIds: values.cuisineIds,
        }),
      };
    },
    mutationId: generateClientId(),
  });
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}
