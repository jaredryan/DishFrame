import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  sectionContentInclude,
  partLinkContentInclude,
} from "@/lib/dishes/queries";
import { versionContentToInput } from "@/lib/dishes/mappers";
import * as dishService from "@/lib/dishes/service";
import { assertNoPartCycle } from "@/lib/cycles/service";
import type {
  SectionInput,
  PartLinkInput,
  DishKindValue,
} from "@/lib/dishes/schema";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) for
 * the Slice 6 pre-gate scope — Part attach/detach validation and "create a
 * Part from local content" (§69). Propagation and deletion materialization
 * (Build Plan Review Gate 3) are deliberately not implemented here.
 */

export type PartLinkDisplayInfo = {
  title: string | null;
  majorVersion: number;
  minorVersion: number;
};

/**
 * PRODUCT_SPEC.md §68.5: a linked Part's *displayed name* is always a live
 * lookup against the target's current stable identity (`Dish.currentTitle`)
 * — never cached in form state or pinned at attach time — while its linked
 * *content* stays pinned to the exact `targetDishVersionId` (unaffected by
 * a later rename). Used by the editor to render each linked-Part row.
 */
export async function resolvePartLinkDisplayInfo(
  ownerId: string,
  targetDishId: string,
  targetDishVersionId: string,
): Promise<PartLinkDisplayInfo> {
  const targetDish = await prisma.dish.findFirst({
    where: { id: targetDishId, ownerId, kind: "PART" },
    select: { currentTitle: true },
  });
  if (!targetDish) {
    throw new NotFoundError("Part not found.");
  }
  const version = await prisma.dishVersion.findFirst({
    where: { id: targetDishVersionId, dishId: targetDishId },
    select: { majorVersion: true, minorVersion: true },
  });
  if (!version) {
    throw new NotFoundError("Version not found.");
  }
  return {
    title: targetDish.currentTitle,
    majorVersion: version.majorVersion,
    minorVersion: version.minorVersion,
  };
}

/**
 * PRODUCT_SPEC.md §68.1: the full Version history of a Part a caller may
 * attach — powers the picker's "choose a historical Version" option.
 */
export async function listAttachablePartVersions(
  ownerId: string,
  targetDishId: string,
) {
  await getOwnedDishOrThrow(ownerId, targetDishId, "PART");
  return prisma.dishVersion.findMany({
    where: { dishId: targetDishId },
    select: { id: true, majorVersion: true, minorVersion: true },
    orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
  });
}

export type PartAttachmentTarget = {
  targetDish: { id: string; currentTitle: string | null };
  targetVersion: { id: string; majorVersion: number; minorVersion: number };
};

/**
 * PRODUCT_SPEC.md §68.1/ARCHITECTURE_PROPOSAL.md §G.4: the attach-time
 * validation call — resolves the target Part and Version (defaulting to
 * current, per §68.1), confirms ownership, and runs the lightweight
 * single-target cycle check when attaching into an already-existing Part.
 * Never persists anything; the actual `PartLink` row is only ever written
 * as part of the container's own next `editDish` save.
 */
export async function validatePartAttachment(
  ownerId: string,
  container: { dishId: string | null; kind: DishKindValue },
  targetDishId: string,
  targetDishVersionId: string | undefined,
): Promise<PartAttachmentTarget> {
  const targetDish = await prisma.dish.findFirst({
    where: { id: targetDishId, ownerId, kind: "PART" },
  });
  if (!targetDish) {
    throw new NotFoundError("Part not found.");
  }

  // Cheap, immediate self-attach guard — the real identity-level cycle
  // check below (and editDish's authoritative re-check at save time) would
  // catch this too, but rejecting it before even querying the graph gives
  // faster feedback for the single most common mistake.
  if (container.dishId && container.dishId === targetDish.id) {
    throw new ValidationError(
      "A Part cannot contain itself, directly or indirectly.",
    );
  }

  const versionId = targetDishVersionId ?? targetDish.currentVersionId;
  if (!versionId) {
    throw new NotFoundError("This Part has no saved content to attach yet.");
  }

  const targetVersion = await prisma.dishVersion.findFirst({
    where: { id: versionId, dishId: targetDish.id },
    select: { id: true, majorVersion: true, minorVersion: true },
  });
  if (!targetVersion) {
    throw new NotFoundError("Version not found.");
  }

  // Only a Part being edited can ever contain a cycle (a Recipe can never
  // be a PartLink target, so it can never appear in anyone's reachable
  // set — ARCHITECTURE_PROPOSAL.md §D.6/§G.2). A brand-new, not-yet-saved
  // item (`container.dishId === null`) has no existing PartLinks anything
  // could form a cycle with yet.
  if (container.kind === "PART" && container.dishId) {
    await assertNoPartCycle(prisma, container.dishId, [
      { targetDishId: targetDish.id, targetDishVersionId: targetVersion.id },
    ]);
  }

  return {
    targetDish: { id: targetDish.id, currentTitle: targetDish.currentTitle },
    targetVersion,
  };
}

export type DetachedContent = {
  sections: SectionInput[];
  partLinks: PartLinkInput[];
};

function stripLineage(content: DetachedContent): DetachedContent {
  return {
    sections: content.sections.map((section) => ({
      ...section,
      lineageId: undefined,
      ingredients: section.ingredients.map((ingredient) => ({
        ...ingredient,
        lineageId: undefined,
        substitute: ingredient.substitute
          ? { ...ingredient.substitute, lineageId: undefined }
          : ingredient.substitute,
      })),
      instructions: section.instructions.map((instruction) => ({
        ...instruction,
        lineageId: undefined,
      })),
      partLinks: section.partLinks.map((link) => ({
        ...link,
        lineageId: undefined,
      })),
    })),
    partLinks: content.partLinks.map((link) => ({
      ...link,
      lineageId: undefined,
    })),
  };
}

/**
 * PRODUCT_SPEC.md §70.1: "copies the exact linked Part Version's resolved
 * content." Resolves one level (shallow, matching ARCHITECTURE_PROPOSAL.md
 * §G.5's editor-facing access pattern) — the target Version's own Sections
 * (with their Ingredients/Instructions) and its own linked Parts (top-level
 * and nested), promoted up one level into the container. A linked Part
 * found inside the detached content remains a live link to its own further
 * target; only the one occurrence the user actually detached stops being
 * live. Every row's `lineageId` is stripped so the editor always treats
 * this as brand-new local content, never confusable with the source Part's
 * own lineage (§70.1's "ends future Part-update suggestions for that
 * occurrence").
 */
export async function resolvePartVersionForDetach(
  ownerId: string,
  targetDishVersionId: string,
): Promise<DetachedContent> {
  const version = await prisma.dishVersion.findFirst({
    where: { id: targetDishVersionId, dish: { ownerId, kind: "PART" } },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
  if (!version) {
    throw new NotFoundError("Version not found.");
  }

  return stripLineage(
    versionContentToInput(version.sections, version.partLinks),
  );
}

function extractSectionOrThrow(
  sections: SectionInput[],
  sectionLineageId: string,
): { target: SectionInput; remaining: SectionInput[] } {
  const target = sections.find(
    (section) => section.lineageId === sectionLineageId,
  );
  if (!target) {
    throw new NotFoundError("Section not found.");
  }
  if (
    target.ingredients.length === 0 &&
    target.instructions.length === 0 &&
    target.partLinks.length === 0
  ) {
    throw new ValidationError(
      "This Section has no content to save as a reusable Part.",
    );
  }
  return {
    target,
    remaining: sections.filter(
      (section) => section.lineageId !== sectionLineageId,
    ),
  };
}

async function createPartFromSection(
  ownerId: string,
  tx: Prisma.TransactionClient,
  section: SectionInput,
  partTitle: string,
): Promise<{ id: string; currentVersionId: string }> {
  const newPartDish = await tx.dish.create({
    data: { ownerId, kind: "PART", stage: "IDEA", currentTitle: partTitle },
  });
  const newPartVersion = await tx.dishVersion.create({
    data: {
      dishId: newPartDish.id,
      majorVersion: 1,
      minorVersion: 0,
      title: partTitle,
    },
  });
  // Fresh lineage throughout — this Section's content now belongs to a
  // brand-new stable Part identity, independent of wherever it came from.
  const { sectionNames } = await dishService.insertSections(
    tx,
    newPartVersion.id,
    [section],
    [],
    { mintFreshLineage: true },
  );
  await tx.dish.update({
    where: { id: newPartDish.id },
    data: {
      currentVersionId: newPartVersion.id,
      currentStructuralSearchText: sectionNames.join(" ") || null,
    },
  });
  return { id: newPartDish.id, currentVersionId: newPartVersion.id };
}

/**
 * PRODUCT_SPEC.md §69.2 "Save as reusable Part" (create and link): one
 * transaction spanning both aggregates (ARCHITECTURE_PROPOSAL.md §I) —
 * creates the new Part at V1.0 from the selected Section's content, then
 * creates a new containing Version for the source Recipe/Part with that
 * Section replaced by a live top-level link to the just-created Part.
 * Section content and top-level linked Parts have independent position
 * sequences in this schema (no single interleaved order across both), so
 * the new link is appended to the container's existing top-level links
 * rather than claiming an exact interleaved position — flagged in the
 * Slice 6 report as a real, minor design choice, not silently decided.
 *
 * The prior Recipe/Part Version is left completely unchanged (§69.2's
 * "preserve the prior Recipe Version unchanged"). No cycle re-check is
 * needed: the new Part's own `id` cannot possibly already be reachable
 * from anything (same reasoning as `createDish`), and attaching it to the
 * container is a single, brand-new, non-cyclic edge by construction.
 */
export async function promoteLocalContentToPart(
  ownerId: string,
  containerDishId: string,
  containerKind: DishKindValue,
  baseVersionId: string,
  sectionLineageId: string,
  partTitle: string,
): Promise<{ newPartDishId: string; containerDishId: string }> {
  const container = await getOwnedDishOrThrow(
    ownerId,
    containerDishId,
    containerKind,
  );
  const base = await getDishScopedVersionContentOrThrow(
    container.id,
    baseVersionId,
  );
  const { sections, partLinks: topLevelPartLinks } = versionContentToInput(
    base.sections,
    base.partLinks,
  );
  const { target, remaining } = extractSectionOrThrow(
    sections,
    sectionLineageId,
  );

  return dishService.withVersionAllocation(async (tx) => {
    const newPart = await createPartFromSection(ownerId, tx, target, partTitle);

    const preEditHighestMajor = await dishService.highestMajorVersion(
      tx,
      container.id,
    );
    const baseWasAlreadyCurrentLine = base.majorVersion === preEditHighestMajor;
    const { majorVersion, minorVersion } = await dishService.nextVersionNumbers(
      tx,
      container.id,
      base.majorVersion,
      "MINOR",
    );

    const newContainerVersion = await tx.dishVersion.create({
      data: {
        dishId: container.id,
        majorVersion,
        minorVersion,
        title: container.currentTitle ?? base.title,
        description: base.description,
        imageAssetId: base.imageAssetId,
        yieldQuantity: base.yieldQuantity,
        yieldUnit: base.yieldUnit,
        prepTimeMinutes: base.prepTimeMinutes,
        cookTimeMinutes: base.cookTimeMinutes,
        difficulty: base.difficulty,
        sourceVersionId: base.id,
      },
    });

    const { sectionNames } = await dishService.insertSections(
      tx,
      newContainerVersion.id,
      remaining,
      [
        ...topLevelPartLinks,
        {
          targetDishId: newPart.id,
          targetDishVersionId: newPart.currentVersionId,
        },
      ],
      { mintFreshLineage: false },
    );

    // A MINOR bump only becomes current when the edited line was already
    // the highest major — identical rule to `editDish` (PRODUCT_SPEC.md
    // §13.5).
    if (baseWasAlreadyCurrentLine) {
      await tx.dish.update({
        where: { id: container.id },
        data: {
          currentVersionId: newContainerVersion.id,
          currentStructuralSearchText: sectionNames.join(" ") || null,
        },
      });
    }

    return { newPartDishId: newPart.id, containerDishId: container.id };
  });
}

/**
 * PRODUCT_SPEC.md §69.3 "Save a copy as Part": creates the new Part only —
 * the source Recipe/Part's own content and Version history are completely
 * untouched. Single-aggregate creation, no version-allocation retry needed
 * (only ever writes the new Part's own V1.0).
 */
export async function saveContentAsNewPart(
  ownerId: string,
  containerDishId: string,
  containerKind: DishKindValue,
  baseVersionId: string,
  sectionLineageId: string,
  partTitle: string,
): Promise<{ newPartDishId: string }> {
  const container = await getOwnedDishOrThrow(
    ownerId,
    containerDishId,
    containerKind,
  );
  const base = await getDishScopedVersionContentOrThrow(
    container.id,
    baseVersionId,
  );
  const { sections } = versionContentToInput(base.sections, base.partLinks);
  const { target } = extractSectionOrThrow(sections, sectionLineageId);

  return prisma.$transaction(async (tx) => {
    const newPart = await createPartFromSection(ownerId, tx, target, partTitle);
    return { newPartDishId: newPart.id };
  });
}
