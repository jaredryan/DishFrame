import { prisma } from "@/lib/db/prisma";
import * as dishService from "@/lib/dishes/service";
import * as dishMetadata from "@/lib/dishes/dish-metadata";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  getOwnedDishDetailOrThrow,
} from "@/lib/dishes/queries";
import { buildCookableUnits, type CookableUnit } from "@/lib/cooking/queries";
import { toJsonSafe } from "@/lib/offline-sync/serialize";
import { dishToFormValues } from "@/components/domain/dish/dish-form-values";
import { decimalToNumber } from "@/lib/dishes/format";
import {
  dishContentSchema,
  versionChoiceSchema,
  restorableStageValues,
  type DishKindValue,
} from "@/lib/dishes/schema";
import { z } from "zod";
import type { SyncOpRegistry } from "@/lib/offline-sync/http";

/**
 * The offline replica's Dish document — one record per Dish, covering both
 * library browsing (title/stage/tags/cuisines/image) and full view/edit
 * (`content`, the exact `DishContentInput` shape the editor itself uses,
 * via the same `dishToFormValues` mapper the edit page calls). Kept as one
 * combined document rather than splitting "list row" and "detail" into two
 * entity records — a Recipe/Part is small enough that shipping full content
 * for every one of a user's Dishes at bootstrap is cheap, and it avoids a
 * second per-Dish fetch the moment a cached library row is opened.
 */
export type DishSnapshotDoc = {
  id: string;
  kind: DishKindValue;
  stage: string;
  archivedAt: string | null;
  currentVersionId: string | null;
  defaultScale: number | null;
  updatedAt: string;
  tagIds: string[];
  cuisineIds: string[];
  flavorProfileValueIds: string[];
  content: ReturnType<typeof dishToFormValues> | null;
  /** The exact shape `<DishDetailView>` renders — shipped verbatim
   * (`toJsonSafe`'d) so viewing a Recipe/Part offline uses the same
   * component and formatting as the online detail page, not a
   * second hand-built renderer of the editor's `content` shape above. */
  detail: unknown;
  /**
   * The exact "cookable units" template `startCookingSession`/
   * `addSessionUnits` derive from this Version server-side, shipped so an
   * offline "Start cooking" can show a real, correctly-scaled checklist
   * preview immediately (`src/lib/cooking/checklist-render.ts`'s pure
   * formatter, applied client-side to these same raw rows) without
   * reimplementing `buildCookableUnits`'s own enumeration logic. This is a
   * provisional preview only — §22.4's "never trusted from the client"
   * invariant is untouched: syncing a session created from this template
   * always re-derives the real checklist server-side from the live
   * DishVersion, ignoring whatever the offline preview showed (see
   * `cooking/service.ts`'s `startCookingSession` doc comment).
   */
  cookableUnits: CookableUnit[];
};

export async function buildDishSnapshot(
  userId: string,
  dishId: string,
  kind: DishKindValue,
): Promise<{ doc: DishSnapshotDoc; serverRevision: string }> {
  const dish = await getOwnedDishOrThrow(userId, dishId, kind);
  const selections = await dishMetadata.getDishMetadataSelections(dish.id);
  const detail = toJsonSafe(await getOwnedDishDetailOrThrow(userId, dishId, kind));

  let content: ReturnType<typeof dishToFormValues> | null = null;
  let cookableUnits: CookableUnit[] = [];
  if (dish.currentVersionId) {
    const version = await getDishScopedVersionContentOrThrow(
      dish.id,
      dish.currentVersionId,
    );
    content = dishToFormValues({
      stage: dish.stage,
      currentTitle: dish.currentTitle,
      cuisineIds: selections.cuisineIds,
      version,
    });
    cookableUnits = await buildCookableUnits(userId, dish, version);
  }

  const doc: DishSnapshotDoc = {
    id: dish.id,
    kind: dish.kind,
    stage: dish.stage,
    archivedAt: dish.archivedAt?.toISOString() ?? null,
    currentVersionId: dish.currentVersionId,
    defaultScale: decimalToNumber(dish.defaultScale),
    updatedAt: dish.updatedAt.toISOString(),
    tagIds: selections.tagIds,
    cuisineIds: selections.cuisineIds,
    flavorProfileValueIds: selections.flavorProfileValueIds,
    content,
    detail,
    cookableUnits,
  };

  return { doc, serverRevision: dish.updatedAt.toISOString() };
}

async function snapshotResult(userId: string, dishId: string, kind: DishKindValue) {
  const { doc, serverRevision } = await buildDishSnapshot(userId, dishId, kind);
  return { entityType: "dish", entityId: dishId, snapshot: doc, serverRevision };
}

const createPayloadSchema = z.object({
  clientDishId: z.string().min(1),
  clientVersionId: z.string().min(1),
  kind: z.enum(["RECIPE", "PART"]),
  content: dishContentSchema,
});

const editPayloadSchema = z.object({
  dishId: z.string().min(1),
  baseVersionId: z.string().min(1),
  kind: z.enum(["RECIPE", "PART"]),
  content: dishContentSchema,
  versionChoice: versionChoiceSchema.optional(),
});

const dishIdKindSchema = z.object({
  dishId: z.string().min(1),
  kind: z.enum(["RECIPE", "PART"]),
});

const restorePayloadSchema = dishIdKindSchema.extend({
  stage: z.enum(restorableStageValues),
});
const setTagsPayloadSchema = dishIdKindSchema.extend({ tagIds: z.array(z.string()) });
const setCuisinesPayloadSchema = dishIdKindSchema.extend({ cuisineIds: z.array(z.string()) });
const setFlavorProfilesPayloadSchema = dishIdKindSchema.extend({
  flavorProfileValueIds: z.array(z.string()),
});
const setDefaultScalePayloadSchema = dishIdKindSchema.extend({
  defaultScale: z.number().nullable(),
});
const preferredUnitOverridePayloadSchema = dishIdKindSchema.extend({
  ingredientLineageId: z.string().min(1),
  unit: z.string().min(1).optional(),
});

export const dishSyncOps: SyncOpRegistry = {
  "dish.create": async (userId, _entityId, rawPayload) => {
    const payload = createPayloadSchema.parse(rawPayload);
    await dishService.createDishWithVersion(userId, payload.kind, payload.content, undefined, {
      dishId: payload.clientDishId,
      versionId: payload.clientVersionId,
    });
    return snapshotResult(userId, payload.clientDishId, payload.kind);
  },

  "dish.edit": async (userId, _entityId, rawPayload) => {
    const payload = editPayloadSchema.parse(rawPayload);
    await dishService.editDish(
      userId,
      payload.dishId,
      payload.baseVersionId,
      payload.content,
      payload.versionChoice,
      payload.kind,
    );
    return snapshotResult(userId, payload.dishId, payload.kind);
  },

  "dish.archive": async (userId, _entityId, rawPayload) => {
    const payload = dishIdKindSchema.parse(rawPayload);
    await dishService.archiveDish(userId, payload.dishId, payload.kind);
    return snapshotResult(userId, payload.dishId, payload.kind);
  },

  "dish.restore": async (userId, _entityId, rawPayload) => {
    const payload = restorePayloadSchema.parse(rawPayload);
    await dishService.restoreDish(userId, payload.dishId, payload.stage, payload.kind);
    return snapshotResult(userId, payload.dishId, payload.kind);
  },

  "dish.toggleFavorite": async (userId, _entityId, rawPayload) => {
    const payload = dishIdKindSchema.parse(rawPayload);
    await dishMetadata.toggleFavorite(userId, payload.dishId, payload.kind);
    return snapshotResult(userId, payload.dishId, payload.kind);
  },

  "dish.setTags": async (userId, _entityId, rawPayload) => {
    const payload = setTagsPayloadSchema.parse(rawPayload);
    await dishMetadata.setDishTags(userId, payload.dishId, payload.kind, payload.tagIds);
    return snapshotResult(userId, payload.dishId, payload.kind);
  },

  "dish.setCuisines": async (userId, _entityId, rawPayload) => {
    const payload = setCuisinesPayloadSchema.parse(rawPayload);
    await dishMetadata.setDishCuisines(userId, payload.dishId, payload.kind, payload.cuisineIds);
    return snapshotResult(userId, payload.dishId, payload.kind);
  },

  "dish.setFlavorProfiles": async (userId, _entityId, rawPayload) => {
    const payload = setFlavorProfilesPayloadSchema.parse(rawPayload);
    await dishMetadata.setDishFlavorProfiles(
      userId,
      payload.dishId,
      payload.kind,
      payload.flavorProfileValueIds,
    );
    return snapshotResult(userId, payload.dishId, payload.kind);
  },

  "dish.setDefaultScale": async (userId, _entityId, rawPayload) => {
    const payload = setDefaultScalePayloadSchema.parse(rawPayload);
    await dishService.setDefaultScale(userId, payload.dishId, payload.defaultScale, payload.kind);
    return snapshotResult(userId, payload.dishId, payload.kind);
  },

  "dish.savePreferredUnitOverride": async (userId, _entityId, rawPayload) => {
    const payload = preferredUnitOverridePayloadSchema.parse(rawPayload);
    if (!payload.unit) throw new Error("unit is required to save an override.");
    await dishService.savePreferredUnitOverride(
      userId,
      payload.dishId,
      payload.ingredientLineageId,
      payload.unit,
      payload.kind,
    );
    return snapshotResult(userId, payload.dishId, payload.kind);
  },

  "dish.clearPreferredUnitOverride": async (userId, _entityId, rawPayload) => {
    const payload = preferredUnitOverridePayloadSchema.parse(rawPayload);
    await dishService.clearPreferredUnitOverride(
      userId,
      payload.dishId,
      payload.ingredientLineageId,
      payload.kind,
    );
    return snapshotResult(userId, payload.dishId, payload.kind);
  },
};

/** All of a user's Dishes (both kinds), for `/api/sync/bootstrap`. Full
 * content for every one — see `DishSnapshotDoc`'s doc comment for why this
 * is one combined document rather than a separate lightweight list row. */
export async function listAllDishSnapshots(
  userId: string,
): Promise<Array<{ doc: DishSnapshotDoc; serverRevision: string }>> {
  const dishes = await prisma.dish.findMany({
    where: { ownerId: userId },
    select: { id: true, kind: true },
  });
  return Promise.all(
    dishes.map((dish) => buildDishSnapshot(userId, dish.id, dish.kind)),
  );
}

/** Dishes changed since `since` (an ISO timestamp), for `/api/sync/pull`. */
export async function listChangedDishSnapshots(
  userId: string,
  since: Date,
): Promise<Array<{ doc: DishSnapshotDoc; serverRevision: string }>> {
  const dishes = await prisma.dish.findMany({
    where: { ownerId: userId, updatedAt: { gt: since } },
    select: { id: true, kind: true },
  });
  return Promise.all(
    dishes.map((dish) => buildDishSnapshot(userId, dish.id, dish.kind)),
  );
}
