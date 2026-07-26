import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import {
  removeEmptySections,
  hasMinimumContent,
  type DishContentInput,
  type SectionInput,
  type IngredientInput,
  type StageValue,
  type RestorableStageValue,
  type DishKindValue,
} from "@/lib/dishes/schema";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) — see
 * src/lib/tasters/service.ts for the same rationale.
 *
 * Only two entry points ever create DishVersion content
 * (ARCHITECTURE_PROPOSAL.md §F.10/§F.5): `createDish` (V1.0) and `editDish`
 * (a "save small update" within the current major line — Slice 3 does not
 * yet expose the small-update/new-major-version choice itself, since
 * historical-major navigation is Slice 4 scope; see docs/BUILD_PLAN.md).
 * DishVersion rows are never updated or deleted directly outside these
 * functions and `duplicateDish`.
 */

function nextArchivedAt(
  previousStage: StageValue,
  previousArchivedAt: Date | null,
  nextStage: StageValue,
): Date | null {
  if (nextStage === "ARCHIVED") {
    return previousStage === "ARCHIVED" ? previousArchivedAt : new Date();
  }
  return null;
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value ? value.toNumber() : null;
}

type IngredientWithSubstitute = Prisma.IngredientGetPayload<{
  include: { substitute: true };
}>;

function toIngredientInput(
  ingredient: IngredientWithSubstitute,
): IngredientInput {
  return {
    name: ingredient.name,
    quantity: decimalToNumber(ingredient.quantity),
    quantityEnd: decimalToNumber(ingredient.quantityEnd),
    isApproximate: ingredient.isApproximate,
    unit: ingredient.unit,
    displayText: ingredient.displayText,
    preparationNote: ingredient.preparationNote,
    isOptional: ingredient.isOptional,
    substitute: ingredient.substitute
      ? {
          name: ingredient.substitute.name,
          quantity: decimalToNumber(ingredient.substitute.quantity),
          quantityEnd: decimalToNumber(ingredient.substitute.quantityEnd),
          isApproximate: ingredient.substitute.isApproximate,
          unit: ingredient.substitute.unit,
          displayText: ingredient.substitute.displayText,
          preparationNote: ingredient.substitute.preparationNote,
        }
      : null,
  };
}

/**
 * Inserts Section/Ingredient/Instruction rows for a just-created DishVersion
 * and returns the Section names, used to refresh Dish.currentStructuralSearchText
 * (ARCHITECTURE_PROPOSAL.md §D.1 — round-3 Correction 6).
 *
 * `mintFreshLineage: true` for creation and duplication (every row starts a
 * brand-new lineage); `false` for an edit, which carries a row's existing
 * `lineageId` forward when the editor supplied one, and mints a fresh one
 * only for genuinely new content (§D.-1).
 */
async function insertSections(
  tx: Prisma.TransactionClient,
  dishVersionId: string,
  sections: SectionInput[],
  { mintFreshLineage }: { mintFreshLineage: boolean },
): Promise<{ sectionNames: string[] }> {
  const sectionNames: string[] = [];

  function lineageFor(id: string | undefined): string {
    return mintFreshLineage ? randomUUID() : (id ?? randomUUID());
  }

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    if (section.name) sectionNames.push(section.name);

    const sectionRow = await tx.section.create({
      data: {
        lineageId: lineageFor(section.lineageId),
        dishVersionId,
        name: section.name || null,
        guidanceNote: section.guidanceNote || null,
        position: si,
      },
    });

    for (let ii = 0; ii < section.ingredients.length; ii++) {
      const ingredient = section.ingredients[ii];
      const ingredientRow = await tx.ingredient.create({
        data: {
          lineageId: lineageFor(ingredient.lineageId),
          dishVersionId,
          sectionId: sectionRow.id,
          name: ingredient.name,
          quantity: ingredient.quantity ?? null,
          quantityEnd: ingredient.quantityEnd ?? null,
          isApproximate: ingredient.isApproximate,
          unit: ingredient.unit || null,
          displayText: ingredient.displayText || null,
          preparationNote: ingredient.preparationNote || null,
          isOptional: ingredient.isOptional,
          position: ii,
        },
      });

      if (ingredient.substitute) {
        await tx.ingredient.create({
          data: {
            lineageId: lineageFor(ingredient.substitute.lineageId),
            dishVersionId,
            sectionId: sectionRow.id,
            name: ingredient.substitute.name,
            quantity: ingredient.substitute.quantity ?? null,
            quantityEnd: ingredient.substitute.quantityEnd ?? null,
            isApproximate: ingredient.substitute.isApproximate,
            unit: ingredient.substitute.unit || null,
            displayText: ingredient.substitute.displayText || null,
            preparationNote: ingredient.substitute.preparationNote || null,
            position: ii,
            substituteForIngredientId: ingredientRow.id,
          },
        });
      }
    }

    for (let ti = 0; ti < section.instructions.length; ti++) {
      const instruction = section.instructions[ti];
      await tx.instruction.create({
        data: {
          lineageId: lineageFor(instruction.lineageId),
          dishVersionId,
          sectionId: sectionRow.id,
          text: instruction.text,
          position: ti,
        },
      });
    }
  }

  return { sectionNames };
}

function sanitizedSectionsOrThrow(input: DishContentInput): SectionInput[] {
  const sections = removeEmptySections(input.sections);
  if (!hasMinimumContent(sections)) {
    throw new ValidationError(
      "Add at least one ingredient or instruction before saving.",
    );
  }
  return sections;
}

export async function createDish(
  ownerId: string,
  kind: DishKindValue,
  input: DishContentInput,
): Promise<string> {
  const sections = sanitizedSectionsOrThrow(input);

  return prisma.$transaction(async (tx) => {
    const dish = await tx.dish.create({
      data: {
        ownerId,
        kind,
        stage: input.stage,
        cuisine: input.cuisine || null,
        archivedAt: input.stage === "ARCHIVED" ? new Date() : null,
        currentTitle: input.title,
      },
    });

    const version = await tx.dishVersion.create({
      data: {
        dishId: dish.id,
        majorVersion: 1,
        minorVersion: 0,
        title: input.title,
        description: input.description || null,
        yieldQuantity: input.yieldQuantity ?? null,
        yieldUnit: input.yieldUnit || null,
        prepTimeMinutes: input.prepTimeMinutes ?? null,
        cookTimeMinutes: input.cookTimeMinutes ?? null,
        difficulty: input.difficulty || null,
      },
    });

    const { sectionNames } = await insertSections(tx, version.id, sections, {
      mintFreshLineage: true,
    });

    await tx.dish.update({
      where: { id: dish.id },
      data: {
        currentVersionId: version.id,
        currentStructuralSearchText: sectionNames.join(" ") || null,
      },
    });

    return dish.id;
  });
}

/**
 * "Save" from the Recipe/Part editor for an already-existing Dish. Always a
 * small update within the current major line — Slice 3 has no UI path to
 * reach a historical major (Slice 4), so `baseVersionId` is required to
 * still equal `Dish.currentVersionId` (ARCHITECTURE_PROPOSAL.md §I's
 * optimistic-concurrency check for the editor).
 */
export async function editDish(
  ownerId: string,
  dishId: string,
  baseVersionId: string,
  input: DishContentInput,
  kind?: DishKindValue,
): Promise<string> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  if (dish.currentVersionId !== baseVersionId) {
    throw new ConflictError(
      "This changed elsewhere. Refresh the page and review before saving again.",
    );
  }

  const base = await prisma.dishVersion.findUniqueOrThrow({
    where: { id: baseVersionId },
  });
  const sections = sanitizedSectionsOrThrow(input);

  return prisma.$transaction(async (tx) => {
    const highestMinor = await tx.dishVersion.aggregate({
      where: { dishId: dish.id, majorVersion: base.majorVersion },
      _max: { minorVersion: true },
    });
    const nextMinor = (highestMinor._max.minorVersion ?? 0) + 1;

    const version = await tx.dishVersion.create({
      data: {
        dishId: dish.id,
        majorVersion: base.majorVersion,
        minorVersion: nextMinor,
        title: input.title,
        description: input.description || null,
        yieldQuantity: input.yieldQuantity ?? null,
        yieldUnit: input.yieldUnit || null,
        prepTimeMinutes: input.prepTimeMinutes ?? null,
        cookTimeMinutes: input.cookTimeMinutes ?? null,
        difficulty: input.difficulty || null,
      },
    });

    const { sectionNames } = await insertSections(tx, version.id, sections, {
      mintFreshLineage: false,
    });

    // Slice 3 always edits the current major line (see the doc comment
    // above), so the new minor Version is always still "current" per F.2 —
    // Slice 4's historical-major editing will need to generalize this
    // comparison instead of always overwriting the pointer.
    await tx.dish.update({
      where: { id: dish.id },
      data: {
        stage: input.stage,
        cuisine: input.cuisine || null,
        archivedAt: nextArchivedAt(dish.stage, dish.archivedAt, input.stage),
        currentVersionId: version.id,
        currentTitle: input.title,
        currentStructuralSearchText: sectionNames.join(" ") || null,
      },
    });

    return dish.id;
  });
}

/** Stage/archive-only changes — never creates a Version (PRODUCT_SPEC.md §13.1). */
export async function updateDishStage(
  ownerId: string,
  dishId: string,
  stage: StageValue,
  kind?: DishKindValue,
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  await prisma.dish.update({
    where: { id: dish.id },
    data: {
      stage,
      archivedAt: nextArchivedAt(dish.stage, dish.archivedAt, stage),
    },
  });
}

export async function archiveDish(
  ownerId: string,
  dishId: string,
  kind?: DishKindValue,
): Promise<void> {
  await updateDishStage(ownerId, dishId, "ARCHIVED", kind);
}

/** §16.4: restoring requires selecting a non-Archived Stage. */
export async function restoreDish(
  ownerId: string,
  dishId: string,
  stage: RestorableStageValue,
  kind?: DishKindValue,
): Promise<void> {
  await updateDishStage(ownerId, dishId, stage, kind);
}

export async function duplicateDish(
  ownerId: string,
  dishId: string,
  sourceVersionId: string | undefined,
  kind?: DishKindValue,
): Promise<string> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  const versionId = sourceVersionId ?? dish.currentVersionId;
  if (!versionId) {
    throw new NotFoundError("This item has no saved content to duplicate yet.");
  }

  const sourceVersion = await prisma.dishVersion.findFirst({
    where: { id: versionId, dishId: dish.id },
    include: {
      sections: {
        orderBy: { position: "asc" },
        include: {
          ingredients: {
            orderBy: { position: "asc" },
            include: { substitute: true },
          },
          instructions: { orderBy: { position: "asc" } },
        },
      },
    },
  });
  if (!sourceVersion) {
    throw new NotFoundError("Version not found.");
  }

  const sections: SectionInput[] = sourceVersion.sections.map((section) => ({
    name: section.name,
    guidanceNote: section.guidanceNote,
    ingredients: section.ingredients
      .filter((ingredient) => ingredient.substituteForIngredientId === null)
      .map(toIngredientInput),
    instructions: section.instructions.map((instruction) => ({
      text: instruction.text,
    })),
  }));

  const title = `Copy of ${sourceVersion.title}`;
  const sourceLabel = `V${sourceVersion.majorVersion}.${sourceVersion.minorVersion}`;

  return prisma.$transaction(async (tx) => {
    const newDish = await tx.dish.create({
      data: {
        ownerId,
        kind: dish.kind,
        stage: dish.stage,
        cuisine: dish.cuisine,
        currentTitle: title,
        sourceKind: "DUPLICATE",
        sourceDishId: dish.id,
        sourceDishVersionLabel: sourceLabel,
        sourceTitle: sourceVersion.title,
      },
    });

    const version = await tx.dishVersion.create({
      data: {
        dishId: newDish.id,
        majorVersion: 1,
        minorVersion: 0,
        title,
        description: sourceVersion.description,
        yieldQuantity: sourceVersion.yieldQuantity,
        yieldUnit: sourceVersion.yieldUnit,
        prepTimeMinutes: sourceVersion.prepTimeMinutes,
        cookTimeMinutes: sourceVersion.cookTimeMinutes,
        difficulty: sourceVersion.difficulty,
      },
    });

    const { sectionNames } = await insertSections(tx, version.id, sections, {
      mintFreshLineage: true,
    });

    await tx.dish.update({
      where: { id: newDish.id },
      data: {
        currentVersionId: version.id,
        currentStructuralSearchText: sectionNames.join(" ") || null,
      },
    });

    return newDish.id;
  });
}

/**
 * Permanent deletion (ARCHITECTURE_PROPOSAL.md §I/§H.1): revokes every
 * ShareLink and cancels every pending DirectShare referencing this Dish in
 * the same transaction as the delete itself, before the cascade would
 * otherwise silently null those references. No Slice-3 UI creates
 * ShareLink/DirectShare rows yet, so this is a correct no-op today that
 * does not need to be retrofitted when sharing (Slices 16-17) ships.
 */
export async function deleteDish(
  ownerId: string,
  dishId: string,
  kind?: DishKindValue,
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.shareLink.updateMany({
      where: {
        OR: [{ currentDishId: dish.id }, { fixedDishId: dish.id }],
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    await tx.directShare.updateMany({
      where: { dishId: dish.id, status: "PENDING" },
      data: { status: "CANCELED" },
    });
    await tx.dish.delete({ where: { id: dish.id } });
  });
}
