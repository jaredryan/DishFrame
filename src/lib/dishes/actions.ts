"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage, PartHasLiveUsagesError } from "@/lib/errors";
import * as dishService from "@/lib/dishes/service";
import {
  listCurrentPartUsages,
  getOwnedDishOrThrow,
  type PartUsage,
} from "@/lib/dishes/queries";
import {
  dishContentSchema,
  duplicateDishSchema,
  restoreDishSchema,
  versionChoiceSchema,
  promoteHistoricalVersionSchema,
  updateVersionNoteSchema,
  updateVersionMetadataSchema,
  setDefaultScaleSchema,
  savePreferredUnitOverrideSchema,
  clearPreferredUnitOverrideSchema,
  propagatePartUpdateSchema,
  resolvePartUsageOccurrenceSchema,
  type DishActionState,
  type DishContentInput,
  type DishKindValue,
  type VersionChoiceValue,
  type PartUsageResolutionValue,
} from "@/lib/dishes/schema";
import type {
  PropagationSelection,
  PropagationOutcome,
} from "@/lib/dishes/service";

function basePath(kind: DishKindValue): "/recipes" | "/parts" {
  return kind === "PART" ? "/parts" : "/recipes";
}

function revalidateDish(kind: DishKindValue, dishId?: string) {
  revalidatePath(basePath(kind));
  if (dishId) {
    revalidatePath(`${basePath(kind)}/${dishId}`);
    revalidatePath(`${basePath(kind)}/${dishId}/edit`);
    revalidatePath(`${basePath(kind)}/${dishId}/compare`);
  }
}

function revalidateVersion(
  kind: DishKindValue,
  dishId: string,
  versionId: string,
) {
  revalidateDish(kind, dishId);
  revalidatePath(`${basePath(kind)}/${dishId}/versions/${versionId}`);
}

export async function createDish(
  kind: DishKindValue,
  values: DishContentInput,
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const input = dishContentSchema.parse(values);

    const dishId = await dishService.createDish(userId, kind, input);

    revalidateDish(kind, dishId);
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function editDish(
  kind: DishKindValue,
  dishId: string,
  baseVersionId: string,
  values: DishContentInput,
  versionChoice?: VersionChoiceValue,
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const input = dishContentSchema.parse(values);
    const parsedVersionChoice = versionChoice
      ? versionChoiceSchema.parse(versionChoice)
      : undefined;

    await dishService.editDish(
      userId,
      dishId,
      baseVersionId,
      input,
      parsedVersionChoice,
      kind,
    );

    revalidateDish(kind, dishId);
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function archiveDish(
  kind: DishKindValue,
  dishId: string,
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    await dishService.archiveDish(userId, dishId, kind);

    revalidateDish(kind, dishId);
    return { status: "success", dishId, message: "Archived." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function restoreDish(
  kind: DishKindValue,
  values: { dishId: string; stage: string },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, stage } = restoreDishSchema.parse(values);

    await dishService.restoreDish(userId, dishId, stage, kind);

    revalidateDish(kind, dishId);
    return { status: "success", dishId, message: "Restored." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

/**
 * PRODUCT_SPEC.md §40: the learning loop's "Change Stage" action and Stage-
 * progression suggestion confirmation both land here — a direct,
 * user-confirmed Stage change, never triggered automatically (§40.2).
 * Shares `restoreDishSchema`'s shape (same restorable Stage set) since both
 * are an ordinary Stage/archive-only change with no Version created.
 */
export async function updateDishStage(
  kind: DishKindValue,
  values: { dishId: string; stage: string },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, stage } = restoreDishSchema.parse(values);

    await dishService.updateDishStage(userId, dishId, stage, kind);

    revalidateDish(kind, dishId);
    return { status: "success", dishId, message: "Stage updated." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function duplicateDish(
  kind: DishKindValue,
  values: { dishId: string; sourceVersionId?: string },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, sourceVersionId } = duplicateDishSchema.parse(values);

    const newDishId = await dishService.duplicateDish(
      userId,
      dishId,
      sourceVersionId,
      kind,
    );

    revalidateDish(kind, newDishId);
    return { status: "success", dishId: newDishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function promoteHistoricalVersion(
  kind: DishKindValue,
  values: { dishId: string; versionId: string },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, versionId } = promoteHistoricalVersionSchema.parse(values);

    await dishService.promoteHistoricalVersion(userId, dishId, versionId, kind);

    revalidateVersion(kind, dishId, versionId);
    return { status: "success", dishId, message: "Promoted to a new version." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function updateVersionNote(
  kind: DishKindValue,
  values: { dishId: string; versionId: string; note: string | null },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, versionId, note } = updateVersionNoteSchema.parse(values);

    await dishService.updateVersionNote(userId, dishId, versionId, note, kind);

    revalidateVersion(kind, dishId, versionId);
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

/**
 * Version-trigger correction pass, PRODUCT_SPEC.md §7.2: edits description/
 * image in place on any selected Version — current or historical — without
 * creating a new one. Design remediation pass: no longer backed by a
 * standalone detail-page editor (removed) — description/image are now only
 * ever edited through the consolidated `DishEditor`, whose own Save already
 * routes an unchanged-except-metadata submission through this exact
 * in-place path via `editDish`'s own classification. Kept as its own
 * function (and its own integration coverage) since it's still the
 * documented, narrowly-scoped primitive for that one behavior.
 */
export async function updateVersionMetadata(
  kind: DishKindValue,
  values: {
    dishId: string;
    versionId: string;
    description: string | null;
    imageAssetId: string | null;
  },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, versionId, description, imageAssetId } =
      updateVersionMetadataSchema.parse(values);

    await dishService.updateVersionMetadata(
      userId,
      dishId,
      versionId,
      { description, imageAssetId },
      kind,
    );

    revalidateVersion(kind, dishId, versionId);
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function setDefaultScale(
  kind: DishKindValue,
  values: {
    dishId: string;
    defaultScale: number | null;
  },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, defaultScale } = setDefaultScaleSchema.parse(values);

    await dishService.setDefaultScale(userId, dishId, defaultScale, kind);

    revalidateDish(kind, dishId);
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function savePreferredUnitOverride(
  kind: DishKindValue,
  values: { dishId: string; ingredientLineageId: string; unit: string },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, ingredientLineageId, unit } =
      savePreferredUnitOverrideSchema.parse(values);

    await dishService.savePreferredUnitOverride(
      userId,
      dishId,
      ingredientLineageId,
      unit,
      kind,
    );

    revalidateDish(kind, dishId);
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function clearPreferredUnitOverride(
  kind: DishKindValue,
  values: { dishId: string; ingredientLineageId: string },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, ingredientLineageId } =
      clearPreferredUnitOverrideSchema.parse(values);

    await dishService.clearPreferredUnitOverride(
      userId,
      dishId,
      ingredientLineageId,
      kind,
    );

    revalidateDish(kind, dishId);
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type PropagatePartUpdateActionState =
  | { status: "success"; outcomes: PropagationOutcome[] }
  | { status: "error"; message: string };

/** PRODUCT_SPEC.md §72.4/§72.5: "Update everywhere" / "Choose Recipes and
 * Parts to update" — one call, one outcome per selected container. */
export async function propagatePartUpdate(values: {
  partDishId: string;
  newTargetVersionId: string;
  selections: PropagationSelection[];
  bump?: VersionChoiceValue;
}): Promise<PropagatePartUpdateActionState> {
  try {
    const userId = await requireUserId();
    const input = propagatePartUpdateSchema.parse(values);

    const outcomes = await dishService.propagatePartUpdate(
      userId,
      input.partDishId,
      input.newTargetVersionId,
      input.selections,
      input.bump,
    );

    revalidatePath("/parts");
    revalidatePath("/recipes");
    for (const outcome of outcomes) {
      revalidatePath(`/parts/${outcome.containerDishId}`);
      revalidatePath(`/recipes/${outcome.containerDishId}`);
    }

    return { status: "success", outcomes };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type ResolvePartUsageActionState =
  | { status: "success"; containerDishId: string }
  | { status: "error"; message: string };

/** PRODUCT_SPEC.md §74.2: resolves one current usage occurrence (detach,
 * replace, or remove) ahead of a Part's permanent deletion. Slice 6
 * correction pass §1: always a material change to the affected parent, so
 * `versionChoice` is required, same as `editDish`'s own cooking-change
 * choice. */
export async function resolvePartUsageOccurrence(values: {
  partDishId: string;
  containerDishId: string;
  lineageId: string;
  resolution: PartUsageResolutionValue;
  versionChoice: VersionChoiceValue;
  replacement?: { targetDishId: string; targetDishVersionId: string };
}): Promise<ResolvePartUsageActionState> {
  try {
    const userId = await requireUserId();
    const input = resolvePartUsageOccurrenceSchema.parse(values);

    const result = await dishService.resolvePartUsageOccurrence(
      userId,
      input.partDishId,
      input.containerDishId,
      input.lineageId,
      input.resolution,
      input.versionChoice,
      input.replacement,
    );

    revalidatePath(`/parts/${input.partDishId}`);
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${result.containerDishId}`);
    revalidatePath(`/parts/${result.containerDishId}`);

    return { status: "success", containerDishId: result.containerDishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type DeleteDishActionState =
  | { status: "success"; message: string }
  | { status: "error"; message: string; code?: "PART_HAS_LIVE_USAGES" };

export async function deleteDish(
  kind: DishKindValue,
  dishId: string,
): Promise<DeleteDishActionState> {
  try {
    const userId = await requireUserId();
    await dishService.deleteDish(userId, dishId, kind);

    revalidateDish(kind);
    return { status: "success", message: "Deleted." };
  } catch (error) {
    if (error instanceof PartHasLiveUsagesError) {
      return {
        status: "error",
        message: error.message,
        code: "PART_HAS_LIVE_USAGES",
      };
    }
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type GetCurrentPartUsagesActionState =
  | { status: "success"; usages: PartUsage[] }
  | { status: "error"; message: string };

/** Backs the delete-resolution dialog's incremental usage re-fetch — each
 * `resolvePartUsageOccurrence` call changes the live set, and the dialog
 * needs the fresh list without a full page navigation. */
export async function getCurrentPartUsages(
  partDishId: string,
): Promise<GetCurrentPartUsagesActionState> {
  try {
    const userId = await requireUserId();
    await getOwnedDishOrThrow(userId, partDishId, "PART");
    const usages = await listCurrentPartUsages(userId, partDishId);
    return { status: "success", usages };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
