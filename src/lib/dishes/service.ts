import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
} from "@/lib/dishes/queries";
import { decimalToNumber } from "@/lib/dishes/format";
import { sectionRowsToInput } from "@/lib/dishes/mappers";
import {
  seedMajorVersionNote,
  normalizeVersionNote,
} from "@/lib/dishes/version-note";
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

// ARCHITECTURE_PROPOSAL.md §F.2: "current" is always the highest major, and
// within it the highest minor — so the highest existing majorVersion alone
// (no minor needed) tells us which major line is currently current.
async function highestMajorVersion(
  tx: Prisma.TransactionClient,
  dishId: string,
): Promise<number> {
  const result = await tx.dishVersion.aggregate({
    where: { dishId },
    _max: { majorVersion: true },
  });
  return result._max.majorVersion ?? 0;
}

async function nextVersionNumbers(
  tx: Prisma.TransactionClient,
  dishId: string,
  baseMajorVersion: number,
  bump: VersionChoiceValue,
): Promise<{ majorVersion: number; minorVersion: number }> {
  if (bump === "MAJOR") {
    const currentHighestMajor = await highestMajorVersion(tx, dishId);
    return { majorVersion: currentHighestMajor + 1, minorVersion: 0 };
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

// Slice 4 correction pass §7: recognized transaction/write conflicts that a
// bounded retry can reasonably resolve by recomputing the next version
// number — never a domain error (validation/authorization/not-found), which
// must always surface immediately, unretried.
const MAX_VERSION_ALLOCATION_ATTEMPTS = 3;

function isRecognizedAllocationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  // P2002: the `@@unique([dishId, majorVersion, minorVersion])` backstop
  // fired — two concurrent saves computed the same next number. P2034: a
  // serializable-isolation write conflict inside the interactive
  // transaction itself. Both are exactly the "someone else allocated a
  // version number at the same time" case a retry can resolve; nothing
  // else is.
  return error.code === "P2002" || error.code === "P2034";
}

/**
 * Runs a version-creation transaction with serializable isolation and a
 * small bounded retry on a recognized allocation conflict — the database's
 * unique constraint remains the final backstop, but a concurrent save
 * should not surface a raw Prisma error to the user (Slice 4 correction
 * pass §7). Each retry re-runs `fn` inside a brand-new transaction, so the
 * next available minor/major is recomputed fresh every attempt rather than
 * reusing a stale read from a failed one.
 */
async function withVersionAllocation<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_VERSION_ALLOCATION_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        attempt === MAX_VERSION_ALLOCATION_ATTEMPTS ||
        !isRecognizedAllocationConflict(error)
      ) {
        if (isRecognizedAllocationConflict(error)) {
          throw new ConflictError(
            "Another change was saved to this item at the same time. Please try again.",
          );
        }
        throw error;
      }
    }
  }
  // Unreachable — the loop above always returns or throws.
  throw new ConflictError("Could not save. Please try again.");
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
 * "Save" from the Recipe/Part editor for an already-existing Dish.
 * `baseVersionId` may be the Dish's current Version, or (Slice 4) a
 * historical major line's latest minor, reached from that Version's own
 * detail page — PRODUCT_SPEC.md §13.4/§13.7: editing a historical major
 * either continues that line (a minor bump, never touching
 * `Dish.currentVersionId`) or starts a new major from it (which always
 * does). Either way, `baseVersionId` must still be the *latest* minor
 * within its own major line at save time — the generalized form of Slice
 * 3's optimistic-concurrency check (ARCHITECTURE_PROPOSAL.md §I): editing
 * from a minor that's since been superseded within the same line, whether
 * that line is current or historical, throws `ConflictError` exactly the
 * same way.
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
  // Slice 4 correction pass §1: any immutable Version belonging to the Dish
  // may be selected as an editing base — including an older minor when
  // newer minors already exist in the same major line. An immutable
  // historical Version does not become "stale" just because later Versions
  // exist; concurrency is handled at allocation time (`withVersionAllocation`
  // below), not by rejecting an otherwise-valid base here.
  const base = await getDishScopedVersionContentOrThrow(dish.id, baseVersionId);

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

  return withVersionAllocation(async (tx) => {
    const preEditHighestMajor = await highestMajorVersion(tx, dish.id);
    const baseWasAlreadyCurrentLine = base.majorVersion === preEditHighestMajor;

    const { majorVersion, minorVersion } = await nextVersionNumbers(
      tx,
      dish.id,
      base.majorVersion,
      bump,
    );

    // PRODUCT_SPEC.md §13.5: current = highest major, then highest minor
    // within it. A MAJOR bump's new majorVersion is always higher than any
    // existing one, so it's always current. A MINOR bump only becomes
    // current when the line being edited was already the highest major —
    // a small update to a historical major line (§13.4's "Creating V2.3
    // does not replace V5.3 as current") must never move the pointer just
    // because it happens to be the most recently written row.
    const becomesCurrent = bump === "MAJOR" || baseWasAlreadyCurrentLine;

    // Slice 4 correction pass §2: `nextVersionNumbers` always computes the
    // next minor as `MAX(minorVersion) + 1` within the selected major, not
    // `base.minorVersion + 1` — so `minorVersion - 1` is exactly the
    // highest minor that existed before this insert. When the selected
    // base isn't that highest minor, this is a non-sequential branch (the
    // user picked an earlier saved minor even though later ones exist),
    // and its true source is recorded structurally rather than left only
    // implied by consecutive numbering.
    const isSequentialMinorRefinement =
      bump === "MINOR" && base.minorVersion === minorVersion - 1;

    const sourceVersionId =
      bump === "MAJOR"
        ? base.id
        : bump === "MINOR" && !isSequentialMinorRefinement
          ? base.id
          : null;

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
        // ARCHITECTURE_PROPOSAL.md §F.4 / §13.6: a new major Version's
        // source relationship is stored structurally, not just as note
        // text. An ordinary sequential minor refinement leaves it unset
        // (implied by consecutive numbering); a non-sequential minor
        // branch (see above) records its real source explicitly.
        sourceVersionId,
        versionNote:
          bump === "MAJOR"
            ? seedMajorVersionNote(
                base.majorVersion,
                base.minorVersion,
                majorVersion,
                baseWasAlreadyCurrentLine,
              )
            : null,
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
        ...(becomesCurrent
          ? {
              currentVersionId: version.id,
              currentTitle: input.title,
              currentStructuralSearchText: sectionNames.join(" ") || null,
            }
          : {}),
      },
    });

    return dish.id;
  });
}

/**
 * §13.2's "revival of a useful historical direction as the next main
 * Recipe" / §13.7's "promote the historical direction into the next major
 * Version" — a verbatim copy of a historical Version's content into a
 * brand-new major Version, with no content edits. Distinct from `editDish`
 * because a no-op content "edit" would fall into the no-Version bucket
 * (§13.2a); this path always creates a Version, unconditionally, since
 * promoting is itself the meaningful action, not something diffed against
 * prior content. `Dish.stage`/`cuisine` are deliberately left untouched
 * (§13.9 — Stage belongs to the stable Dish, promoting Version content
 * does not change it).
 */
export async function promoteHistoricalVersion(
  ownerId: string,
  dishId: string,
  versionId: string,
  kind?: DishKindValue,
): Promise<string> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  const base = await getDishScopedVersionContentOrThrow(dish.id, versionId);
  const sections = sectionRowsToInput(base.sections);

  return withVersionAllocation(async (tx) => {
    const preEditHighestMajor = await highestMajorVersion(tx, dish.id);
    const baseWasAlreadyCurrentLine = base.majorVersion === preEditHighestMajor;
    const majorVersion = preEditHighestMajor + 1;

    const version = await tx.dishVersion.create({
      data: {
        dishId: dish.id,
        majorVersion,
        minorVersion: 0,
        title: base.title,
        description: base.description,
        yieldQuantity: base.yieldQuantity,
        yieldUnit: base.yieldUnit,
        prepTimeMinutes: base.prepTimeMinutes,
        cookTimeMinutes: base.cookTimeMinutes,
        difficulty: base.difficulty,
        sourceVersionId: base.id,
        versionNote: seedMajorVersionNote(
          base.majorVersion,
          base.minorVersion,
          majorVersion,
          baseWasAlreadyCurrentLine,
        ),
      },
    });

    const { sectionNames } = await insertSections(tx, version.id, sections, {
      mintFreshLineage: false,
    });

    await tx.dish.update({
      where: { id: dish.id },
      data: {
        currentVersionId: version.id,
        currentTitle: base.title,
        currentStructuralSearchText: sectionNames.join(" ") || null,
      },
    });

    return dish.id;
  });
}

/**
 * §14.1: a mutable annotation on otherwise-immutable Version content —
 * never creates a Version, never touches ingredients/instructions/yield/
 * nutrition/provenance. Owner-scoped via the Dish, then verified against
 * that specific dish (a versionId from a different Dish — even one this
 * same owner owns — must not resolve).
 */
export async function updateVersionNote(
  ownerId: string,
  dishId: string,
  versionId: string,
  note: string | null,
  kind?: DishKindValue,
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  await getDishScopedVersionContentOrThrow(dish.id, versionId);
  await prisma.dishVersion.update({
    where: { id: versionId },
    data: { versionNote: normalizeVersionNote(note) },
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
