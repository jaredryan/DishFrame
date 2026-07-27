import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  getDishScopedVersionMetaOrThrow,
  sectionContentInclude,
  partLinkContentInclude,
} from "@/lib/dishes/queries";
import {
  assertImageAssetAttachable,
  deleteImageAssetIfOrphaned,
  bestEffortDeleteBlob,
} from "@/lib/images/service";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionContentToInput } from "@/lib/dishes/mappers";
import {
  seedMajorVersionNote,
  normalizeVersionNote,
} from "@/lib/dishes/version-note";
import { assertNoPartCycle } from "@/lib/cycles/service";
import type { PartLinkEdge } from "@/lib/cycles/reachability";
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
  type PartLinkInput,
  type StageValue,
  type RestorableStageValue,
  type DishKindValue,
  type VersionChoiceValue,
} from "@/lib/dishes/schema";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) — see
 * src/lib/tasters/service.ts for the same rationale.
 *
 * `createDish` (V1.0) and `editDish` are the only entry points that create
 * DishVersion content. `editDish`'s/`updateVersionMetadata`'s in-place
 * `applyVersionMetadataUpdate` (below) is the one sanctioned exception to
 * "DishVersion rows are never updated directly" — see its own doc comment.
 *
 * `editDish`'s settled classification (docs/SLICE_3.md's Gate 2 pass,
 * corrected by the Version-trigger and Slice 5 image correction pass —
 * PRODUCT_SPEC.md §7.1/§7.2/§13.1/§13.2a) — determined independently here,
 * never trusting a client claim:
 *   - Stable Dish metadata (Stage, cuisine, title) or a true no-op: no
 *     Version created, `Dish` updated in place (or not at all, for a
 *     genuine no-op). Title moved into this bucket in the correction pass
 *     — it is stable Dish identity, not Version-owned content.
 *   - Version-associated but mutable metadata (description, image) with no
 *     material change alongside it: no Version created — the selected
 *     Version is updated in place instead (`applyVersionMetadataUpdate`).
 *   - Version-owned non-cooking content (yield, prep/cook time, difficulty,
 *     Section naming/reordering that leaves every Ingredient/Instruction's
 *     own content, Section, and position untouched): exactly one minor
 *     Version, created automatically.
 *   - Any Ingredient/Instruction add, remove, edit, or reorder: requires
 *     the caller to have already resolved the minor/major choice
 *     (`versionChoice`); throws `ValidationError` if it's missing.
 *   - A save that combines a metadata-only bucket with a Version-creating
 *     bucket lands its title change on the stable Dish and its
 *     description/image values on the newly created Version — the Version
 *     is created only because of the material/non-cooking change, never
 *     because of the metadata fields riding along with it.
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
export async function highestMajorVersion(
  tx: Prisma.TransactionClient,
  dishId: string,
): Promise<number> {
  const result = await tx.dishVersion.aggregate({
    where: { dishId },
    _max: { majorVersion: true },
  });
  return result._max.majorVersion ?? 0;
}

export async function nextVersionNumbers(
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
export async function withVersionAllocation<T>(
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
/**
 * Slice 6: writes one Section's (or the container's own top-level, when
 * `sectionId` is `null`) linked-Part occurrences, in the same
 * lineage-preserving-or-minting style as every other row `insertSections`
 * writes. A PartLink's own position sequence is independent of its
 * Section's Ingredient/Instruction positions — it's a separate ordered
 * list, matching how the schema itself has no single interleaved order
 * across the three row kinds.
 */
async function insertPartLinks(
  tx: Prisma.TransactionClient,
  containerVersionId: string,
  sectionId: string | null,
  partLinks: PartLinkInput[],
  lineageFor: (id: string | undefined) => string,
): Promise<void> {
  for (let pi = 0; pi < partLinks.length; pi++) {
    const partLink = partLinks[pi];
    await tx.partLink.create({
      data: {
        lineageId: lineageFor(partLink.lineageId),
        containerVersionId,
        sectionId,
        position: pi,
        targetDishId: partLink.targetDishId,
        targetDishVersionId: partLink.targetDishVersionId,
      },
    });
  }
}

export async function insertSections(
  tx: Prisma.TransactionClient,
  dishVersionId: string,
  sections: SectionInput[],
  topLevelPartLinks: PartLinkInput[],
  { mintFreshLineage }: { mintFreshLineage: boolean },
): Promise<{ sectionNames: string[] }> {
  const sectionNames: string[] = [];

  function lineageFor(id: string | undefined): string {
    return mintFreshLineage ? randomUUID() : (id ?? randomUUID());
  }

  await insertPartLinks(tx, dishVersionId, null, topLevelPartLinks, lineageFor);

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

    await insertPartLinks(
      tx,
      dishVersionId,
      sectionRow.id,
      section.partLinks,
      lineageFor,
    );
  }

  return { sectionNames };
}

/** Slice 6: the full flat set of proposed linked-Part occurrences across a
 * whole Version's content — top-level and Section-nested alike — used as
 * the cycle-check's input (`assertNoPartCycle`, ARCHITECTURE_PROPOSAL.md
 * §G.3/§G.4). */
function collectPartLinkEdges(
  sections: SectionInput[],
  topLevelPartLinks: PartLinkInput[],
): PartLinkEdge[] {
  const edges: PartLinkEdge[] = topLevelPartLinks.map((link) => ({
    targetDishId: link.targetDishId,
    targetDishVersionId: link.targetDishVersionId,
  }));
  for (const section of sections) {
    for (const link of section.partLinks) {
      edges.push({
        targetDishId: link.targetDishId,
        targetDishVersionId: link.targetDishVersionId,
      });
    }
  }
  return edges;
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

  if (!hasMinimumContent(sections, input.partLinks)) {
    throw new ValidationError(
      "Add at least one ingredient, instruction, or linked Part before saving.",
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

  // Version-trigger and Slice 5 image correction pass §4: a client-supplied
  // imageAssetId must never be trusted merely because the row exists.
  if (input.imageAssetId) {
    await assertImageAssetAttachable(prisma, ownerId, input.imageAssetId);
  }

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
        // Slice 5, PRODUCT_SPEC.md §12: an image may already have been
        // uploaded (and its ImageAsset row reserved via
        // `requestImageUploadUrl`) before the very first save.
        imageAssetId: input.imageAssetId ?? null,
      },
    });

    // No cycle-check needed here: a brand-new Dish's `id` cannot possibly
    // already be reachable from any pre-existing PartLink graph (nothing
    // could have linked to an id that didn't exist until this very
    // transaction), so attaching Parts on first creation can never
    // introduce a cycle — ARCHITECTURE_PROPOSAL.md §G.3's check is only
    // meaningful once a Dish already has an identity other content could
    // reference.
    const { sectionNames } = await insertSections(
      tx,
      version.id,
      sections,
      input.partLinks,
      { mintFreshLineage: true },
    );

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

  // Version-trigger correction pass, PRODUCT_SPEC.md §7.1: title is stable
  // Dish identity, not Version-owned — grouped with Stage/cuisine, compared
  // against the Dish's own denormalized title rather than the base
  // Version's `title` column (which is written at Version-creation time but
  // never itself the source of truth once title can change independently).
  const stableChanged =
    input.stage !== dish.stage ||
    (input.cuisine || null) !== (dish.cuisine ?? null) ||
    input.title !== (dish.currentTitle ?? "");

  // Version-trigger correction pass, PRODUCT_SPEC.md §7.2: description and
  // image are Version-associated but mutable — a change to either, alone,
  // updates the selected Version in place rather than creating a new one.
  const versionMetadataChanged =
    (base.description ?? null) !== (input.description || null) ||
    (base.imageAssetId ?? null) !== (input.imageAssetId ?? null);

  const nonCookingScalarChanged =
    decimalToNumber(base.yieldQuantity) !== (input.yieldQuantity ?? null) ||
    (base.yieldUnit ?? null) !== (input.yieldUnit || null) ||
    (base.prepTimeMinutes ?? null) !== (input.prepTimeMinutes ?? null) ||
    (base.cookTimeMinutes ?? null) !== (input.cookTimeMinutes ?? null) ||
    (base.difficulty ?? null) !== (input.difficulty || null);

  const { cookingChanged, sectionOrganizationChanged } = diffVersionContent(
    versionContentToInput(base.sections, base.partLinks),
    { sections, partLinks: input.partLinks },
  );
  const nonCookingVersionChanged =
    nonCookingScalarChanged || sectionOrganizationChanged;

  if (cookingChanged && !versionChoice) {
    throw new ValidationError(
      "Choose whether to save this within the current version or start a new version.",
    );
  }

  // Version-trigger and Slice 5 image correction pass §4: authorize a
  // *new* image attachment regardless of which branch below actually
  // writes it — an in-place metadata update and a newly created Version
  // are both real attachments, and a malicious/stale client must not be
  // able to attach an image it doesn't own through either path.
  if (
    input.imageAssetId &&
    input.imageAssetId !== (base.imageAssetId ?? null)
  ) {
    await assertImageAssetAttachable(prisma, ownerId, input.imageAssetId);
  }

  if (!cookingChanged && !nonCookingVersionChanged) {
    // No material or non-cooking Version-owned change — never allocates a
    // Version number. Stable Dish metadata (Stage/cuisine/title) and
    // mutable Version metadata (description/image) are applied directly,
    // independently of each other; a save with neither is a true no-op.
    if (stableChanged) {
      await prisma.dish.update({
        where: { id: dish.id },
        data: {
          stage: input.stage,
          cuisine: input.cuisine || null,
          archivedAt: nextArchivedAt(dish.stage, dish.archivedAt, input.stage),
          currentTitle: input.title,
        },
      });
    }
    if (versionMetadataChanged) {
      await applyVersionMetadataUpdate(base, {
        description: input.description || null,
        imageAssetId: input.imageAssetId ?? null,
      });
    }
    return dish.id;
  }

  const bump: VersionChoiceValue = cookingChanged ? versionChoice! : "MINOR";

  return withVersionAllocation(async (tx) => {
    // Slice 6, ARCHITECTURE_PROPOSAL.md §G.4: the authoritative cycle check,
    // re-run here (inside the version-creation transaction, immediately
    // before the new DishVersion is created) against the *full* final
    // proposed content — closes the race window between the editor's
    // attach-time check and this save. Only meaningful for a Part: a
    // PartLink's target must always be `kind = PART` (§D.6), so a Recipe
    // can never appear inside anyone's reachable set.
    if (dish.kind === "PART") {
      await assertNoPartCycle(
        tx,
        dish.id,
        collectPartLinkEdges(sections, input.partLinks),
      );
    }

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
        // PRODUCT_SPEC.md §12.2: inherits the base Version's image by
        // default (the form's own initial value, from `dishToFormValues`)
        // unless the editor explicitly replaced or removed it — either way
        // `input.imageAssetId` already reflects the intended final value,
        // the same as every other Version-owned scalar field here.
        imageAssetId: input.imageAssetId ?? null,
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

    const { sectionNames } = await insertSections(
      tx,
      version.id,
      sections,
      input.partLinks,
      { mintFreshLineage: false },
    );

    await tx.dish.update({
      where: { id: dish.id },
      data: {
        stage: input.stage,
        cuisine: input.cuisine || null,
        archivedAt: nextArchivedAt(dish.stage, dish.archivedAt, input.stage),
        // Version-trigger correction pass: title is stable Dish identity
        // (§7.1), applied unconditionally — independent of whether this
        // particular save's Version becomes current, exactly like Stage
        // and cuisine already are above.
        currentTitle: input.title,
        ...(becomesCurrent
          ? {
              currentVersionId: version.id,
              currentStructuralSearchText: sectionNames.join(" ") || null,
            }
          : {}),
      },
    });

    return dish.id;
  });
}

/**
 * Version-trigger correction pass, PRODUCT_SPEC.md §7.2: description and
 * image are Version-associated but mutable — this updates the selected
 * `DishVersion` row directly, the one sanctioned exception (alongside
 * `versionNote`) to "DishVersion content is never mutated in place." Never
 * creates a Version, never touches `Dish.currentVersionId`, `sourceVersionId`,
 * version numbering, or any Section/Ingredient/Instruction content — and
 * works identically whether `version` is the Dish's current Version or an
 * arbitrary historical one, since neither field's mutability depends on
 * that distinction.
 *
 * Runs the row update and the old image's orphan check in one transaction
 * (PRODUCT_SPEC.md §90.2's cleanup requirement) so a failure partway
 * through can't leave a `DishVersion` pointing at an image whose orphan
 * check never ran. The actual Blob delete stays best-effort, after commit,
 * matching every other external side effect in this file.
 */
async function applyVersionMetadataUpdate(
  version: { id: string; imageAssetId: string | null },
  data: { description: string | null; imageAssetId: string | null },
): Promise<void> {
  const priorImageAssetId = version.imageAssetId;
  const imageChanged = priorImageAssetId !== data.imageAssetId;

  const orphanedStorageKey = await prisma.$transaction(async (tx) => {
    await tx.dishVersion.update({
      where: { id: version.id },
      data: {
        description: data.description,
        imageAssetId: data.imageAssetId,
      },
    });

    // Only the *old* asset can possibly have been orphaned by this write —
    // the new one (if any) is, by definition, still referenced by this
    // very row. Guards against a no-op "replace" where old and new happen
    // to be the same id, which must never be treated as freed.
    if (imageChanged && priorImageAssetId) {
      return deleteImageAssetIfOrphaned(tx, priorImageAssetId);
    }
    return null;
  });

  if (orphanedStorageKey) {
    await bestEffortDeleteBlob(orphanedStorageKey);
  }
}

/**
 * PRODUCT_SPEC.md §7.2 / Version-trigger correction pass §2: lets the user
 * edit description/image on any selected Version — current or historical —
 * without branching or creating a refinement. Distinct from `editDish`
 * because it never touches title/Stage/cuisine/yield/prep/cook/difficulty/
 * Ingredients/Instructions, and never needs `versionChoice` or content
 * diffing — it's a pure metadata update on one already-identified row.
 */
export async function updateVersionMetadata(
  ownerId: string,
  dishId: string,
  versionId: string,
  input: { description: string | null; imageAssetId: string | null },
  kind?: DishKindValue,
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  const version = await getDishScopedVersionMetaOrThrow(dish.id, versionId);

  if (input.imageAssetId && input.imageAssetId !== version.imageAssetId) {
    await assertImageAssetAttachable(prisma, ownerId, input.imageAssetId);
  }

  await applyVersionMetadataUpdate(version, {
    description: input.description,
    imageAssetId: input.imageAssetId,
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
 * does not change it) — and, per the Version-trigger correction pass, so
 * is `Dish.currentTitle`: title is stable Dish identity now, not Version
 * content, so promoting a historical direction's *content* never reverts
 * the Dish's own title back to whatever it was when that Version was
 * created. The new Version's own `title` column mirrors the Dish's current
 * title (its only remaining purpose is an inert historical mirror — see
 * `applyVersionMetadataUpdate`'s doc comment) rather than the base
 * Version's, which may be stale after an intervening title edit.
 */
export async function promoteHistoricalVersion(
  ownerId: string,
  dishId: string,
  versionId: string,
  kind?: DishKindValue,
): Promise<string> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  const base = await getDishScopedVersionContentOrThrow(dish.id, versionId);
  // Slice 6: PartLinks are copied verbatim, exactly like every other
  // content field here — no cycle re-check needed, since this exact set of
  // targets already passed cycle validation when the historical Version
  // was originally created for this same Dish, and nothing about the
  // targets changes here.
  const { sections, partLinks } = versionContentToInput(
    base.sections,
    base.partLinks,
  );
  const stableTitle = dish.currentTitle ?? base.title;

  return withVersionAllocation(async (tx) => {
    const preEditHighestMajor = await highestMajorVersion(tx, dish.id);
    const baseWasAlreadyCurrentLine = base.majorVersion === preEditHighestMajor;
    const majorVersion = preEditHighestMajor + 1;

    const version = await tx.dishVersion.create({
      data: {
        dishId: dish.id,
        majorVersion,
        minorVersion: 0,
        title: stableTitle,
        description: base.description,
        yieldQuantity: base.yieldQuantity,
        yieldUnit: base.yieldUnit,
        prepTimeMinutes: base.prepTimeMinutes,
        cookTimeMinutes: base.cookTimeMinutes,
        difficulty: base.difficulty,
        // Verbatim copy, same as every other content field here — a
        // promotion is defined as an exact copy of the historical
        // Version's content (§13.2/§13.7), image included.
        imageAssetId: base.imageAssetId,
        sourceVersionId: base.id,
        versionNote: seedMajorVersionNote(
          base.majorVersion,
          base.minorVersion,
          majorVersion,
          baseWasAlreadyCurrentLine,
        ),
      },
    });

    const { sectionNames } = await insertSections(
      tx,
      version.id,
      sections,
      partLinks,
      { mintFreshLineage: false },
    );

    await tx.dish.update({
      where: { id: dish.id },
      data: {
        currentVersionId: version.id,
        // Deliberately no `currentTitle` write here — see the doc comment
        // above. Promotion changes which content is current; it never
        // changes the Dish's own stable title.
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

/**
 * PRODUCT_SPEC.md §51.4: "Save as default" persists a temporary scale as
 * the stable Dish's own default batch presentation — never creates a
 * Version, never touches the authored Version's own `yieldQuantity`/
 * `yieldUnit`. Passing `null` resets it back to the authored Version
 * yield (§51.4's "remains resettable").
 */
export async function setDefaultBatchScale(
  ownerId: string,
  dishId: string,
  defaultBatchQuantity: number | null,
  defaultBatchUnit: string | null,
  kind?: DishKindValue,
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  await prisma.dish.update({
    where: { id: dish.id },
    data: {
      defaultBatchQuantity,
      defaultBatchUnit: defaultBatchQuantity == null ? null : defaultBatchUnit,
    },
  });
}

/**
 * PRODUCT_SPEC.md §53.6 / Build Plan Correction 6: targets one specific
 * Ingredient lineage, never a blanket per-Dish setting — matches
 * `PreferredUnitOverride`'s `@@unique([dishId, ingredientLineageId])`
 * (upsert, so re-saving a different unit for the same lineage replaces it
 * rather than erroring on the unique constraint).
 */
export async function savePreferredUnitOverride(
  ownerId: string,
  dishId: string,
  ingredientLineageId: string,
  unit: string,
  kind?: DishKindValue,
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  await prisma.preferredUnitOverride.upsert({
    where: {
      dishId_ingredientLineageId: { dishId: dish.id, ingredientLineageId },
    },
    create: { dishId: dish.id, ingredientLineageId, unit },
    update: { unit },
  });
}

/** §53.6: "remains reversible" — clears a saved override back to the
 * ingredient's own authored unit. */
export async function clearPreferredUnitOverride(
  ownerId: string,
  dishId: string,
  ingredientLineageId: string,
  kind?: DishKindValue,
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  await prisma.preferredUnitOverride.deleteMany({
    where: { dishId: dish.id, ingredientLineageId },
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
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
  if (!sourceVersion) {
    throw new NotFoundError("Version not found.");
  }

  // Slice 6, ARCHITECTURE_PROPOSAL.md §D.2a-style reasoning (as already
  // applied to images here): a brand-new Dish id can never already be
  // reachable from any pre-existing PartLink graph, so copying these exact
  // targets onto a new Dish can never introduce a cycle — no re-check
  // needed, same as `createDish`.
  const { sections, partLinks } = versionContentToInput(
    sourceVersion.sections,
    sourceVersion.partLinks,
  );

  // Version-trigger correction pass: title is stable Dish identity, not
  // Version content — the duplicate's suggested title (and the frozen
  // `sourceTitle` snapshot, §19.1) should reflect the source item's actual
  // current title, not whatever text happened to be written into this
  // specific historical Version's `title` column, which may be stale after
  // an intervening title-only edit.
  const stableSourceTitle = dish.currentTitle ?? sourceVersion.title;
  const title = `Copy of ${stableSourceTitle}`;
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
        sourceTitle: stableSourceTitle,
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
        // ARCHITECTURE_PROPOSAL.md §D.2a: the duplicate's V1.0 shares the
        // same ImageAsset row (and Blob object) as its source rather than
        // copying bytes — explicitly sanctioned to work across the
        // account boundary too (a different owner's accepted copy may
        // legitimately reference the same asset).
        imageAssetId: sourceVersion.imageAssetId,
      },
    });

    const { sectionNames } = await insertSections(
      tx,
      version.id,
      sections,
      partLinks,
      { mintFreshLineage: true },
    );

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

  // Slice 5, ARCHITECTURE_PROPOSAL.md §D.2a: every distinct ImageAsset any
  // of this Dish's own Versions reference, gathered *before* the cascading
  // delete below removes those DishVersion rows — the reference-counted
  // check afterward needs a candidate list to check, not a live query
  // against rows that no longer exist.
  const referencedImageAssets = await prisma.dishVersion.findMany({
    where: { dishId: dish.id, imageAssetId: { not: null } },
    select: { imageAssetId: true },
    distinct: ["imageAssetId"],
  });

  const orphanedStorageKeys = await prisma.$transaction(async (tx) => {
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

    // Only now (after the cascade above already deleted every DishVersion
    // that belonged to this Dish) does the reference count reflect reality
    // — an ImageAsset shared with a surviving Version on a *different*
    // Dish (this owner's duplicate, or another account's accepted copy,
    // §D.2a) correctly comes back non-zero and is left alone.
    const keys: string[] = [];
    for (const { imageAssetId } of referencedImageAssets) {
      if (!imageAssetId) continue;
      const storageKey = await deleteImageAssetIfOrphaned(tx, imageAssetId);
      if (storageKey) keys.push(storageKey);
    }
    return keys;
  });

  // Best-effort, after-commit external side effect (Arch §I) — never
  // allowed to roll back the already-committed deletion above.
  await Promise.all(
    orphanedStorageKeys.map((key) => bestEffortDeleteBlob(key)),
  );
}
