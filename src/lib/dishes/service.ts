import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma, $Enums } from "@/generated/prisma/client";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  PartHasLiveUsagesError,
} from "@/lib/errors";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  getDishScopedVersionContentForReuseOrThrow,
  getDishScopedVersionMetaOrThrow,
  sectionContentInclude,
  partLinkContentIncludeAllStates,
} from "@/lib/dishes/queries";
import {
  assertImageAssetAttachable,
  deleteImageAssetIfOrphaned,
  bestEffortDeleteBlob,
} from "@/lib/images/service";
import { decimalToNumber } from "@/lib/dishes/format";
import { getDuplicationRatingSnapshot } from "@/lib/reviews/queries";
import {
  versionContentToInput,
  toPartLinkInput,
  toIngredientInput,
  type VersionPartLinkRow,
  type VersionSectionRow,
} from "@/lib/dishes/mappers";
import {
  seedMajorVersionNote,
  seedPropagationVersionNote,
  normalizeVersionNote,
  versionLabel,
} from "@/lib/dishes/version-note";
import { assertNoPartCycle } from "@/lib/cycles/service";
import type { PartLinkEdge } from "@/lib/cycles/reachability";
import {
  assertValidPartLinkTargets,
  resolvePartVersionForDetach,
} from "@/lib/sections/service";
import {
  removeEmptySections,
  hasMinimumContent,
  diffVersionContent,
  findDuplicatePartTargets,
  sortByPosition,
  normalizeQuantity,
  normalizeDifficultyValue,
  isBlankSubstitute,
  nutritionSourceProviderValues,
  type NutritionSourceProviderValue,
  type DishContentInput,
  type SectionInput,
  type IngredientInput,
  type PartLinkInput,
  type StageValue,
  type RestorableStageValue,
  type DishKindValue,
  type VersionChoiceValue,
  type PartUsageResolutionValue,
} from "@/lib/dishes/schema";
import type { ShareGraph, ShareGraphPartLinkRef } from "@/lib/sharing/graph";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) — see
 * src/lib/tasters/service.ts for the same rationale.
 *
 * `createDish` (V1.0) and `editDish` are the only entry points that create
 * DishVersion content. `editDish`'s/`updateVersionMetadata`'s in-place
 * `applyVersionMetadataUpdate` (below) is the one sanctioned exception to
 * "DishVersion rows are never updated directly" — see its own doc comment.
 *
 * `editDish`'s settled classification (Gate 2 pass, see
 * docs/ARCHITECTURE_PROPOSAL.md §F.5a,
 * corrected by the Version-trigger and Slice 5 image correction pass, and
 * by the Slice 13 metadata-classification correction pass —
 * PRODUCT_SPEC.md §7.1/§7.2/§13.1/§13.2a/§54) — determined independently
 * here, never trusting a client claim. Version ownership and Version
 * creation are separate concerns: a field can belong to one specific
 * `DishVersion` row without every edit to it creating a new row.
 *   - Stable Dish metadata (Stage, cuisine, title) or a true no-op: no
 *     Version created, `Dish` updated in place (or not at all, for a
 *     genuine no-op). Title is stable Dish identity, not Version-owned
 *     content.
 *   - Version-scoped metadata — description, image, yield, prep time, cook
 *     time, difficulty, and (Slice 13 correction pass) calories/protein/
 *     carbs/fat, nutrition basis, More nutrients, and nutrition source
 *     attribution — with no material content change alongside it: no
 *     Version created. The selected Version (current *or* a deliberately
 *     chosen historical one) is updated in place instead
 *     (`applyVersionMetadataUpdate`), and only that exact row — never
 *     `Dish.currentVersionId`, never any other Version. None of these
 *     fields describe what is actually prepared, so none of them, alone,
 *     ever justify a new Version.
 *   - Material preparation content — any Ingredient/Instruction add,
 *     remove, edit, or reorder; any linked-Part attach/detach/retarget/
 *     multiplier change; or Section add/remove/rename/reorder — creates a
 *     Version. An Ingredient/Instruction/linked-Part change requires the
 *     caller to have already resolved the minor/major choice
 *     (`versionChoice`); throws `ValidationError` if it's missing.
 *     Section-organization-only content (renaming/reordering with every
 *     Ingredient/Instruction/linked Part otherwise untouched) still gets
 *     exactly one automatic minor Version, no choice required.
 *   - A save that combines Version-scoped metadata with material content:
 *     the appropriate new Version is created through the material-content
 *     flow above, carrying the submitted metadata values — the prior
 *     Version is never mutated. The Version is created because of the
 *     material change, never because of the metadata riding along with it.
 *     Title still lands on the stable Dish either way.
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
 * Correction pass: a MATERIALIZED occurrence has no live target to point at
 * (its Part was deleted) — the frozen snapshot the repository already uses
 * for that case (`materializedTitle`/`materializedVersionLabel`/
 * `materializedContent`, ARCHITECTURE_PROPOSAL.md §H's materialization
 * table) is the "smallest additive" representation `insertPartLinks`/
 * `insertSections` widen to accept, additively — every existing caller
 * (`createDish`/`editDish`/`duplicateDish`/`promoteHistoricalVersion`/
 * `propagateToOneContainer`) only ever constructs plain `PartLinkInput`
 * (the union's LIVE-shaped member), so none of them change behavior.
 */
type MaterializedPartLinkInsert = {
  kind: "MATERIALIZED";
  lineageId?: string;
  position: number;
  multiplier: number;
  materializedTitle: string | null;
  materializedVersionLabel: string | null;
  materializedContent: Prisma.InputJsonValue;
};
type InsertablePartLink = PartLinkInput | MaterializedPartLinkInsert;
type InsertableSection = Omit<SectionInput, "partLinks"> & {
  partLinks: InsertablePartLink[];
};

function isLivePartLink(link: InsertablePartLink): link is PartLinkInput {
  return !("kind" in link && link.kind === "MATERIALIZED");
}

type VersionPartLinkRowAllStates = Prisma.PartLinkGetPayload<{
  select: typeof partLinkContentIncludeAllStates.select;
}>;

/**
 * Code-audit fidelity fix (2026-08-27): converts one all-states PartLink row
 * into `InsertablePartLink` — a LIVE row exactly like `toPartLinkInput`
 * (mappers.ts), a MATERIALIZED row carried through **unchanged**. A
 * MATERIALIZED row's `materializedContent` is already a fully resolved,
 * self-contained frozen snapshot (written once by `resolveMaterializedSnapshot`
 * below and never edited again) — reproducing it faithfully means copying
 * the JSON verbatim, never re-walking or remapping it, unlike the sharing
 * engine's `remapRef` (below), which *does* have to rewrite nested LIVE
 * targets when a copy crosses to a different account.
 */
function toInsertablePartLinkInput(
  row: VersionPartLinkRowAllStates,
): InsertablePartLink {
  if (row.linkState === "MATERIALIZED") {
    return {
      kind: "MATERIALIZED",
      lineageId: row.lineageId,
      position: row.position,
      multiplier: decimalToNumber(row.multiplier) ?? 1,
      materializedTitle: row.materializedTitle,
      materializedVersionLabel: row.materializedVersionLabel,
      materializedContent: row.materializedContent as Prisma.InputJsonValue,
    };
  }
  return toPartLinkInput(row as VersionPartLinkRow);
}

/**
 * Like `versionContentToInput` (mappers.ts) but preserves MATERIALIZED
 * PartLink occurrences instead of silently dropping them (the bug this fix
 * addresses) — for callers whose whole purpose is to faithfully reproduce a
 * Version's content: `duplicateDish`, `promoteHistoricalVersion`,
 * `resolveMaterializedSnapshot`, `propagateToOneContainer`,
 * `resolvePartUsageOccurrence`, and `editDish`. `editDish`'s own submitted
 * `input` is never passed through this — the editor's LIVE-only content has
 * no use for it — but its *base* Version's content is, so any MATERIALIZED
 * occurrence the base already held can be split out
 * (`splitLiveAndMaterialized`) and merged back into the editor's submission
 * (`mergeMaterializedBack`) rather than silently dropped by an ordinary
 * edit, matching the fidelity every other reproduce-path here already has.
 */
function versionContentToInsertableInput(
  sections: VersionSectionRow[],
  partLinks: VersionPartLinkRowAllStates[],
): { sections: InsertableSection[]; partLinks: InsertablePartLink[] } {
  const bySectionId = new Map<string, InsertablePartLink[]>();
  const topLevel: InsertablePartLink[] = [];

  for (const partLink of partLinks) {
    const input = toInsertablePartLinkInput(partLink);
    if (partLink.sectionId === null) {
      topLevel.push(input);
    } else {
      const list = bySectionId.get(partLink.sectionId) ?? [];
      list.push(input);
      bySectionId.set(partLink.sectionId, list);
    }
  }

  return {
    sections: sections.map((section) => ({
      lineageId: section.lineageId,
      name: section.name,
      guidanceNote: section.guidanceNote,
      position: section.position,
      ingredients: section.ingredients
        .filter((ingredient) => ingredient.substituteForIngredientId === null)
        .map(toIngredientInput),
      instructions: section.instructions.map((instruction) => ({
        lineageId: instruction.lineageId,
        text: instruction.text,
        position: instruction.position,
      })),
      partLinks: bySectionId.get(section.id) ?? [],
    })),
    partLinks: topLevel,
  };
}

/**
 * Splits an all-states section/partLink set into a LIVE-only view (for
 * existing logic that only understands ordinary linked-Part occurrences —
 * dup/cycle checks, occurrence matching, retargeting) plus the untouched
 * MATERIALIZED occurrences set aside by originating Section (`undefined` key
 * for top-level), so they can be merged back into the exact same location
 * afterward via `mergeMaterializedBack`. Used by `propagateToOneContainer`
 * and `resolvePartUsageOccurrence`, which only ever inspect/mutate LIVE
 * occurrences but must not silently drop an unrelated MATERIALIZED one
 * elsewhere in the same Version when they reconstruct its content.
 *
 * `editDish` uses this against its *base* Version too, but only for the
 * `materializedBySectionLineage`/`materializedTopLevel` half — its returned
 * `liveSections` there is read purely for each base Section's own
 * name/guidanceNote/position (to resurrect a Section the editor's
 * submission dropped entirely because it held nothing but a MATERIALIZED
 * occurrence), never mutated-then-merged-back the way the other two callers
 * use it.
 */
function splitLiveAndMaterialized(
  sections: InsertableSection[],
  topLevelPartLinks: InsertablePartLink[],
): {
  liveSections: SectionInput[];
  liveTopLevel: PartLinkInput[];
  materializedBySectionLineage: Map<string, MaterializedPartLinkInsert[]>;
  materializedTopLevel: MaterializedPartLinkInsert[];
} {
  const materializedBySectionLineage = new Map<
    string,
    MaterializedPartLinkInsert[]
  >();

  const liveSections: SectionInput[] = sections.map((section) => {
    const live: PartLinkInput[] = [];
    const materialized: MaterializedPartLinkInsert[] = [];
    for (const link of section.partLinks) {
      if (isLivePartLink(link)) live.push(link);
      else materialized.push(link);
    }
    if (materialized.length > 0) {
      // Always set on already-persisted content, which is all this function
      // ever sees (never freshly-authored, not-yet-saved editor content).
      materializedBySectionLineage.set(section.lineageId!, materialized);
    }
    return { ...section, partLinks: live };
  });

  const liveTopLevel: PartLinkInput[] = [];
  const materializedTopLevel: MaterializedPartLinkInsert[] = [];
  for (const link of topLevelPartLinks) {
    if (isLivePartLink(link)) liveTopLevel.push(link);
    else materializedTopLevel.push(link);
  }

  return {
    liveSections,
    liveTopLevel,
    materializedBySectionLineage,
    materializedTopLevel,
  };
}

/** Inverse of `splitLiveAndMaterialized` — re-attaches the untouched
 * MATERIALIZED occurrences, matched back to their originating Section by
 * `lineageId`. Callers that might remove a Section entirely (e.g.
 * `removeEmptySections`) must account for a materialized occurrence keeping
 * that Section non-empty *before* calling this — see
 * `removeEmptySectionsPreservingMaterialized`. `editDish` takes a different
 * path to the same guarantee: its submitted Sections were already sanitized
 * before this fix ever runs (the editor can only ever submit its own
 * LIVE-only view, so a Section holding nothing but a MATERIALIZED occurrence
 * is never resubmitted at all, not merely emptied) — so instead of guarding
 * removal beforehand, `editDish` resurrects any such Section afterward by
 * lineageId, alongside this merge. */
function mergeMaterializedBack(
  sections: SectionInput[],
  topLevelPartLinks: PartLinkInput[],
  materializedBySectionLineage: Map<string, MaterializedPartLinkInsert[]>,
  materializedTopLevel: MaterializedPartLinkInsert[],
): { sections: InsertableSection[]; partLinks: InsertablePartLink[] } {
  return {
    sections: sections.map((section) => ({
      ...section,
      partLinks: [
        ...section.partLinks,
        ...(materializedBySectionLineage.get(section.lineageId!) ?? []),
      ],
    })),
    partLinks: [...topLevelPartLinks, ...materializedTopLevel],
  };
}

/**
 * `removeEmptySections` (schema.ts) only sees a Section's LIVE content, so
 * used directly against a LIVE-only view it would incorrectly drop a Section
 * whose only remaining content is a MATERIALIZED occurrence being carried
 * through by `splitLiveAndMaterialized`/`mergeMaterializedBack` — silently
 * losing it despite this whole fix's purpose. This variant additionally
 * counts a Section as non-empty when it has a materialized occurrence set
 * aside for it.
 */
function removeEmptySectionsPreservingMaterialized(
  sections: SectionInput[],
  materializedBySectionLineage: Map<string, MaterializedPartLinkInsert[]>,
): SectionInput[] {
  return sections.filter(
    (section) =>
      section.ingredients.length > 0 ||
      section.instructions.length > 0 ||
      section.partLinks.length > 0 ||
      (materializedBySectionLineage.get(section.lineageId!)?.length ?? 0) > 0,
  );
}

/**
 * Slice 6: writes one Section's (or the container's own top-level, when
 * `sectionId` is `null`) linked-Part occurrences, in the same
 * lineage-preserving-or-minting style as every other row `insertSections`
 * writes.
 *
 * Slice 6 post-gate (Review Gate 3's "unified authored order"), extended by
 * the Section-editor refinement pass: a TOP-LEVEL PartLink's `position` is
 * written from its own explicit `PartLinkInput.position` field — its real
 * slot in the one shared ordering sequence with top-level Sections
 * (`sectionInputSchema.position`'s doc comment) — never array iteration
 * order, since the two top-level arrays aren't assumed to already arrive
 * interleaved. A Section-nested PartLink now uses that same explicit field
 * too, for the same reason one level down: its slot in the merged sequence
 * shared with that Section's own Instructions (`instructionInputSchema.
 * position`, `sectionContentSequence`) — no longer just its own array
 * index, now that Instructions can be interleaved with it. This applies
 * identically regardless of LIVE/MATERIALIZED kind — both share one
 * `partLinks` array, in one authored order.
 */
// F1 (docs/performance-architecture-audit.md): builds PartLink create-data
// without writing — every call site batches its rows into one `createMany`
// instead of one `create` per row, so this needs no `tx`/`await` of its own.
function buildPartLinkRows(
  containerVersionId: string,
  sectionId: string | null,
  partLinks: InsertablePartLink[],
  lineageFor: (id: string | undefined) => string,
): Prisma.PartLinkCreateManyInput[] {
  return partLinks.map((partLink) => {
    const position = partLink.position;
    if (isLivePartLink(partLink)) {
      return {
        lineageId: lineageFor(partLink.lineageId),
        containerVersionId,
        sectionId,
        position,
        multiplier: partLink.multiplier,
        targetDishId: partLink.targetDishId,
        targetDishVersionId: partLink.targetDishVersionId,
      };
    }
    return {
      lineageId: lineageFor(partLink.lineageId),
      containerVersionId,
      sectionId,
      position,
      multiplier: partLink.multiplier,
      linkState: "MATERIALIZED" as const,
      materializedTitle: partLink.materializedTitle,
      materializedVersionLabel: partLink.materializedVersionLabel,
      materializedContent: partLink.materializedContent,
    };
  });
}

/**
 * F1 (docs/performance-architecture-audit.md): rewritten to `createMany` per
 * row kind instead of one individually-awaited `create` per row — this was
 * ~20-25 sequential round trips for a modest recipe, the dominant cost on
 * every create/edit/import/propagate/duplicate/share-accept path (all 7
 * callers of this function). Every id (`Section`/`Ingredient`/`Instruction`/
 * `PartLink`'s own `@default(cuid())` primary key) is now pre-generated with
 * `randomUUID()` in application code — exactly like `lineageFor` already did
 * for `lineageId` — specifically so a child row (an Ingredient's substitute,
 * or any row scoped to a Section) never needs to wait for a DB round trip to
 * learn its parent's generated id. Two ordering requirements are still
 * genuine data dependencies, preserved as two sequential stages: (1) Section
 * rows must exist before any Ingredient/Instruction/PartLink row that
 * references a Section id via a raw-SQL composite FK; (2) a substitute
 * Ingredient's `substituteForIngredientId` FK must reference an
 * already-persisted parent Ingredient row, so parent Ingredients are written
 * in their own `createMany` before substitutes are written in a second one.
 */
export async function insertSections(
  tx: Prisma.TransactionClient,
  dishVersionId: string,
  sections: InsertableSection[],
  topLevelPartLinks: InsertablePartLink[],
  { mintFreshLineage }: { mintFreshLineage: boolean },
): Promise<{ sectionNames: string[]; partLinkTargetDishIds: string[] }> {
  const sectionNames: string[] = [];
  // Slice 10 correction (§44.1/§44.2's "linked Part names" tier): every
  // direct LIVE linked-Part occurrence this Version references, top-level
  // and Section-nested alike — feeds `structuralSearchTextFor`'s rebuild of
  // `Dish.currentStructuralSearchText` below, alongside `sectionNames`. A
  // MATERIALIZED occurrence has no live Part/Dish to name here (matches the
  // pre-existing behavior these never contributed to search text, since
  // they were previously dropped from copies entirely).
  const partLinkTargetDishIds = [
    ...topLevelPartLinks
      .filter(isLivePartLink)
      .map((link) => link.targetDishId),
    ...sections.flatMap((section) =>
      section.partLinks.filter(isLivePartLink).map((link) => link.targetDishId),
    ),
  ];

  function lineageFor(id: string | undefined): string {
    return mintFreshLineage ? randomUUID() : (id ?? randomUUID());
  }

  const partLinkRows: Prisma.PartLinkCreateManyInput[] = buildPartLinkRows(
    dishVersionId,
    null,
    topLevelPartLinks,
    lineageFor,
  );

  // Slice 6 post-gate: sort order doesn't affect what `position` value each
  // row is written with (that comes from each Section's own explicit
  // `position` field below, not iteration order) — sorting here only
  // keeps `sectionNames` (search-text) in true reading order.
  const orderedSections = sortByPosition(sections);

  const sectionRows: Prisma.SectionCreateManyInput[] = [];
  const sectionIdByIndex: string[] = [];
  for (const section of orderedSections) {
    const sectionId = randomUUID();
    sectionIdByIndex.push(sectionId);
    if (section.name) sectionNames.push(section.name);
    sectionRows.push({
      id: sectionId,
      lineageId: lineageFor(section.lineageId),
      dishVersionId,
      name: section.name || null,
      guidanceNote: section.guidanceNote || null,
      position: section.position,
    });
  }
  if (sectionRows.length > 0) {
    await tx.section.createMany({ data: sectionRows });
  }

  const ingredientRows: Prisma.IngredientCreateManyInput[] = [];
  const substituteRows: Prisma.IngredientCreateManyInput[] = [];
  const instructionRows: Prisma.InstructionCreateManyInput[] = [];

  for (let si = 0; si < orderedSections.length; si++) {
    const section = orderedSections[si];
    const sectionId = sectionIdByIndex[si];

    for (let ii = 0; ii < section.ingredients.length; ii++) {
      const ingredient = section.ingredients[ii];
      const ingredientId = randomUUID();
      ingredientRows.push({
        id: ingredientId,
        lineageId: lineageFor(ingredient.lineageId),
        dishVersionId,
        sectionId,
        name: ingredient.name,
        quantity: ingredient.quantity ?? null,
        quantityEnd: ingredient.quantityEnd ?? null,
        isApproximate: ingredient.isApproximate,
        unit: ingredient.unit || null,
        displayText: ingredient.displayText || null,
        preparationNote: ingredient.preparationNote || null,
        isOptional: ingredient.isOptional,
        originalImportedText: ingredient.originalImportedText || null,
        position: ii,
      });

      if (ingredient.substitute) {
        substituteRows.push({
          id: randomUUID(),
          lineageId: lineageFor(ingredient.substitute.lineageId),
          dishVersionId,
          sectionId,
          name: ingredient.substitute.name,
          quantity: ingredient.substitute.quantity ?? null,
          quantityEnd: ingredient.substitute.quantityEnd ?? null,
          isApproximate: ingredient.substitute.isApproximate,
          unit: ingredient.substitute.unit || null,
          displayText: ingredient.substitute.displayText || null,
          preparationNote: ingredient.substitute.preparationNote || null,
          position: ii,
          substituteForIngredientId: ingredientId,
        });
      }
    }

    for (let ti = 0; ti < section.instructions.length; ti++) {
      const instruction = section.instructions[ti];
      instructionRows.push({
        id: randomUUID(),
        lineageId: lineageFor(instruction.lineageId),
        dishVersionId,
        sectionId,
        text: instruction.text,
        // Section-editor refinement pass: this Instruction's slot in the
        // merged sequence shared with the Section's own nested PartLinks
        // (`instructionInputSchema.position`'s doc comment) — falls back
        // to array index only for content that never went through the
        // merged-order editor (pre-existing convention, unchanged).
        position: instruction.position ?? ti,
      });
    }

    partLinkRows.push(
      ...buildPartLinkRows(
        dishVersionId,
        sectionId,
        section.partLinks,
        lineageFor,
      ),
    );
  }

  // Parent Ingredients before substitutes: a substitute's
  // `substituteForIngredientId` FK must reference an already-persisted row.
  if (ingredientRows.length > 0) {
    await tx.ingredient.createMany({ data: ingredientRows });
  }
  if (substituteRows.length > 0) {
    await tx.ingredient.createMany({ data: substituteRows });
  }
  if (instructionRows.length > 0) {
    await tx.instruction.createMany({ data: instructionRows });
  }
  if (partLinkRows.length > 0) {
    await tx.partLink.createMany({ data: partLinkRows });
  }

  return { sectionNames, partLinkTargetDishIds };
}

/**
 * Slice 10 correction: the single rebuild path for
 * `Dish.currentStructuralSearchText` (tier 7, §44.5/§44.1-44.2's "Section or
 * linked Part name") — Section names plus the *current* stable title
 * (`Dish.currentTitle`) of every Part this Version directly links, resolved
 * live at rebuild time rather than frozen from `DishVersion.title`. Reading
 * live here (not the linked Version's own title snapshot) is what lets
 * `refreshStructuralSearchTextForPartUsages` below correctly pick up a
 * Part's rename without needing to touch that Part's own Version content.
 */
async function structuralSearchTextFor(
  client: Prisma.TransactionClient | typeof prisma,
  sectionNames: string[],
  partLinkTargetDishIds: string[],
): Promise<string | null> {
  const distinctIds = [...new Set(partLinkTargetDishIds)];
  const targets = distinctIds.length
    ? await client.dish.findMany({
        where: { id: { in: distinctIds } },
        select: { currentTitle: true },
      })
    : [];
  const partTitles = targets
    .map((target) => target.currentTitle)
    .filter((title): title is string => !!title);
  const combined = [...sectionNames, ...partTitles].join(" ");
  return combined || null;
}

/**
 * Slice 10 correction: a Part's `currentTitle` is stable Dish metadata that
 * can change without creating a Version (§7.1), but it's also denormalized
 * into every current parent's `currentStructuralSearchText` (via
 * `structuralSearchTextFor` above) — so a rename must refresh every current
 * parent that directly links this Part right now, not just the Part's own
 * row. Mirrors `listCurrentPartUsages` (queries.ts) — LIVE links whose
 * container is some Dish's *current* Version, owned by the same owner —
 * but resolves each affected container's full current search text (its own
 * Section names plus every one of *its* linked Parts' current titles, not
 * just the renamed one) rather than returning usage rows for display.
 */
/**
 * F3 (docs/performance-architecture-audit.md): batched — one `findMany` for
 * every affected container's current-Version content, one `findMany` for
 * every linked Part's current title (shared across all containers, not
 * re-resolved per container via `structuralSearchTextFor`), then every
 * container's search text recomputed in memory and persisted concurrently.
 * Previously 1 + 3N sequential round trips (a `findUnique` + a nested
 * `structuralSearchTextFor` `findMany` + an `update`, per container) — now a
 * fixed small number of round trips regardless of how many containers link
 * the renamed Part.
 */
async function refreshStructuralSearchTextForPartUsages(
  client: Prisma.TransactionClient | typeof prisma,
  ownerId: string,
  partDishId: string,
): Promise<void> {
  const containers = await client.dish.findMany({
    where: {
      ownerId,
      currentVersionId: { not: null },
      currentVersion: {
        partLinks: { some: { targetDishId: partDishId, linkState: "LIVE" } },
      },
    },
    select: { id: true, currentVersionId: true },
  });
  if (containers.length === 0) return;

  const versionIds = containers
    .map((container) => container.currentVersionId)
    .filter((id): id is string => !!id);

  const versions = await client.dishVersion.findMany({
    where: { id: { in: versionIds } },
    select: {
      id: true,
      sections: { select: { name: true } },
      partLinks: {
        where: { linkState: "LIVE" },
        select: { targetDishId: true },
      },
    },
  });
  const versionById = new Map(versions.map((version) => [version.id, version]));

  const allTargetDishIds = [
    ...new Set(
      versions.flatMap((version) =>
        version.partLinks
          .map((link) => link.targetDishId)
          .filter((id): id is string => !!id),
      ),
    ),
  ];
  const targets = allTargetDishIds.length
    ? await client.dish.findMany({
        where: { id: { in: allTargetDishIds } },
        select: { id: true, currentTitle: true },
      })
    : [];
  const titleByDishId = new Map(
    targets.map((target) => [target.id, target.currentTitle]),
  );

  const updates = containers
    .filter(
      (
        container,
      ): container is typeof container & { currentVersionId: string } =>
        !!container.currentVersionId &&
        versionById.has(container.currentVersionId),
    )
    .map((container) => {
      const version = versionById.get(container.currentVersionId)!;
      const sectionNames = version.sections
        .map((section) => section.name)
        .filter((name): name is string => !!name);
      const partTitles = version.partLinks
        .map((link) =>
          link.targetDishId ? titleByDishId.get(link.targetDishId) : null,
        )
        .filter((title): title is string => !!title);
      const combined = [...sectionNames, ...partTitles].join(" ");
      return { id: container.id, searchText: combined || null };
    });

  // Correction pass (post-implementation review): both real callers pass
  // an interactive-transaction `tx`, never the bare `prisma` client — N
  // concurrent `tx.dish.update()` calls via `Promise.all` on one shared
  // transaction handle is a documented Prisma anti-pattern (the same
  // connection can't genuinely run them in parallel, and some
  // engine/adapter combinations reject concurrent queries against one
  // interactive-transaction client outright). A heavily-reused Part could
  // also mean dozens of concurrent writes, adding needless pressure even
  // where it *does* work. One raw `UPDATE ... FROM (VALUES ...)` statement
  // — the same batching approach F8 uses for checklist rescale — replaces
  // all of that with a single statement while still writing each
  // container's own distinct value.
  if (updates.length === 0) return;
  await client.$executeRaw`
    UPDATE "Dish" AS d
    SET "currentStructuralSearchText" = v.search_text
    FROM (VALUES ${Prisma.join(
      updates.map((u) => Prisma.sql`(${u.id}::text, ${u.searchText}::text)`),
    )}) AS v(id, search_text)
    WHERE d.id = v.id
  `;
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

// Decimal(10, 2) columns (calories/protein/carbs/fat, schema.prisma) —
// rounded here for the same reason `normalizeQuantity` rounds ingredient
// quantities to Decimal(12,3): one deliberate rounding point before
// persistence, not left for Postgres to round silently.
const NUTRITION_VALUE_DECIMAL_PLACES = 2;

function normalizeNutritionValue(
  value: number | null | undefined,
): number | null {
  return value == null
    ? null
    : Number(value.toFixed(NUTRITION_VALUE_DECIMAL_PLACES));
}

export type NormalizedNutrition = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  nutritionBasis: "WHOLE" | "PER_OUTPUT_UNIT" | null;
  nutritionBasisQuantity: number | null;
  nutritionBasisUnit: string | null;
  // Prisma's nullable-Json write input distinguishes "column is SQL NULL"
  // (`Prisma.DbNull`) from "column holds a JSON null" — DishFrame always
  // means the former (no More-nutrients data), never the latter.
  moreNutrients:
    NonNullable<DishContentInput["moreNutrients"]> | typeof Prisma.DbNull;
  nutritionSourceProvider: NutritionSourceProviderValue | null;
  nutritionSourceId: string | null;
  nutritionSourceName: string | null;
};

/**
 * PRODUCT_SPEC.md §54.1/§54.2/§54.4: shapes and validates a proposed
 * Version's nutrition fields — the server-side sanitization boundary both
 * `createDish` and `editDish` always pass through, mirroring
 * `sanitizedSectionsOrThrow`'s role for content. Enforces:
 *
 * - the database's raw-SQL `nutrition_basis_consistency` CHECK constraint
 *   (basis unset or `WHOLE` => basisQuantity/basisUnit both null;
 *   `PER_OUTPUT_UNIT` => both set, quantity > 0 —
 *   `constraints.integration.test.ts`);
 * - Slice 13 correction pass attribution integrity: a source provider and
 *   its id/name can never be saved in a partial or fabricated combination
 *   (§54.4 — "labeled as sourced information," which requires the label
 *   itself to be trustworthy). No provider means no id/name either;
 *   `USDA_FDC` requires both a non-empty id and name; any other provider
 *   value is rejected outright (`dishContentSchema`'s `z.enum` already
 *   rejects it at the Server Action boundary — this is the authoritative,
 *   never-trust-the-client backstop for a direct service call).
 *
 * Both up front with a friendly `ValidationError`, so a direct service call
 * bypassing the editor's own UI (or `dishContentSchema.parse`) can never
 * reach the database with a combination either constraint would reject.
 */
function normalizeNutritionOrThrow(
  input: DishContentInput,
): NormalizedNutrition {
  const nutritionBasis =
    input.nutritionBasis === "PER_OUTPUT_UNIT" ||
    input.nutritionBasis === "WHOLE"
      ? input.nutritionBasis
      : null;

  let nutritionBasisQuantity: number | null = null;
  let nutritionBasisUnit: string | null = null;
  if (nutritionBasis === "PER_OUTPUT_UNIT") {
    const unit = input.nutritionBasisUnit?.trim();
    if (
      !input.nutritionBasisQuantity ||
      input.nutritionBasisQuantity <= 0 ||
      !unit
    ) {
      throw new ValidationError(
        "Enter a basis amount and unit for per-output-unit nutrition, or choose whole recipe/part instead.",
      );
    }
    nutritionBasisQuantity = normalizeQuantity(input.nutritionBasisQuantity);
    nutritionBasisUnit = unit;
  }

  const provider = input.nutritionSourceProvider ?? null;
  if (provider !== null && !nutritionSourceProviderValues.includes(provider)) {
    throw new ValidationError("That nutrition source isn't supported.");
  }
  const sourceId = input.nutritionSourceId?.trim() || null;
  const sourceName = input.nutritionSourceName?.trim() || null;
  if (provider === null) {
    if (sourceId || sourceName) {
      throw new ValidationError(
        "A nutrition source id/name can't be set without a source provider — detach, or select a source.",
      );
    }
  } else if (provider === "USDA_FDC") {
    if (!sourceId || !sourceName) {
      throw new ValidationError(
        "USDA FoodData Central attribution needs both a source id and a source name.",
      );
    }
  }

  return {
    calories: normalizeNutritionValue(input.calories),
    protein: normalizeNutritionValue(input.protein),
    carbs: normalizeNutritionValue(input.carbs),
    fat: normalizeNutritionValue(input.fat),
    nutritionBasis,
    nutritionBasisQuantity,
    nutritionBasisUnit,
    moreNutrients: input.moreNutrients?.length
      ? input.moreNutrients
      : Prisma.DbNull,
    nutritionSourceProvider: provider,
    nutritionSourceId: sourceId,
    nutritionSourceName: sourceName,
  };
}

/**
 * `moreNutrients` equality for `editDish`'s content-diffing — an empty
 * array and `null`/`undefined` are the same "no More-nutrients data" state
 * (matching `normalizeNutritionOrThrow`'s own write-time normalization), so
 * neither should register as a change against the other.
 */
function moreNutrientsEqual(
  base: Prisma.JsonValue | null,
  next: DishContentInput["moreNutrients"],
): boolean {
  const baseNormalized = base ?? null;
  const nextNormalized = next?.length ? next : null;
  return JSON.stringify(baseNormalized) === JSON.stringify(nextNormalized);
}

/** A verbatim `moreNutrients` copy (promotion/propagation/duplication) needs
 * the same `null` → `Prisma.DbNull` translation `normalizeNutritionOrThrow`
 * applies for a fresh write. */
function copyMoreNutrients(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/** The full nutrition column set, copied verbatim from an existing
 * `DishVersion` row — shared by `promoteHistoricalVersion`,
 * `propagateToOneContainer`, and `duplicateDish`, which each create a new
 * Version from a source Version's content without any nutrition edits. */
function copyNutritionColumns(source: {
  calories: Prisma.Decimal | null;
  protein: Prisma.Decimal | null;
  carbs: Prisma.Decimal | null;
  fat: Prisma.Decimal | null;
  nutritionBasis: $Enums.NutritionBasis | null;
  nutritionBasisQuantity: Prisma.Decimal | null;
  nutritionBasisUnit: string | null;
  moreNutrients: Prisma.JsonValue | null;
  nutritionSourceProvider: string | null;
  nutritionSourceId: string | null;
  nutritionSourceName: string | null;
}) {
  return {
    calories: source.calories,
    protein: source.protein,
    carbs: source.carbs,
    fat: source.fat,
    nutritionBasis: source.nutritionBasis,
    nutritionBasisQuantity: source.nutritionBasisQuantity,
    nutritionBasisUnit: source.nutritionBasisUnit,
    moreNutrients: copyMoreNutrients(source.moreNutrients),
    nutritionSourceProvider: source.nutritionSourceProvider,
    nutritionSourceId: source.nutritionSourceId,
    nutritionSourceName: source.nutritionSourceName,
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

  // Slice 6 post-gate, settled Review Gate 3 decision (§68, "direct
  // duplicate rule"): a parent DishVersion may not directly link the same
  // stable Part more than once, top-level or Section-nested — deliberately
  // NOT a scan of the complete transitive nested graph (see
  // `findDuplicatePartTargets`'s own doc comment).
  if (findDuplicatePartTargets(sections, input.partLinks).length > 0) {
    throw new ValidationError(
      "The same Part is already linked here — choose a different Part, or remove the duplicate link.",
    );
  }

  return sections;
}

/**
 * F5 (docs/performance-architecture-audit.md): returns the just-created
 * Version's id alongside the Dish id, so a caller that needs it (e.g.
 * Convert Section to Part) doesn't have to make a second round trip to
 * re-derive it. `createDish` below is a thin wrapper preserving the
 * original dishId-only contract for every existing caller.
 */
export async function createDishWithVersion(
  ownerId: string,
  kind: DishKindValue,
  input: DishContentInput,
  // Slice 11, PRODUCT_SPEC.md §57's "source information": set only by
  // `importExport/service.ts`'s `confirmImport`, which is otherwise this
  // exact same function — the same "one atomic Dish.create write" pattern
  // `duplicateDish` already uses for `sourceKind: "DUPLICATE"`, not a
  // second, parallel creation path.
  source?: { title: string | null },
): Promise<{ dishId: string; versionId: string }> {
  const sections = sanitizedSectionsOrThrow(input);
  const nutrition = normalizeNutritionOrThrow(input);

  // Version-trigger and Slice 5 image correction pass §4: a client-supplied
  // imageAssetId must never be trusted merely because the row exists.
  if (input.imageAssetId) {
    await assertImageAssetAttachable(prisma, ownerId, input.imageAssetId);
  }

  // Slice 6 post-gate, settled Review Gate 3 decision: the authoritative
  // save-time check that every proposed PartLink target is a real, owned
  // Part with a matching Version — never trusted merely because the client
  // sent it (mirrors the imageAssetId check just above).
  await assertValidPartLinkTargets(
    prisma,
    ownerId,
    collectPartLinkEdges(sections, input.partLinks),
  );

  return prisma.$transaction(async (tx) => {
    const dish = await tx.dish.create({
      data: {
        ownerId,
        kind,
        stage: input.stage,
        cuisine: input.cuisine || null,
        archivedAt: input.stage === "ARCHIVED" ? new Date() : null,
        currentTitle: input.title,
        ...(source
          ? { sourceKind: "IMPORT" as const, sourceTitle: source.title }
          : {}),
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
        // uploaded (and its ImageAsset row created via
        // `uploadAndNormalizeImage`) before the very first save.
        imageAssetId: input.imageAssetId ?? null,
        ...nutrition,
      },
    });

    // No cycle-check needed here: a brand-new Dish's `id` cannot possibly
    // already be reachable from any pre-existing PartLink graph (nothing
    // could have linked to an id that didn't exist until this very
    // transaction), so attaching Parts on first creation can never
    // introduce a cycle — ARCHITECTURE_PROPOSAL.md §G.3's check is only
    // meaningful once a Dish already has an identity other content could
    // reference.
    const { sectionNames, partLinkTargetDishIds } = await insertSections(
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
        currentStructuralSearchText: await structuralSearchTextFor(
          tx,
          sectionNames,
          partLinkTargetDishIds,
        ),
      },
    });

    return { dishId: dish.id, versionId: version.id };
  });
}

/** The original dishId-only contract every pre-existing caller expects — see `createDishWithVersion` above. */
export async function createDish(
  ownerId: string,
  kind: DishKindValue,
  input: DishContentInput,
  source?: { title: string | null },
): Promise<string> {
  const { dishId } = await createDishWithVersion(ownerId, kind, input, source);
  return dishId;
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
  const base = await getDishScopedVersionContentForReuseOrThrow(
    dish.id,
    baseVersionId,
  );

  // Code-audit fidelity fix (2026-08-27 follow-up): `base` now reads both
  // PartLink states so an existing MATERIALIZED occurrence can be carried
  // forward into any new Version this function creates below — the editor
  // only ever submits LIVE content, so an ordinary edit was previously
  // dropping any MATERIALIZED occurrence the base Version already held.
  // Classification/diffing below still needs a LIVE-only view of `base`
  // (the editor genuinely never shows a MATERIALIZED occurrence, so it must
  // never register as a "removed" live change) — `baseLivePartLinks` is
  // that view. `materializedBySectionLineage`/`materializedTopLevel` (via
  // the same `versionContentToInsertableInput`/`splitLiveAndMaterialized`
  // pair the reproduce-paths above use) are merged back into the submitted
  // content in the version-creation branch below.
  const baseLivePartLinks = base.partLinks.filter(
    (link) => link.linkState === "LIVE",
  );
  const {
    sections: baseInsertableSections,
    partLinks: baseInsertableTopLevel,
  } = versionContentToInsertableInput(base.sections, base.partLinks);
  const {
    liveSections: baseSectionMetaByLineage,
    materializedBySectionLineage,
    materializedTopLevel,
  } = splitLiveAndMaterialized(baseInsertableSections, baseInsertableTopLevel);

  const sections = sanitizedSectionsOrThrow(input);
  const nutrition = normalizeNutritionOrThrow(input);

  // Version-trigger correction pass, PRODUCT_SPEC.md §7.1: title is stable
  // Dish identity, not Version-owned — grouped with Stage/cuisine, compared
  // against the Dish's own denormalized title rather than the base
  // Version's `title` column (which is written at Version-creation time but
  // never itself the source of truth once title can change independently).
  const stableChanged =
    input.stage !== dish.stage ||
    (input.cuisine || null) !== (dish.cuisine ?? null) ||
    input.title !== (dish.currentTitle ?? "");

  // Slice 13 metadata-classification correction pass, PRODUCT_SPEC.md §7.2/
  // §54: description, image, yield, prep/cook time, difficulty, and the
  // full nutrition shape (primary values, basis, More nutrients, source
  // attribution) are all Version-*scoped* but mutable metadata — none of
  // them describe what is actually prepared, so a change to any of them,
  // alone, updates the selected Version in place rather than creating a
  // new one. This was previously split across two buckets (description/
  // image in place; yield/prep/cook/difficulty/nutrition auto-minor) — the
  // settled product rule collapses that distinction: only material
  // preparation content (below) ever creates a Version.
  const versionMetadataChanged =
    (base.description ?? null) !== (input.description || null) ||
    (base.imageAssetId ?? null) !== (input.imageAssetId ?? null) ||
    decimalToNumber(base.yieldQuantity) !== (input.yieldQuantity ?? null) ||
    (base.yieldUnit ?? null) !== (input.yieldUnit || null) ||
    (base.prepTimeMinutes ?? null) !== (input.prepTimeMinutes ?? null) ||
    (base.cookTimeMinutes ?? null) !== (input.cookTimeMinutes ?? null) ||
    (base.difficulty ?? null) !== (input.difficulty || null) ||
    decimalToNumber(base.calories) !== nutrition.calories ||
    decimalToNumber(base.protein) !== nutrition.protein ||
    decimalToNumber(base.carbs) !== nutrition.carbs ||
    decimalToNumber(base.fat) !== nutrition.fat ||
    (base.nutritionBasis ?? null) !== nutrition.nutritionBasis ||
    decimalToNumber(base.nutritionBasisQuantity) !==
      nutrition.nutritionBasisQuantity ||
    (base.nutritionBasisUnit ?? null) !== nutrition.nutritionBasisUnit ||
    !moreNutrientsEqual(base.moreNutrients, input.moreNutrients) ||
    (base.nutritionSourceProvider ?? null) !==
      nutrition.nutritionSourceProvider ||
    (base.nutritionSourceId ?? null) !== nutrition.nutritionSourceId ||
    (base.nutritionSourceName ?? null) !== nutrition.nutritionSourceName;

  const { cookingChanged, sectionOrganizationChanged } = diffVersionContent(
    versionContentToInput(base.sections, baseLivePartLinks),
    { sections, partLinks: input.partLinks },
  );
  // Material preparation content — Ingredients/Instructions/linked Parts
  // (`cookingChanged`) or Section add/remove/rename/reorder
  // (`sectionOrganizationChanged`) — is the only thing that ever creates a
  // Version (see the module doc comment above).
  const materialContentChanged = cookingChanged || sectionOrganizationChanged;

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

  if (!materialContentChanged) {
    // No material preparation-content change — never allocates a Version
    // number, whether `base` is the Dish's current Version or a
    // deliberately selected historical one; either way only that exact row
    // is ever touched. Stable Dish metadata (Stage/cuisine/title) and
    // Version-scoped metadata (description/image/yield/prep/cook/
    // difficulty/nutrition) are applied directly, independently of each
    // other; a save with neither is a true no-op.
    if (stableChanged) {
      const titleChanged = input.title !== (dish.currentTitle ?? "");
      await prisma.$transaction(async (tx) => {
        await tx.dish.update({
          where: { id: dish.id },
          data: {
            stage: input.stage,
            cuisine: input.cuisine || null,
            archivedAt: nextArchivedAt(
              dish.stage,
              dish.archivedAt,
              input.stage,
            ),
            currentTitle: input.title,
          },
        });
        // Slice 10 correction: a Part's title is denormalized into every
        // current parent's search text (see `structuralSearchTextFor`) — a
        // rename must refresh them, even though renaming itself never
        // creates a Version.
        if (dish.kind === "PART" && titleChanged) {
          await refreshStructuralSearchTextForPartUsages(tx, ownerId, dish.id);
        }
      });
    }
    if (versionMetadataChanged) {
      await applyVersionMetadataUpdate(base, {
        description: input.description || null,
        imageAssetId: input.imageAssetId ?? null,
        yieldQuantity: input.yieldQuantity ?? null,
        yieldUnit: input.yieldUnit || null,
        prepTimeMinutes: input.prepTimeMinutes ?? null,
        cookTimeMinutes: input.cookTimeMinutes ?? null,
        difficulty: normalizeDifficultyValue(input.difficulty),
        ...nutrition,
      });
    }
    return dish.id;
  }

  const bump: VersionChoiceValue = cookingChanged ? versionChoice! : "MINOR";

  return withVersionAllocation(async (tx) => {
    // Slice 6 post-gate: the authoritative save-time PartLink-target check,
    // re-run here for the same reason the cycle check below is — a client
    // cannot bypass it, and it closes the race window between the editor's
    // attach-time validation and this save (e.g. a concurrently-deleted or
    // -retyped target Part).
    await assertValidPartLinkTargets(
      tx,
      ownerId,
      collectPartLinkEdges(sections, input.partLinks),
    );

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
        ...nutrition,
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

    // Code-audit fidelity fix: merge the base Version's untouched
    // MATERIALIZED occurrences back into the editor's submitted LIVE
    // content before writing the new Version — same merge semantics as
    // `propagateToOneContainer`/`resolvePartUsageOccurrence` above. Unlike
    // those two (which only ever retarget/remove one LIVE occurrence within
    // an otherwise-unchanged Section set), an ordinary edit can add/remove
    // whole Sections — a Section holding nothing but a MATERIALIZED
    // occurrence looks empty to the editor and is never resubmitted, so
    // `mergeMaterializedBack`'s lineageId match alone would lose it. Any
    // base Section whose lineageId doesn't survive into the submission is
    // resurrected here, carrying forward only its frozen MATERIALIZED
    // content — never its own since-removed LIVE content, which the user's
    // edit already intentionally dropped.
    const submittedSectionLineageIds = new Set(
      sections
        .map((section) => section.lineageId)
        .filter((id): id is string => !!id),
    );
    const resurrectedSections: InsertableSection[] = baseSectionMetaByLineage
      .filter(
        (section) =>
          section.lineageId &&
          !submittedSectionLineageIds.has(section.lineageId) &&
          (materializedBySectionLineage.get(section.lineageId)?.length ?? 0) >
            0,
      )
      .map((section) => ({
        lineageId: section.lineageId,
        name: section.name,
        guidanceNote: section.guidanceNote,
        position: section.position,
        ingredients: [],
        instructions: [],
        partLinks: materializedBySectionLineage.get(section.lineageId!) ?? [],
      }));
    const { sections: mergedSections, partLinks: mergedTopLevel } =
      mergeMaterializedBack(
        sections,
        input.partLinks,
        materializedBySectionLineage,
        materializedTopLevel,
      );

    const { sectionNames, partLinkTargetDishIds } = await insertSections(
      tx,
      version.id,
      [...mergedSections, ...resurrectedSections],
      mergedTopLevel,
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
              currentStructuralSearchText: await structuralSearchTextFor(
                tx,
                sectionNames,
                partLinkTargetDishIds,
              ),
            }
          : {}),
      },
    });

    // Slice 10 correction: same as the no-version-bump branch above — a
    // Part-title rename must refresh every other current parent that
    // directly links this Part, independent of whether *this* save also
    // created a Version.
    if (dish.kind === "PART" && input.title !== (dish.currentTitle ?? "")) {
      await refreshStructuralSearchTextForPartUsages(tx, ownerId, dish.id);
    }

    return dish.id;
  });
}

/**
 * Version-trigger correction pass, extended by the Slice 13 metadata-
 * classification correction pass, PRODUCT_SPEC.md §7.2/§54: description,
 * image, yield, prep time, cook time, difficulty, and the full nutrition
 * shape are all Version-*scoped* but mutable — this updates the selected
 * `DishVersion` row directly, the one sanctioned exception (alongside
 * `versionNote`) to "DishVersion content is never mutated in place." Never
 * creates a Version, never touches `Dish.currentVersionId`, `sourceVersionId`,
 * version numbering, or any Section/Ingredient/Instruction/linked-Part
 * content — and works identically whether `version` is the Dish's current
 * Version or an arbitrary historical one, since none of these fields'
 * mutability depends on that distinction (editing a historical Version's
 * metadata here touches only that exact row).
 *
 * Runs the row update and the old image's orphan check in one transaction
 * (PRODUCT_SPEC.md §90.2's cleanup requirement) so a failure partway
 * through can't leave a `DishVersion` pointing at an image whose orphan
 * check never ran. The actual Blob delete stays best-effort, after commit,
 * matching every other external side effect in this file.
 */
async function applyVersionMetadataUpdate(
  version: { id: string; imageAssetId: string | null },
  data: {
    description: string | null;
    imageAssetId: string | null;
    yieldQuantity: number | null;
    yieldUnit: string | null;
    prepTimeMinutes: number | null;
    cookTimeMinutes: number | null;
    difficulty: string | null;
  } & NormalizedNutrition,
): Promise<void> {
  const priorImageAssetId = version.imageAssetId;
  const imageChanged = priorImageAssetId !== data.imageAssetId;

  const orphanedStorageKey = await prisma.$transaction(async (tx) => {
    await tx.dishVersion.update({
      where: { id: version.id },
      data: {
        description: data.description,
        imageAssetId: data.imageAssetId,
        yieldQuantity: data.yieldQuantity,
        yieldUnit: data.yieldUnit,
        prepTimeMinutes: data.prepTimeMinutes,
        cookTimeMinutes: data.cookTimeMinutes,
        difficulty: data.difficulty,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        nutritionBasis: data.nutritionBasis,
        nutritionBasisQuantity: data.nutritionBasisQuantity,
        nutritionBasisUnit: data.nutritionBasisUnit,
        moreNutrients: data.moreNutrients,
        nutritionSourceProvider: data.nutritionSourceProvider,
        nutritionSourceId: data.nutritionSourceId,
        nutritionSourceName: data.nutritionSourceName,
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
    // `updateVersionMetadata` only ever accepts description/image as input
    // (see its own doc comment) — every other Version-scoped metadata
    // field is carried through unchanged from the version's own current
    // value, so this call never touches yield/prep/cook/difficulty/
    // nutrition even though `applyVersionMetadataUpdate` now writes them.
    yieldQuantity: decimalToNumber(version.yieldQuantity),
    yieldUnit: version.yieldUnit,
    prepTimeMinutes: version.prepTimeMinutes,
    cookTimeMinutes: version.cookTimeMinutes,
    difficulty: version.difficulty,
    calories: decimalToNumber(version.calories),
    protein: decimalToNumber(version.protein),
    carbs: decimalToNumber(version.carbs),
    fat: decimalToNumber(version.fat),
    nutritionBasis: version.nutritionBasis,
    nutritionBasisQuantity: decimalToNumber(version.nutritionBasisQuantity),
    nutritionBasisUnit: version.nutritionBasisUnit,
    moreNutrients:
      version.moreNutrients === null
        ? Prisma.DbNull
        : (version.moreNutrients as unknown as NormalizedNutrition["moreNutrients"]),
    nutritionSourceProvider:
      version.nutritionSourceProvider as NutritionSourceProviderValue | null,
    nutritionSourceId: version.nutritionSourceId,
    nutritionSourceName: version.nutritionSourceName,
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
  const base = await getDishScopedVersionContentForReuseOrThrow(
    dish.id,
    versionId,
  );
  // Slice 6: PartLinks are copied verbatim, exactly like every other
  // content field here — no cycle re-check needed, since this exact set of
  // targets already passed cycle validation when the historical Version
  // was originally created for this same Dish, and nothing about the
  // targets changes here. Code-audit fidelity fix: a MATERIALIZED
  // occurrence (a historical Version can legitimately hold one, unlike a
  // Dish's current Version) is preserved verbatim rather than silently
  // dropped.
  const { sections, partLinks } = versionContentToInsertableInput(
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
        ...copyNutritionColumns(base),
        sourceVersionId: base.id,
        versionNote: seedMajorVersionNote(
          base.majorVersion,
          base.minorVersion,
          majorVersion,
          baseWasAlreadyCurrentLine,
        ),
      },
    });

    const { sectionNames, partLinkTargetDishIds } = await insertSections(
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
        currentStructuralSearchText: await structuralSearchTextFor(
          tx,
          sectionNames,
          partLinkTargetDishIds,
        ),
      },
    });

    return dish.id;
  });
}

// Slice 6 post-gate, PRODUCT_SPEC.md §72/§73, ARCHITECTURE_PROPOSAL.md §I:
// "Propagate Part update" row — per-item transaction batching, not one
// giant transaction across the whole selection, so one failed parent
// cannot block or roll back the rest.

export type PropagationSelection = {
  containerDishId: string;
  // Slice 6 correction pass §2: the direct-duplicate invariant
  // (`findDuplicatePartTargets`) guarantees a given Part is directly linked
  // at most ONCE per parent Version — top-level or Section-nested, never
  // both counted separately — so one parent has exactly one direct
  // occurrence to target, identified by its stable `lineageId`. This is no
  // longer a list: there is nothing to select among within one parent.
  lineageId: string;
};

export type PropagationOutcome =
  | { containerDishId: string; status: "updated"; newVersionId: string }
  | { containerDishId: string; status: "skipped"; reason: string }
  | { containerDishId: string; status: "failed"; reason: string };

async function propagateToOneContainer(
  ownerId: string,
  partDishId: string,
  newTargetVersion: { id: string; majorVersion: number; minorVersion: number },
  partTitle: string,
  selection: PropagationSelection,
  bump: VersionChoiceValue,
): Promise<PropagationOutcome> {
  try {
    const container = await getOwnedDishOrThrow(
      ownerId,
      selection.containerDishId,
    );
    if (!container.currentVersionId) {
      return {
        containerDishId: container.id,
        status: "skipped",
        reason: "This item has no saved content yet.",
      };
    }

    const base = await getDishScopedVersionContentForReuseOrThrow(
      container.id,
      container.currentVersionId,
    );
    // Code-audit fidelity fix: retargeting only ever touches a LIVE
    // occurrence's target, so the retarget logic below runs against a
    // LIVE-only view exactly as before — but any unrelated MATERIALIZED
    // occurrence elsewhere in this container's content is set aside here
    // and merged back in (`mergeMaterializedBack`) rather than silently
    // dropped when this container's new Version is written.
    const { sections: allSections, partLinks: allTopLevel } =
      versionContentToInsertableInput(base.sections, base.partLinks);
    const {
      liveSections: sections,
      liveTopLevel: partLinks,
      materializedBySectionLineage,
      materializedTopLevel,
    } = splitLiveAndMaterialized(allSections, allTopLevel);

    let matchedCount = 0;
    let changedCount = 0;
    let previousTargetVersionId: string | null = null;

    function retarget(links: PartLinkInput[]): PartLinkInput[] {
      return links.map((link) => {
        if (
          link.lineageId !== selection.lineageId ||
          link.targetDishId !== partDishId
        ) {
          return link;
        }
        matchedCount++;
        if (link.targetDishVersionId === newTargetVersion.id) return link;
        changedCount++;
        previousTargetVersionId ??= link.targetDishVersionId;
        return { ...link, targetDishVersionId: newTargetVersion.id };
      });
    }

    const retargetedTopLevel = retarget(partLinks);
    const retargetedSections = sections.map((section) => ({
      ...section,
      partLinks: retarget(section.partLinks),
    }));

    if (matchedCount === 0) {
      return {
        containerDishId: container.id,
        status: "skipped",
        reason: "This occurrence is no longer present in the current version.",
      };
    }
    if (changedCount === 0) {
      return {
        containerDishId: container.id,
        status: "skipped",
        reason: "Already current.",
      };
    }

    const fromVersion = previousTargetVersionId
      ? await prisma.dishVersion.findUnique({
          where: { id: previousTargetVersionId },
          select: { majorVersion: true, minorVersion: true },
        })
      : null;

    return await withVersionAllocation(async (tx) => {
      // Re-run authoritatively, same reasoning as editDish: closes the race
      // window between when the propagation batch was assembled and this
      // specific item's own transaction (e.g. a concurrent edit introduced
      // a cycle since then).
      if (container.kind === "PART") {
        await assertNoPartCycle(
          tx,
          container.id,
          collectPartLinkEdges(retargetedSections, retargetedTopLevel),
        );
      }

      // `becomesCurrent` is always true here, unconditionally, unlike
      // `editDish`'s own guarded version: `base` is always the container's
      // own *current* Version (loaded via `container.currentVersionId`
      // above), and current is always on the highest major line (§13.5),
      // so a MINOR bump from it always stays current too.
      const { majorVersion, minorVersion } = await nextVersionNumbers(
        tx,
        container.id,
        base.majorVersion,
        bump,
      );

      const toLabel = versionLabel(
        newTargetVersion.majorVersion,
        newTargetVersion.minorVersion,
      );
      const fromLabel = fromVersion
        ? versionLabel(fromVersion.majorVersion, fromVersion.minorVersion)
        : toLabel;

      const version = await tx.dishVersion.create({
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
          ...copyNutritionColumns(base),
          sourceVersionId: base.id,
          // PRODUCT_SPEC.md §73.2: a propagation-only change defaults to
          // "Save small update" regardless of whether the incoming Part
          // change was itself minor or major — `bump` defaults to MINOR at
          // the caller, with §73.3's "manual authority" letting the caller
          // override to MAJOR.
          versionNote: seedPropagationVersionNote(
            base.majorVersion,
            base.minorVersion,
            majorVersion,
            minorVersion,
            partTitle,
            fromLabel,
            toLabel,
          ),
        },
      });

      const { sections: finalSections, partLinks: finalTopLevel } =
        mergeMaterializedBack(
          retargetedSections,
          retargetedTopLevel,
          materializedBySectionLineage,
          materializedTopLevel,
        );
      const { sectionNames, partLinkTargetDishIds } = await insertSections(
        tx,
        version.id,
        finalSections,
        finalTopLevel,
        { mintFreshLineage: false },
      );

      // Always current — see `baseWasAlreadyCurrentLine`'s comment above;
      // written unconditionally (rather than guarded) for the same reason
      // it's always true, matching `promoteHistoricalVersion`'s posture.
      await tx.dish.update({
        where: { id: container.id },
        data: {
          currentVersionId: version.id,
          currentStructuralSearchText: await structuralSearchTextFor(
            tx,
            sectionNames,
            partLinkTargetDishIds,
          ),
        },
      });

      return {
        containerDishId: container.id,
        status: "updated",
        newVersionId: version.id,
      } as const;
    });
  } catch (error) {
    const reason =
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ConflictError
        ? error.message
        : "Could not update this item. Please try again.";
    return {
      containerDishId: selection.containerDishId,
      status: "failed",
      reason,
    };
  }
}

/**
 * PRODUCT_SPEC.md §72.4/§72.5, ARCHITECTURE_PROPOSAL.md §I: propagates a
 * newer Part Version to a selected set of parent Recipes/Parts. Each
 * selected parent is validated and saved in its own independent
 * transaction (`propagateToOneContainer`) — a failure on one parent (a
 * cycle introduced by a concurrent edit, a since-removed occurrence, a lost
 * race with another save) never blocks or rolls back the others. Returns a
 * per-parent outcome rather than an all-or-nothing result.
 */
export async function propagatePartUpdate(
  ownerId: string,
  partDishId: string,
  newTargetVersionId: string,
  selections: PropagationSelection[],
  bump: VersionChoiceValue = "MINOR",
): Promise<PropagationOutcome[]> {
  const partDish = await getOwnedDishOrThrow(ownerId, partDishId, "PART");
  const newTargetVersion = await prisma.dishVersion.findFirst({
    where: { id: newTargetVersionId, dishId: partDish.id },
    select: { id: true, majorVersion: true, minorVersion: true },
  });
  if (!newTargetVersion) {
    throw new NotFoundError("Version not found.");
  }
  const partTitle = partDish.currentTitle ?? "this Part";

  const outcomes: PropagationOutcome[] = [];
  for (const selection of selections) {
    outcomes.push(
      await propagateToOneContainer(
        ownerId,
        partDish.id,
        newTargetVersion,
        partTitle,
        selection,
        bump,
      ),
    );
  }
  return outcomes;
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
 * Slice 6A, PRODUCT_SPEC.md §51.4: the saved "default scale" is a
 * preference-only positive multiplier applied to the authored yield —
 * never creates a Version, never touches the authored Version's own
 * `yieldQuantity`/`yieldUnit`. Passing `null` resets it back to no saved
 * preference (an effective 1x, §51.4's "remains resettable").
 */
export async function setDefaultScale(
  ownerId: string,
  dishId: string,
  defaultScale: number | null,
  kind?: DishKindValue,
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  await prisma.dish.update({
    where: { id: dish.id },
    data: { defaultScale },
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
      partLinks: partLinkContentIncludeAllStates,
    },
  });
  if (!sourceVersion) {
    throw new NotFoundError("Version not found.");
  }

  // Slice 6, ARCHITECTURE_PROPOSAL.md §D.2a-style reasoning (as already
  // applied to images here): a brand-new Dish id can never already be
  // reachable from any pre-existing PartLink graph, so copying these exact
  // targets onto a new Dish can never introduce a cycle — no re-check
  // needed, same as `createDish`. Code-audit fidelity fix: a MATERIALIZED
  // occurrence is preserved verbatim (`versionContentToInsertableInput`)
  // rather than silently dropped — it has no live target of its own to
  // cycle-check anyway.
  const { sections, partLinks } = versionContentToInsertableInput(
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

  // PRODUCT_SPEC.md §19.1: a static starting-point snapshot, captured once
  // here and never refreshed afterward (§19.2) — the source's own aggregate
  // rating/count at this exact moment, used as this duplicate's provisional
  // principal rating until it earns a genuine rating of its own (§36.5).
  const ratingSnapshot = await getDuplicationRatingSnapshot(dish.id);

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
        sourceAggregateRating: ratingSnapshot.aggregateRating,
        sourceRatingCount: ratingSnapshot.ratingCount,
        sourceSessionCount: ratingSnapshot.sessionCount,
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
        ...copyNutritionColumns(sourceVersion),
      },
    });

    const { sectionNames, partLinkTargetDishIds } = await insertSections(
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
        currentStructuralSearchText: await structuralSearchTextFor(
          tx,
          sectionNames,
          partLinkTargetDishIds,
        ),
      },
    });

    return newDish.id;
  });
}

/**
 * Slice 16, Gate 7 §2.4/§2.6/§2.7: the shared recursive independent-copy
 * engine — generalizes `duplicateDish` above (same private helpers, same
 * "one transaction, insertSections + copyNutritionColumns-style verbatim
 * nutrition + rating-snapshot provenance" shape) rather than introducing a
 * second duplication architecture. `graph` is a pre-resolved,
 * cross-account-safe `ShareGraph` (`sharing/graph.ts` — deliberately not
 * owner-scoped, since reading another account's content is exactly what a
 * share is); this function only ever creates rows, never reads the source
 * again, so the copy is atomic against the exact graph the caller resolved.
 *
 * One recipient-owned `Dish` is created per distinct source `dishId`
 * (`graph.order`'s post-order guarantees every child Part is already
 * created before the parent that links it, so `PartLink` targets can always
 * be remapped to already-created recipient ids). Multiple distinct source
 * Versions referenced for the same source Part become sequential local
 * majors (V1.0, V2.0, …) on one copied Part, in ascending
 * `(sourceMajor, sourceMinor)` order (Gate 7 §2.7) — new majors, not minors,
 * since these are independent snapshots rather than a real small-edit
 * lineage of each other; `DishVersion.sourceVersionId` is therefore left
 * unset (it encodes real same-Dish edit lineage, Arch §F.4, which does not
 * apply here). The Dish-level `sourceKind: "ACCEPTED_SHARE"` snapshot
 * (`sourceDishId`/`sourceDishVersionLabel`/`sourceTitle`/rating snapshot)
 * reflects whichever source Version became this copy's current Version,
 * matching `duplicateDish`'s existing single-snapshot convention.
 *
 * Reused as-is by Slice 17 (direct account-to-account sharing) — that slice
 * only needs to resolve its own `ShareGraph` root (a `DirectShare`'s pinned
 * `dishId`/`dishVersionId` instead of a `ShareLink`'s) and call this same
 * function; no second copy path.
 *
 * Takes an already-open transaction client rather than opening its own —
 * the caller (`sharing/service.ts`'s `saveSharedCopy`) must commit the
 * idempotency bookkeeping row (`ShareLinkAcceptance`) in the same
 * transaction as the copy itself, so a lost double-submit race (caught as a
 * unique-constraint violation on that row) rolls back the *entire* copied
 * graph too — never an orphaned, untracked duplicate copy for the race's
 * loser.
 */
export async function createIndependentCopyFromGraph(
  tx: Prisma.TransactionClient,
  recipientId: string,
  graph: ShareGraph,
): Promise<{ dishId: string; dishKind: DishKindValue }> {
  const versionIdsByDish = new Map<string, string[]>();
  const dishCreationOrder: string[] = [];
  for (const versionId of graph.order) {
    const dishId = graph.nodes.get(versionId)!.dishId;
    if (!versionIdsByDish.has(dishId)) {
      versionIdsByDish.set(dishId, []);
      dishCreationOrder.push(dishId);
    }
    versionIdsByDish.get(dishId)!.push(versionId);
  }
  for (const versionIds of versionIdsByDish.values()) {
    versionIds.sort((a, b) => {
      const na = graph.nodes.get(a)!;
      const nb = graph.nodes.get(b)!;
      return na.majorVersion !== nb.majorVersion
        ? na.majorVersion - nb.majorVersion
        : na.minorVersion - nb.minorVersion;
    });
  }

  // Rating snapshots (PRODUCT_SPEC.md §19.1) are read fresh, once per
  // distinct source Dish, before the transaction starts — same timing
  // `duplicateDish` already uses.
  const ratingSnapshots = new Map<
    string,
    Awaited<ReturnType<typeof getDuplicationRatingSnapshot>>
  >();
  for (const sourceDishId of dishCreationOrder) {
    ratingSnapshots.set(
      sourceDishId,
      await getDuplicationRatingSnapshot(sourceDishId),
    );
  }

  // Slice 17 correction pass: a graph resolved from a caller-held snapshot
  // (a frozen `DirectShare`) may describe a source Dish permanently deleted
  // sometime *after* the graph was captured but *before* this transaction
  // runs — the FK `Dish.sourceDishId` would otherwise reject an insert
  // referencing a row that no longer exists. `sourceTitle`/
  // `sourceDishVersionLabel` (already denormalized strings, not FKs) still
  // faithfully preserve provenance either way, matching the existing "source
  // deleted, title/label survive" convention `Dish.sourceDishId`'s own
  // `onDelete: SetNull` already establishes for a *later* deletion of an
  // already-copied row's source. A graph built live (every non-frozen
  // caller) always finds every source Dish still present here — this is a
  // no-op query in that case, not a new cost for the common path.
  const survivingSourceDishIds = new Set(
    (
      await tx.dish.findMany({
        where: { id: { in: dishCreationOrder } },
        select: { id: true },
      })
    ).map((d) => d.id),
  );

  const recipientDishIdBySourceDishId = new Map<string, string>();
  const recipientVersionIdBySourceVersionId = new Map<string, string>();

  for (const sourceDishId of dishCreationOrder) {
    const versionIds = versionIdsByDish.get(sourceDishId)!;
    const lastNode = graph.nodes.get(versionIds[versionIds.length - 1])!;
    const ratingSnapshot = ratingSnapshots.get(sourceDishId)!;

    const newDish = await tx.dish.create({
      data: {
        ownerId: recipientId,
        kind: lastNode.dishKind,
        stage: "IDEA",
        cuisine: lastNode.dishCuisine,
        currentTitle: lastNode.dishTitle,
        sourceKind: "ACCEPTED_SHARE",
        sourceDishId: survivingSourceDishIds.has(sourceDishId)
          ? sourceDishId
          : null,
        sourceDishVersionLabel: versionLabel(
          lastNode.majorVersion,
          lastNode.minorVersion,
        ),
        sourceTitle: lastNode.dishTitle,
        sourceAggregateRating: ratingSnapshot.aggregateRating,
        sourceRatingCount: ratingSnapshot.ratingCount,
        sourceSessionCount: ratingSnapshot.sessionCount,
      },
    });
    recipientDishIdBySourceDishId.set(sourceDishId, newDish.id);

    let currentVersionId: string | null = null;
    let currentSectionNames: string[] = [];
    let currentPartLinkTargetDishIds: string[] = [];

    for (let i = 0; i < versionIds.length; i++) {
      const node = graph.nodes.get(versionIds[i])!;
      const remapPartLink = (link: PartLinkInput): PartLinkInput => ({
        ...link,
        targetDishId: recipientDishIdBySourceDishId.get(link.targetDishId)!,
        targetDishVersionId: recipientVersionIdBySourceVersionId.get(
          link.targetDishVersionId,
        )!,
      });
      // Correction pass: a MATERIALIZED occurrence has no source Dish/Part
      // of its own to copy (it was deleted — this *is* everything that
      // survives of it) — the recipient's copy gets the identical frozen
      // snapshot, never a live dependency on the original. Its OWN nested
      // PartLinks are always LIVE-shaped (materialization never recurses,
      // `sharing/graph.ts`'s module doc comment) and point at real Parts
      // this graph already walked and copied, so they're remapped exactly
      // like any other LIVE reference — never left pointing back at the
      // sender's rows.
      const remapRef = (ref: ShareGraphPartLinkRef): InsertablePartLink => {
        if (ref.kind === "MATERIALIZED") {
          return {
            kind: "MATERIALIZED",
            position: ref.position,
            multiplier: ref.multiplier,
            materializedTitle: ref.materializedTitle,
            materializedVersionLabel: ref.materializedVersionLabel,
            materializedContent: {
              partLinks: ref.materializedContent.partLinks.map(remapPartLink),
              sections: ref.materializedContent.sections.map(
                (section: SectionInput) => ({
                  ...section,
                  partLinks: section.partLinks.map(remapPartLink),
                }),
              ),
            } as unknown as Prisma.InputJsonValue,
          };
        }
        return remapPartLink({
          targetDishId: ref.targetDishId,
          targetDishVersionId: ref.targetDishVersionId,
          position: ref.position,
          multiplier: ref.multiplier,
        });
      };

      const newVersion = await tx.dishVersion.create({
        data: {
          dishId: newDish.id,
          majorVersion: i + 1,
          minorVersion: 0,
          title: node.dishTitle,
          description: node.description,
          imageAssetId: node.imageAssetId,
          yieldQuantity: node.yieldQuantity,
          yieldUnit: node.yieldUnit,
          prepTimeMinutes: node.prepTimeMinutes,
          cookTimeMinutes: node.cookTimeMinutes,
          difficulty: node.difficulty,
          calories: node.calories,
          protein: node.protein,
          carbs: node.carbs,
          fat: node.fat,
          nutritionBasis: node.nutritionBasis,
          nutritionBasisQuantity: node.nutritionBasisQuantity,
          nutritionBasisUnit: node.nutritionBasisUnit,
          moreNutrients: copyMoreNutrients(node.moreNutrients),
          nutritionSourceProvider: node.nutritionSourceProvider,
          nutritionSourceId: node.nutritionSourceId,
          nutritionSourceName: node.nutritionSourceName,
          versionNote: `Copied from shared ${versionLabel(node.majorVersion, node.minorVersion)}.`,
        },
      });
      recipientVersionIdBySourceVersionId.set(node.versionId, newVersion.id);
      currentVersionId = newVersion.id;

      const { sectionNames, partLinkTargetDishIds } = await insertSections(
        tx,
        newVersion.id,
        node.sections.map((section) => ({
          ...section,
          partLinks: section.partLinks.map(remapRef),
        })),
        node.topLevelPartLinks.map(remapRef),
        { mintFreshLineage: true },
      );
      currentSectionNames = sectionNames;
      currentPartLinkTargetDishIds = partLinkTargetDishIds;
    }

    await tx.dish.update({
      where: { id: newDish.id },
      data: {
        currentVersionId,
        currentStructuralSearchText: await structuralSearchTextFor(
          tx,
          currentSectionNames,
          currentPartLinkTargetDishIds,
        ),
      },
    });
  }

  return {
    dishId: recipientDishIdBySourceDishId.get(
      graph.nodes.get(graph.rootVersionId)!.dishId,
    )!,
    dishKind: graph.nodes.get(graph.rootVersionId)!.dishKind,
  };
}

/**
 * ARCHITECTURE_PROPOSAL.md §I/§H.1: revokes every ShareLink and cancels
 * every pending DirectShare referencing this Dish — shared by both the
 * ordinary Recipe/Part delete below and the two-phase Part-deletion final
 * step (Arch §I: "same share-revocation/pending-direct-share-cancellation
 * step... since a Part is deletable and shareable exactly like a Recipe").
 */
async function revokeSharesAndCancelPendingShares(
  tx: Prisma.TransactionClient,
  dishId: string,
): Promise<void> {
  const now = new Date();
  await tx.shareLink.updateMany({
    where: {
      OR: [{ currentDishId: dishId }, { fixedDishId: dishId }],
      revokedAt: null,
    },
    data: { revokedAt: now },
  });
  await tx.directShare.updateMany({
    where: { dishId, status: "PENDING" },
    data: { status: "CANCELED" },
  });
}

/**
 * Slice 5, ARCHITECTURE_PROPOSAL.md §D.2a: every distinct ImageAsset any of
 * this Dish's own Versions reference, gathered *before* the cascading
 * delete removes those DishVersion rows — the reference-counted check
 * afterward needs a candidate list to check, not a live query against rows
 * that no longer exist.
 */
async function collectReferencedImageAssetIds(
  dishId: string,
): Promise<string[]> {
  const rows = await prisma.dishVersion.findMany({
    where: { dishId, imageAssetId: { not: null } },
    select: { imageAssetId: true },
    distinct: ["imageAssetId"],
  });
  return rows
    .map((row) => row.imageAssetId)
    .filter((id): id is string => id !== null);
}

/**
 * Only meaningful *after* the owning Dish's cascade delete has already run
 * (inside the same transaction) — only then does the reference count
 * reflect reality, since an ImageAsset shared with a surviving Version on a
 * *different* Dish (this owner's duplicate, or another account's accepted
 * copy, §D.2a) must correctly come back non-zero and be left alone.
 */
async function deleteOrphanedImageAssets(
  tx: Prisma.TransactionClient,
  imageAssetIds: string[],
): Promise<string[]> {
  const keys: string[] = [];
  for (const imageAssetId of imageAssetIds) {
    const storageKey = await deleteImageAssetIfOrphaned(tx, imageAssetId);
    if (storageKey) keys.push(storageKey);
  }
  return keys;
}

/**
 * Permanent Recipe deletion (ARCHITECTURE_PROPOSAL.md §I/§H.1/§J's "Recipe"
 * row): one transaction — a Recipe is never a PartLink target (§D.6), so it
 * never needs the two-phase current-usage-resolution/materialization flow
 * `deletePart` below implements; the ordinary cascade is always safe.
 */
async function deleteRecipe(ownerId: string, dishId: string): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, "RECIPE");
  const referencedImageAssetIds = await collectReferencedImageAssetIds(dish.id);

  const orphanedStorageKeys = await prisma.$transaction(async (tx) => {
    await revokeSharesAndCancelPendingShares(tx, dish.id);
    await tx.dish.delete({ where: { id: dish.id } });
    return deleteOrphanedImageAssets(tx, referencedImageAssetIds);
  });

  // Best-effort, after-commit external side effect (Arch §I) — never
  // allowed to roll back the already-committed deletion above.
  await Promise.all(
    orphanedStorageKeys.map((key) => bestEffortDeleteBlob(key)),
  );
}

/**
 * Public delete entry point for both kinds — dispatches to the appropriate
 * deletion model rather than exposing two differently-named actions.
 * `deletePart` (below) is the settled two-phase model (Build Plan Review
 * Gate 3): it aborts cleanly if any *current* usage still exists, leaving
 * the caller to resolve them via `resolvePartUsageOccurrence` first.
 */
export async function deleteDish(
  ownerId: string,
  dishId: string,
  kind?: DishKindValue,
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  if (dish.kind === "PART") {
    return deletePart(ownerId, dish.id);
  }
  return deleteRecipe(ownerId, dish.id);
}

// Slice 6 post-gate, PRODUCT_SPEC.md §74.2/§74.3, ARCHITECTURE_PROPOSAL.md
// §I's "Delete a referenced Part" row: the two-phase deletion model.
// Phase 1 (`resolvePartUsageOccurrence`) resolves one current usage at a
// time, each its own material-Version transaction on the affected
// container, exactly like every other content-changing save in this file.
// Phase 2 (`deletePart`, above the dispatcher) is the single final
// transaction: re-query, abort if any current usage remains, materialize
// every remaining (necessarily historical) LIVE reference, then delete.

function nextTopLevelPosition(
  sections: SectionInput[],
  topLevelPartLinks: PartLinkInput[],
): number {
  const positions = [
    ...sections.map((section) => section.position),
    ...topLevelPartLinks.map((link) => link.position),
  ];
  return positions.length === 0 ? 0 : Math.max(...positions) + 1;
}

/**
 * Splices shallow-detached content (`resolvePartVersionForDetach`'s
 * result) into the container's own TOP-LEVEL sequence — new Sections and
 * new top-level PartLinks are appended, assigned fresh positions
 * continuing the unified sequence, in the same relative order they had
 * inside the detached content itself.
 */
function appendDetachedTopLevel(
  sections: SectionInput[],
  topLevelPartLinks: PartLinkInput[],
  detached: { sections: SectionInput[]; partLinks: PartLinkInput[] },
): { sections: SectionInput[]; partLinks: PartLinkInput[] } {
  let nextPosition = nextTopLevelPosition(sections, topLevelPartLinks);
  const merged = [
    ...detached.sections.map((item) => ({ kind: "section" as const, item })),
    ...detached.partLinks.map((item) => ({ kind: "partLink" as const, item })),
  ].sort((a, b) => a.item.position - b.item.position);

  const newSections: SectionInput[] = [];
  const newPartLinks: PartLinkInput[] = [];
  for (const entry of merged) {
    if (entry.kind === "section") {
      newSections.push({ ...entry.item, position: nextPosition++ });
    } else {
      newPartLinks.push({ ...entry.item, position: nextPosition++ });
    }
  }
  return {
    sections: [...sections, ...newSections],
    partLinks: [...topLevelPartLinks, ...newPartLinks],
  };
}

/**
 * Splices shallow-detached content into ONE existing Section, flattened —
 * matching `SectionFields`'s own client-side Section-nested detach
 * behavior (this schema has no Section-in-Section nesting, so a whole
 * extracted Part's structure collapses into the one Section it was
 * attached to).
 */
function spliceDetachedIntoSection(
  section: SectionInput,
  detached: { sections: SectionInput[]; partLinks: PartLinkInput[] },
): SectionInput {
  const newPartLinks = [
    ...detached.sections.flatMap(
      (detachedSection) => detachedSection.partLinks,
    ),
    ...detached.partLinks,
  ].map((link, index) => ({
    ...link,
    position: section.partLinks.length + index,
  }));
  return {
    ...section,
    ingredients: [
      ...section.ingredients,
      ...detached.sections.flatMap(
        (detachedSection) => detachedSection.ingredients,
      ),
    ],
    instructions: [
      ...section.instructions,
      ...detached.sections.flatMap(
        (detachedSection) => detachedSection.instructions,
      ),
    ],
    partLinks: [...section.partLinks, ...newPartLinks],
  };
}

/**
 * Phase 1: resolves exactly ONE current usage occurrence (identified by its
 * stable `lineageId`, matching every other occurrence-scoped Slice 6
 * operation) — detach, replace, or remove, each its own material-Version
 * transaction on the affected container (PRODUCT_SPEC.md §74.2: "create
 * new Versions for changed current items"). Users may resolve occurrences
 * incrementally, in any order, across separate calls — one call's failure
 * never affects a resolution already completed for a different container.
 *
 * Slice 6 correction pass §1: every resolution is a material change to the
 * container's cooking content (a PartLink add/remove/retarget always trips
 * `diffVersionContent`'s `cookingChanged`, same as any other), so it reuses
 * the same explicit minor/major choice `editDish` requires for a cooking
 * change — never an automatic MINOR. `base` is always the container's own
 * *current* Version, so (matching `propagateToOneContainer`'s reasoning)
 * both a MINOR and a MAJOR bump from it always stay current.
 */
export async function resolvePartUsageOccurrence(
  ownerId: string,
  partDishId: string,
  containerDishId: string,
  lineageId: string,
  resolution: PartUsageResolutionValue,
  versionChoice: VersionChoiceValue,
  replacement?: { targetDishId: string; targetDishVersionId: string },
): Promise<{ containerDishId: string; newVersionId: string }> {
  const partDish = await getOwnedDishOrThrow(ownerId, partDishId, "PART");
  const container = await getOwnedDishOrThrow(ownerId, containerDishId);
  if (!container.currentVersionId) {
    throw new NotFoundError("This item has no saved content.");
  }
  const base = await getDishScopedVersionContentForReuseOrThrow(
    container.id,
    container.currentVersionId,
  );
  // Code-audit fidelity fix: this resolution only ever targets one LIVE
  // occurrence (a MATERIALIZED one has no live target to detach/replace/
  // remove), so everything below runs against a LIVE-only view exactly as
  // before — but any unrelated MATERIALIZED occurrence elsewhere in this
  // container's content is set aside here and merged back in
  // (`removeEmptySectionsPreservingMaterialized`/`mergeMaterializedBack`)
  // rather than silently dropped when this container's new Version is
  // written.
  const { sections: allSections, partLinks: allTopLevel } =
    versionContentToInsertableInput(base.sections, base.partLinks);
  const {
    liveSections: sections,
    liveTopLevel: partLinks,
    materializedBySectionLineage,
    materializedTopLevel,
  } = splitLiveAndMaterialized(allSections, allTopLevel);

  const isThisOccurrence = (link: PartLinkInput) =>
    link.lineageId === lineageId && link.targetDishId === partDish.id;

  const topLevelIndex = partLinks.findIndex(isThisOccurrence);
  const sectionIndex =
    topLevelIndex === -1
      ? sections.findIndex((section) =>
          section.partLinks.some(isThisOccurrence),
        )
      : -1;

  if (topLevelIndex === -1 && sectionIndex === -1) {
    throw new NotFoundError(
      "This occurrence is no longer present in the current version.",
    );
  }

  const occurrence =
    topLevelIndex !== -1
      ? partLinks[topLevelIndex]
      : sections[sectionIndex].partLinks.find(isThisOccurrence)!;

  const partTitle = partDish.currentTitle ?? "this Part";
  let updatedTopLevel = partLinks;
  let updatedSections = sections;
  let actionNote: string;

  if (resolution === "REMOVE") {
    if (topLevelIndex !== -1) {
      updatedTopLevel = partLinks.filter((_, index) => index !== topLevelIndex);
    } else {
      updatedSections = sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              partLinks: section.partLinks.filter(
                (link) => !isThisOccurrence(link),
              ),
            }
          : section,
      );
    }
    actionNote = `Removed ${partTitle} (being deleted).`;
  } else if (resolution === "REPLACE") {
    if (!replacement) {
      throw new ValidationError(
        "Choose a Part to replace this occurrence with.",
      );
    }
    await assertValidPartLinkTargets(prisma, ownerId, [replacement]);
    const replaceOccurrence = (link: PartLinkInput): PartLinkInput =>
      isThisOccurrence(link)
        ? {
            ...link,
            targetDishId: replacement.targetDishId,
            targetDishVersionId: replacement.targetDishVersionId,
          }
        : link;
    if (topLevelIndex !== -1) {
      updatedTopLevel = partLinks.map(replaceOccurrence);
    } else {
      updatedSections = sections.map((section, index) =>
        index === sectionIndex
          ? { ...section, partLinks: section.partLinks.map(replaceOccurrence) }
          : section,
      );
    }
    if (findDuplicatePartTargets(updatedSections, updatedTopLevel).length > 0) {
      throw new ValidationError(
        "That Part is already linked elsewhere in this item — choose a different Part.",
      );
    }
    actionNote = `Replaced ${partTitle} (being deleted).`;
  } else {
    // DETACH — PRODUCT_SPEC.md §70.1/§74.2, with the occurrence's own
    // multiplier applied to the localized quantities (PartLink multiplier
    // requirements: "detachment applies it to localized quantities").
    const detached = await resolvePartVersionForDetach(
      ownerId,
      occurrence.targetDishVersionId,
      occurrence.multiplier,
    );
    if (topLevelIndex !== -1) {
      const withoutOccurrence = partLinks.filter(
        (_, index) => index !== topLevelIndex,
      );
      const appended = appendDetachedTopLevel(
        sections,
        withoutOccurrence,
        detached,
      );
      updatedSections = appended.sections;
      updatedTopLevel = appended.partLinks;
    } else {
      updatedSections = sections.map((section, index) =>
        index === sectionIndex
          ? spliceDetachedIntoSection(
              {
                ...section,
                partLinks: section.partLinks.filter(
                  (link) => !isThisOccurrence(link),
                ),
              },
              detached,
            )
          : section,
      );
    }
    actionNote = `Detached ${partTitle} (being deleted).`;
  }

  const sanitizedSections = removeEmptySectionsPreservingMaterialized(
    updatedSections,
    materializedBySectionLineage,
  );
  if (!hasMinimumContent(sanitizedSections, updatedTopLevel)) {
    throw new ValidationError(
      "Resolving this occurrence would leave the item with no content — detach or replace instead of removing.",
    );
  }

  return withVersionAllocation(async (tx) => {
    if (container.kind === "PART") {
      await assertNoPartCycle(
        tx,
        container.id,
        collectPartLinkEdges(sanitizedSections, updatedTopLevel),
      );
    }

    const { majorVersion, minorVersion } = await nextVersionNumbers(
      tx,
      container.id,
      base.majorVersion,
      versionChoice,
    );

    const version = await tx.dishVersion.create({
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
        ...copyNutritionColumns(base),
        sourceVersionId: base.id,
        versionNote: `${versionLabel(base.majorVersion, base.minorVersion)} → ${versionLabel(majorVersion, minorVersion)}:\n${actionNote}`,
      },
    });

    const { sections: finalSections, partLinks: finalTopLevel } =
      mergeMaterializedBack(
        sanitizedSections,
        updatedTopLevel,
        materializedBySectionLineage,
        materializedTopLevel,
      );
    const { sectionNames, partLinkTargetDishIds } = await insertSections(
      tx,
      version.id,
      finalSections,
      finalTopLevel,
      { mintFreshLineage: false },
    );

    // Always current — `base` is always the container's own current
    // Version (loaded via `container.currentVersionId` above), same
    // reasoning as `propagateToOneContainer`.
    await tx.dish.update({
      where: { id: container.id },
      data: {
        currentVersionId: version.id,
        currentStructuralSearchText: await structuralSearchTextFor(
          tx,
          sectionNames,
          partLinkTargetDishIds,
        ),
      },
    });

    return { containerDishId: container.id, newVersionId: version.id };
  });
}

/**
 * Resolves a target Version's shallow content into a JSON-serializable
 * snapshot for materialization — the same shallow resolution
 * `resolvePartVersionForDetach` uses, but without lineage-stripping (a
 * materialized snapshot is frozen history, never editable local content)
 * and passed through a JSON round-trip so it's a plain `Prisma.
 * InputJsonValue`, never a value carrying `undefined`s Prisma's Json
 * column would reject.
 */
async function resolveMaterializedSnapshot(
  tx: Prisma.TransactionClient,
  targetDishVersionId: string,
): Promise<{
  content: Prisma.InputJsonValue;
  versionLabelText: string;
}> {
  const version = await tx.dishVersion.findUniqueOrThrow({
    where: { id: targetDishVersionId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentIncludeAllStates,
    },
  });
  // Code-audit fidelity fix: this Part's own current content can already
  // hold a MATERIALIZED occurrence from an earlier, unrelated deletion (a
  // second-level Part-in-Part chain) — preserved verbatim into the new
  // frozen snapshot rather than silently dropped.
  const content = versionContentToInsertableInput(
    version.sections,
    version.partLinks,
  );
  return {
    content: JSON.parse(JSON.stringify(content)) as Prisma.InputJsonValue,
    versionLabelText: versionLabel(version.majorVersion, version.minorVersion),
  };
}

/**
 * Phase 2: the final deletion transaction (PRODUCT_SPEC.md §74.3/§74.5,
 * ARCHITECTURE_PROPOSAL.md §I's "Delete a referenced Part" row, §H's
 * materialization table). Re-queries every remaining `LIVE` `PartLink`
 * referencing this Part; aborts cleanly if any of them is a *current*
 * usage (Phase 1 wasn't completed for it) — every survivor at this point
 * is therefore historical by construction, and gets converted in place to
 * a frozen `MATERIALIZED` snapshot (the CHECK constraint on `linkState`,
 * schema.prisma §D.6, is the database's own backstop that a row can never
 * carry both live and materialized fields). Only then is the stable Part
 * (and, via cascade, its own Versions/Sections/standalone Cooking-Session
 * history) actually deleted, alongside the same share-revocation step
 * `deleteRecipe` performs (Arch §I: a Part is shareable exactly like a
 * Recipe).
 */
async function deletePart(ownerId: string, partDishId: string): Promise<void> {
  const partDish = await getOwnedDishOrThrow(ownerId, partDishId, "PART");
  const partTitle = partDish.currentTitle ?? "Untitled Part";
  const referencedImageAssetIds = await collectReferencedImageAssetIds(
    partDish.id,
  );

  const orphanedStorageKeys = await prisma.$transaction(async (tx) => {
    // Step 1: re-query all remaining references.
    const liveLinks = await tx.partLink.findMany({
      where: { targetDishId: partDish.id, linkState: "LIVE" },
      select: {
        id: true,
        containerVersionId: true,
        targetDishVersionId: true,
        containerVersion: {
          select: { dish: { select: { currentVersionId: true } } },
        },
      },
    });

    // Step 2: abort cleanly if any CURRENT live usage still exists.
    const currentUsages = liveLinks.filter(
      (link) =>
        link.containerVersion.dish.currentVersionId === link.containerVersionId,
    );
    if (currentUsages.length > 0) {
      throw new PartHasLiveUsagesError(
        `This Part still has ${currentUsages.length} current usage${
          currentUsages.length === 1 ? "" : "s"
        }. Resolve them first.`,
      );
    }

    // Step 3: convert every remaining (necessarily historical) LIVE link
    // into a static materialized snapshot of its exact pinned Part Version.
    for (const link of liveLinks) {
      const { content, versionLabelText } = await resolveMaterializedSnapshot(
        tx,
        link.targetDishVersionId!,
      );
      await tx.partLink.update({
        where: { id: link.id },
        data: {
          linkState: "MATERIALIZED",
          targetDishId: null,
          targetDishVersionId: null,
          materializedTitle: partTitle,
          materializedVersionLabel: versionLabelText,
          materializedContent: content,
        },
      });
    }

    // Steps 6-7: share revocation/cancellation, then the actual delete —
    // cascades this Part's own Versions/Sections/Ingredients/Instructions/
    // PartLinks and standalone Cooking-Session/Review/Rating history
    // (PRODUCT_SPEC.md §74.4), same mechanism `deleteRecipe` uses.
    await revokeSharesAndCancelPendingShares(tx, partDish.id);
    await tx.dish.delete({ where: { id: partDish.id } });

    return deleteOrphanedImageAssets(tx, referencedImageAssetIds);
  });

  // Step 8 (commit) already happened above; this best-effort external side
  // effect runs after, same posture as every other delete in this file.
  await Promise.all(
    orphanedStorageKeys.map((key) => bestEffortDeleteBlob(key)),
  );
}
