"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as sectionsService from "@/lib/sections/service";
import {
  validatePartAttachmentSchema,
  resolvePartVersionForDetachSchema,
  createPartFromSectionSchema,
} from "@/lib/sections/schema";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { DetachedContent } from "@/lib/sections/service";

function basePath(kind: DishKindValue): "/recipes" | "/parts" {
  return kind === "PART" ? "/parts" : "/recipes";
}

export type PartLinkDisplayActionState =
  | {
      status: "success";
      title: string | null;
      majorVersion: number;
      minorVersion: number;
    }
  | { status: "error"; message: string };

/** PRODUCT_SPEC.md §68.5: a linked Part's live displayed name + pinned
 * Version label, resolved fresh for each render — never cached. */
export async function getPartLinkDisplay(values: {
  targetDishId: string;
  targetDishVersionId: string;
}): Promise<PartLinkDisplayActionState> {
  try {
    const userId = await requireUserId();
    const info = await sectionsService.resolvePartLinkDisplayInfo(
      userId,
      values.targetDishId,
      values.targetDishVersionId,
    );
    return { status: "success", ...info };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type PartVersionOption = {
  id: string;
  majorVersion: number;
  minorVersion: number;
};

export type ListAttachablePartVersionsActionState =
  | { status: "success"; versions: PartVersionOption[] }
  | { status: "error"; message: string };

export async function listAttachablePartVersions(
  targetDishId: string,
): Promise<ListAttachablePartVersionsActionState> {
  try {
    const userId = await requireUserId();
    const versions = await sectionsService.listAttachablePartVersions(
      userId,
      targetDishId,
    );
    return { status: "success", versions };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type PartAttachmentActionState =
  | {
      status: "success";
      target: {
        targetDishId: string;
        targetTitle: string | null;
        targetVersionId: string;
        majorVersion: number;
        minorVersion: number;
      };
    }
  | { status: "error"; message: string };

/**
 * PRODUCT_SPEC.md §68.1: the "Attach a Part" picker's validation call —
 * never persists anything. The real `PartLink` row only ever gets written
 * as part of the container's own next save (`editDish`), which re-runs the
 * authoritative cycle check itself.
 */
export async function validatePartAttachment(values: {
  containerDishId: string | null;
  containerKind: DishKindValue;
  targetDishId: string;
  targetDishVersionId?: string;
}): Promise<PartAttachmentActionState> {
  try {
    const userId = await requireUserId();
    const input = validatePartAttachmentSchema.parse(values);

    const result = await sectionsService.validatePartAttachment(
      userId,
      { dishId: input.containerDishId, kind: input.containerKind },
      input.targetDishId,
      input.targetDishVersionId,
    );

    return {
      status: "success",
      target: {
        targetDishId: result.targetDish.id,
        targetTitle: result.targetDish.currentTitle,
        targetVersionId: result.targetVersion.id,
        majorVersion: result.targetVersion.majorVersion,
        minorVersion: result.targetVersion.minorVersion,
      },
    };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type DetachPartLinkActionState =
  | { status: "success"; content: DetachedContent }
  | { status: "error"; message: string };

/** PRODUCT_SPEC.md §70.1: fetches the shallow content to inline — the
 * editor drops the live link and splices this into local form state. */
export async function resolvePartVersionForDetach(values: {
  targetDishVersionId: string;
}): Promise<DetachPartLinkActionState> {
  try {
    const userId = await requireUserId();
    const { targetDishVersionId } =
      resolvePartVersionForDetachSchema.parse(values);

    const content = await sectionsService.resolvePartVersionForDetach(
      userId,
      targetDishVersionId,
    );
    return { status: "success", content };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type CreatePartFromSectionActionState =
  | { status: "success"; newPartDishId: string }
  | { status: "error"; message: string };

/** PRODUCT_SPEC.md §69.2 "Save as reusable Part" — create and link. */
export async function promoteLocalContentToPart(values: {
  containerDishId: string;
  containerKind: DishKindValue;
  baseVersionId: string;
  sectionLineageId: string;
  partTitle: string;
}): Promise<CreatePartFromSectionActionState> {
  try {
    const userId = await requireUserId();
    const input = createPartFromSectionSchema.parse(values);

    const result = await sectionsService.promoteLocalContentToPart(
      userId,
      input.containerDishId,
      input.containerKind,
      input.baseVersionId,
      input.sectionLineageId,
      input.partTitle,
    );

    const containerBase = basePath(input.containerKind);
    revalidatePath(containerBase);
    revalidatePath(`${containerBase}/${result.containerDishId}`);
    revalidatePath(`${containerBase}/${result.containerDishId}/edit`);
    revalidatePath("/parts");
    revalidatePath(`/parts/${result.newPartDishId}`);

    return { status: "success", newPartDishId: result.newPartDishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

/** PRODUCT_SPEC.md §69.3 "Save a copy as Part" — source left untouched. */
export async function saveContentAsNewPart(values: {
  containerDishId: string;
  containerKind: DishKindValue;
  baseVersionId: string;
  sectionLineageId: string;
  partTitle: string;
}): Promise<CreatePartFromSectionActionState> {
  try {
    const userId = await requireUserId();
    const input = createPartFromSectionSchema.parse(values);

    const result = await sectionsService.saveContentAsNewPart(
      userId,
      input.containerDishId,
      input.containerKind,
      input.baseVersionId,
      input.sectionLineageId,
      input.partTitle,
    );

    revalidatePath("/parts");
    revalidatePath(`/parts/${result.newPartDishId}`);

    return { status: "success", newPartDishId: result.newPartDishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
