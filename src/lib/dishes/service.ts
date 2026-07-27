import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { getOwnedDishOrThrow, getVersionContent } from "@/lib/dishes/queries";
import {
  removeEmptySections,
  hasMinimumContent,
  diffVersionContent,
  normalizeQuantity,
  normalizeDifficultyValue,
  isBlankSubstitute,
  type DishContentInput,
  type SectionInput,
  type IngredientInput,
  type StageValue,
  type RestorableStageValue,
  type DishKindValue,
  type VersionChoiceValue,
} from "@/lib/dishes/schema";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) — see
 * src/lib/tasters/service.ts for the same rationale.
 *
 * Only two entry points ever create DishVersion content
 * (ARCHITECTURE_PROPOSAL.md §F.10/§F.5): `createDish` (V1.0) and `editDish`.
 * DishVersion rows are never updated or deleted directly outside these
 * functions and `duplicateDish`.
 *
 * `editDish`'s settled Gate 2 classification (docs/SLICE_3.md) — determined
 * independently here, never trusting a client claim:
 *   - Stable Dish metadata only (Stage, cuisine, archive/restore) or a
 *     true no-op: no Version created, `Dish` updated in place (or not at
 *     all, for a genuine no-op).
 *   - Version-owned but non-cooking content (title, description, yield,
 *     prep/cook time, difficulty, Section naming/reordering that leaves
 *     every Ingredient/Instruction's own content, Section, and position
 *     untouched): exactly one minor Version, created automatically.
 *   - Any Ingredient/Instruction add, remove, edit, or reorder: requires
 *     the caller to have already resolved the minor/major choice
 *     (`versionChoice`); throws `ValidationError` if it's missing.
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

// Always includes `lineageId` — safe for every current caller: `duplicateDish`
// passes the result through `insertSections(..., {mintFreshLineage: true})`,
// which ignores any supplied `lineageId` and mints a fresh one regardless;
// `editDish`'s content-diffing needs the real `lineageId` to match rows.
function toIngredientInput(
  ingredient: IngredientWithSubstitute,
): IngredientInput {
  return {
    lineageId: ingredient.lineageId,
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
          lineageId: ingredient.substitute.lineageId,
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

type VersionSectionRow = Prisma.SectionGetPayload<{
  include: {
    ingredients: { include: { substitute: true } };
    instructions: true;
  };
}>;

// Shared by `duplicateDish` (source content → a fresh Version) and
// `editDish` (base content → content-diffing against the proposed edit).
function sectionRowsToInput(sections: VersionSectionRow[]): SectionInput[] {
  return sections.map((section) => ({
    lineageId: section.lineageId,
    name: section.name,
    guidanceNote: section.guidanceNote,
    ingredients: section.ingredients
      .filter((ingredient) => ingredient.substituteForIngredientId === null)
      .map(toIngredientInput),
    instructions: section.instructions.map((instruction) => ({
      lineageId: instruction.lineageId,
      text: instruction.text,
    })),
  }));
}

async function nextVersionNumbers(
  tx: Prisma.TransactionClient,
  dishId: string,
  baseMajorVersion: number,
  bump: VersionChoiceValue,
): Promise<{ majorVersion: number; minorVersion: number }> {
  if (bump === "MAJOR") {
    return { majorVersion: baseMajorVersion + 1, minorVersion: 0 };
  }
  const highestMinor = await tx.dishVersion.aggregate({
    where: { dishId, majorVersion: baseMajorVersion },
    _max: { minorVersion: true },
  });
  return {
    majorVersion: baseMajorVersion,
    minorVersion: (highestMinor._max.minorVersion ?? 0) + 1,
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

function normalizeNullableQuantity(
  value: number | null | undefined,
): number | null | undefined {
  return value == null ? value : normalizeQuantity(value);
}

// PRODUCT_SPEC.md §10.6a: the database's `Decimal(12, 3)` column can only
// ever hold 3 decimal places, so numeric quantities are rounded to that
// precision here — the server-side sanitization boundary both `createDish`
// and `editDish` always pass through — so a direct Server Action or service
// call cannot bypass the rule the client's own parser already applies.
//
// Gate 2 final correction pass: also strips a fully-blank substitute to
// `null` here, using the same `isBlankSubstitute` predicate the Zod
// preprocess step in `schema.ts` uses — one shared definition of "blank",
// not two. This matters because `createDish`/`editDish` are called
// directly (bypassing `dishContentSchema.parse`, which is how most of this
// file's own integration tests exercise them, and how any future caller
// could too) — without this, a blank substitute reaching this far would
// have been inserted as a real, empty-named Ingredient row instead of
// being rejected or dropped.
function normalizeIngredientQuantities(
  ingredient: IngredientInput,
): IngredientInput {
  const substitute = isBlankSubstitute(ingredient.substitute)
    ? null
    : ingredient.substitute;
  return {
    ...ingredient,
    quantity: normalizeNullableQuantity(ingredient.quantity),
    quantityEnd: normalizeNullableQuantity(ingredient.quantityEnd),
    substitute: substitute
      ? {
          ...substitute,
          quantity: normalizeNullableQuantity(substitute.quantity),
          quantityEnd: normalizeNullableQuantity(substitute.quantityEnd),
        }
      : substitute,
  };
}

function sanitizedSectionsOrThrow(input: DishContentInput): SectionInput[] {
  const sections = removeEmptySections(input.sections).map((section) => ({
    ...section,
    ingredients: section.ingredients.map(normalizeIngredientQuantities),
  }));

  // A substitute surviving `normalizeIngredientQuantities` (i.e. not
  // blank) but still missing a name is a genuinely incomplete substitute —
  // reject it here too, so a caller bypassing `dishContentSchema.parse`
  // can't silently persist an empty-named substitute Ingredient row.
  for (const section of sections) {
    for (const ingredient of section.ingredients) {
      if (ingredient.substitute && !ingredient.substitute.name.trim()) {
        throw new ValidationError(
          "Enter a name for the substitute, or remove it.",
        );
      }
    }
  }

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
        // Gate 2 final correction pass: normalized so a caller writing a
        // retired Easy/Medium/Hard value (directly, bypassing the editor's
        // Select) still lands on the current approved set.
        difficulty: normalizeDifficultyValue(input.difficulty),
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
 * "Save" from the Recipe/Part editor for an already-existing Dish. Slice 3
 * has no UI path to reach a historical major (Slice 4), so `baseVersionId`
 * is required to still equal `Dish.currentVersionId`
 * (ARCHITECTURE_PROPOSAL.md §I's optimistic-concurrency check for the
 * editor) — any edit that does create a Version is therefore always still
 * "current" per §F.2, whether it bumps the minor or the major number.
 *
 * See the module doc comment above for the settled stable/non-cooking/
 * cooking classification. `versionChoice` is only consulted when the
 * independently-computed diff finds an actual Ingredient/Instruction
 * change — a client-supplied choice for a metadata-only edit is ignored,
 * and a missing choice for a real cooking-content change is rejected.
 */
export async function editDish(
  ownerId: string,
  dishId: string,
  baseVersionId: string,
  input: DishContentInput,
  versionChoice: VersionChoiceValue | undefined,
  kind?: DishKindValue,
): Promise<string> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  if (dish.currentVersionId !== baseVersionId) {
    throw new ConflictError(
      "This changed elsewhere. Refresh the page and review before saving again.",
    );
  }

  const base = await getVersionContent(baseVersionId);
  const sections = sanitizedSectionsOrThrow(input);

  const nonCookingScalarChanged =
    base.title !== input.title ||
    (base.description ?? null) !== (input.description || null) ||
    decimalToNumber(base.yieldQuantity) !== (input.yieldQuantity ?? null) ||
    (base.yieldUnit ?? null) !== (input.yieldUnit || null) ||
    (base.prepTimeMinutes ?? null) !== (input.prepTimeMinutes ?? null) ||
    (base.cookTimeMinutes ?? null) !== (input.cookTimeMinutes ?? null) ||
    (base.difficulty ?? null) !== (input.difficulty || null);

  const { cookingChanged, sectionOrganizationChanged } = diffVersionContent(
    sectionRowsToInput(base.sections),
    sections,
  );
  const nonCookingVersionChanged =
    nonCookingScalarChanged || sectionOrganizationChanged;

  const stableChanged =
    input.stage !== dish.stage ||
    (input.cuisine || null) !== (dish.cuisine ?? null);

  if (cookingChanged && !versionChoice) {
    throw new ValidationError(
      "Choose whether to save this within the current version or start a new version.",
    );
  }

  if (!cookingChanged && !nonCookingVersionChanged) {
    // Stable-metadata-only edit, or a true no-op — never creates a Version.
    if (stableChanged) {
      await prisma.dish.update({
        where: { id: dish.id },
        data: {
          stage: input.stage,
          cuisine: input.cuisine || null,
          archivedAt: nextArchivedAt(dish.stage, dish.archivedAt, input.stage),
        },
      });
    }
    return dish.id;
  }

  const bump: VersionChoiceValue = cookingChanged ? versionChoice! : "MINOR";

  return prisma.$transaction(async (tx) => {
    const { majorVersion, minorVersion } = await nextVersionNumbers(
      tx,
      dish.id,
      base.majorVersion,
      bump,
    );

    const version = await tx.dishVersion.create({
      data: {
        dishId: dish.id,
        majorVersion,
        minorVersion,
        title: input.title,
        description: input.description || null,
        yieldQuantity: input.yieldQuantity ?? null,
        yieldUnit: input.yieldUnit || null,
        prepTimeMinutes: input.prepTimeMinutes ?? null,
        cookTimeMinutes: input.cookTimeMinutes ?? null,
        // Gate 2 final correction pass: normalized so a caller writing a
        // retired Easy/Medium/Hard value (directly, bypassing the editor's
        // Select) still lands on the current approved set.
        difficulty: normalizeDifficultyValue(input.difficulty),
      },
    });

    const { sectionNames } = await insertSections(tx, version.id, sections, {
      mintFreshLineage: false,
    });

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

  const sections: SectionInput[] = sectionRowsToInput(sourceVersion.sections);

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
