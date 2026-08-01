import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel } from "@/lib/dishes/version-note";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * ARCHITECTURE_PROPOSAL.md §L/§M.5: explicit field-whitelisting DTO
 * builders, one per aggregate — every function below constructs its output
 * object with named properties only, never `{ ...row }`, so a
 * password/session/token field accidentally added to an underlying query
 * (or even to the raw row type itself) cannot reach an export payload by
 * construction. `paste-parser`'s sibling stage of the import pipeline; this
 * is the export side of the same `importExport` module
 * (PRODUCT_SPEC.md §55).
 *
 * Deliberately excludes `ShareLink`/`DirectShare`: no sharing creation
 * service or UI exists anywhere in this codebase yet (Tier 2, Slice 16) —
 * the same reasoning `src/app/api/images/[assetId]/route.ts` already
 * documents for its own share-token branch. Flagged here for the same
 * reason: Slice 16 should add a sharing section to `buildAccountBackupDto`
 * (§55.1's "sharing and publication configuration where relevant"), not
 * discover it's missing.
 */

export const exportTierValues = [
  "STANDARD",
  "DETAILED",
  "FULL_PRIVATE_HISTORY",
] as const;
export type ExportTierValue = (typeof exportTierValues)[number];

// Slice 11 correction pass: stable top-level envelope (`format`,
// `formatVersion`, `exportedAt`) on every export payload — see
// docs/SLICE_11.md's correction section. `formatVersion` starts at 1;
// bump it if the payload shape changes in a way a future importer would
// need to distinguish.
const DISH_EXPORT_FORMAT = "dishframe.dish-export";
const ACCOUNT_EXPORT_FORMAT = "dishframe.account-export";
const CURRENT_EXPORT_FORMAT_VERSION = 1;

export const versionModeValues = ["SINGLE", "ALL"] as const;
export type VersionModeValue = (typeof versionModeValues)[number];

/** SINGLE with no `versionId` resolves to the Dish's current Version. */
export type DishVersionSelection =
  { mode: "SINGLE"; versionId?: string } | { mode: "ALL" };

/**
 * Title-derived filenames must never let a user-controlled title inject
 * response-header content (CRLF, quotes) into `Content-Disposition`. Only
 * alphanumerics, spaces, `.`, and `-` survive; anything else becomes `_`.
 */
export function sanitizeExportFilename(title: string | null | undefined) {
  const base = (title ?? "").replace(/[^a-z0-9.\- ]/gi, "_").trim();
  const safe = base.length > 0 ? base.slice(0, 150) : "export";
  return `${safe}.json`;
}

// ---------------------------------------------------------------------------
// Shared Recipe/Part content shaping (Section/Ingredient/Instruction/PartLink)
// ---------------------------------------------------------------------------

const versionContentInclude = {
  sections: {
    orderBy: { position: "asc" as const },
    include: {
      ingredients: {
        orderBy: { position: "asc" as const },
        include: { substitute: true },
      },
      instructions: { orderBy: { position: "asc" as const } },
    },
  },
  partLinks: {
    where: { linkState: "LIVE" as const },
    orderBy: { position: "asc" as const },
    select: {
      sectionId: true,
      position: true,
      multiplier: true,
      targetDishId: true,
      targetDishVersionId: true,
    },
  },
} as const;

type ExportIngredientRow = {
  name: string;
  quantity: unknown;
  quantityEnd: unknown;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  preparationNote: string | null;
  isOptional: boolean;
  originalImportedText: string | null;
  substituteForIngredientId: string | null;
  substitute: {
    name: string;
    quantity: unknown;
    quantityEnd: unknown;
    isApproximate: boolean;
    unit: string | null;
    displayText: string | null;
    preparationNote: string | null;
  } | null;
};

export function ingredientDto(ingredient: ExportIngredientRow) {
  return {
    name: ingredient.name,
    quantity: decimalToNumber(ingredient.quantity as never),
    quantityEnd: decimalToNumber(ingredient.quantityEnd as never),
    isApproximate: ingredient.isApproximate,
    unit: ingredient.unit,
    displayText: ingredient.displayText,
    preparationNote: ingredient.preparationNote,
    isOptional: ingredient.isOptional,
    originalImportedText: ingredient.originalImportedText,
    substitute: ingredient.substitute
      ? {
          name: ingredient.substitute.name,
          quantity: decimalToNumber(ingredient.substitute.quantity as never),
          quantityEnd: decimalToNumber(
            ingredient.substitute.quantityEnd as never,
          ),
          isApproximate: ingredient.substitute.isApproximate,
          unit: ingredient.substitute.unit,
          displayText: ingredient.substitute.displayText,
          preparationNote: ingredient.substitute.preparationNote,
        }
      : null,
  };
}

type ExportVersionRow = {
  id: string;
  majorVersion: number;
  minorVersion: number;
  title: string;
  description: string | null;
  yieldQuantity: unknown;
  yieldUnit: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  difficulty: string | null;
  calories: unknown;
  protein: unknown;
  carbs: unknown;
  fat: unknown;
  nutritionBasis: string | null;
  nutritionBasisQuantity: unknown;
  nutritionBasisUnit: string | null;
  moreNutrients: unknown;
  nutritionSourceProvider: string | null;
  nutritionSourceId: string | null;
  versionNote: string | null;
  createdAt: Date;
  imageAssetId: string | null;
  sections: Array<{
    id: string;
    name: string | null;
    guidanceNote: string | null;
    position: number;
    ingredients: ExportIngredientRow[];
    instructions: Array<{ text: string; position: number }>;
  }>;
  partLinks: Array<{
    sectionId: string | null;
    position: number;
    multiplier: unknown;
    targetDishId: string | null;
    targetDishVersionId: string | null;
  }>;
};

/**
 * §57.1: structured formats use "yield", not the friendlier UI wording.
 * `imageAssetId` is an internal DishFrame reference only — not
 * independently portable, and the image binary itself is never included in
 * this export (docs/SLICE_11.md correction section). The owner's own
 * signed-in account can still resolve it via the authenticated
 * `/api/images/[assetId]` route; the Blob `storageKey` itself is never
 * included (that's the one thing standing between "private" and a
 * directly-fetchable file, per `images/service.ts`'s own model comment).
 */
export function versionContentDto(version: ExportVersionRow) {
  return {
    versionLabel: versionLabel(version.majorVersion, version.minorVersion),
    title: version.title,
    description: version.description,
    yieldQuantity: decimalToNumber(version.yieldQuantity as never),
    yieldUnit: version.yieldUnit,
    prepTimeMinutes: version.prepTimeMinutes,
    cookTimeMinutes: version.cookTimeMinutes,
    difficulty: version.difficulty,
    nutrition: {
      calories: decimalToNumber(version.calories as never),
      protein: decimalToNumber(version.protein as never),
      carbs: decimalToNumber(version.carbs as never),
      fat: decimalToNumber(version.fat as never),
      basis: version.nutritionBasis,
      basisQuantity: decimalToNumber(version.nutritionBasisQuantity as never),
      basisUnit: version.nutritionBasisUnit,
      moreNutrients: version.moreNutrients,
      sourceProvider: version.nutritionSourceProvider,
      sourceId: version.nutritionSourceId,
    },
    imageAssetId: version.imageAssetId,
    versionNote: version.versionNote,
    createdAt: version.createdAt,
    sections: version.sections.map((section) => ({
      name: section.name,
      guidanceNote: section.guidanceNote,
      position: section.position,
      ingredients: section.ingredients
        .filter((i) => i.substituteForIngredientId === null)
        .map(ingredientDto),
      instructions: section.instructions.map((i) => ({
        text: i.text,
        position: i.position,
      })),
      linkedParts: version.partLinks
        .filter((link) => link.sectionId === section.id)
        .map((link) => ({
          targetDishId: link.targetDishId,
          targetDishVersionId: link.targetDishVersionId,
          multiplier: decimalToNumber(link.multiplier as never),
          position: link.position,
        })),
    })),
    topLevelLinkedParts: version.partLinks
      .filter((link) => link.sectionId === null)
      .map((link) => ({
        targetDishId: link.targetDishId,
        targetDishVersionId: link.targetDishVersionId,
        multiplier: decimalToNumber(link.multiplier as never),
        position: link.position,
      })),
  };
}

// ---------------------------------------------------------------------------
// Item export (§55.2-§55.6) — one Recipe or Part, tiered privacy
// ---------------------------------------------------------------------------

async function ratingRowsForDish(dishId: string, versionId?: string) {
  return prisma.rating.findMany({
    where: { dishId, ...(versionId ? { dishVersionId: versionId } : {}) },
    orderBy: { createdAt: "asc" },
    select: {
      value: true,
      sessionId: true,
      tasterId: true,
      dishVersionId: true,
      dishVersion: { select: { majorVersion: true, minorVersion: true } },
      session: { select: { startedAt: true, endedAt: true, state: true } },
    },
  });
}

/** Stable per-export ordinal labels ("Taster 1", "Taster 2", …) — §55.4's
 * "Taster names remain anonymized unless separately and explicitly
 * enabled," which no such toggle exists for yet, so the detailed tier is
 * always anonymized. */
function anonymizedTasterLabels(
  ratings: Array<{ tasterId: string }>,
): Map<string, string> {
  const labels = new Map<string, string>();
  let next = 1;
  for (const rating of ratings) {
    if (!labels.has(rating.tasterId)) {
      labels.set(rating.tasterId, `Taster ${next}`);
      next += 1;
    }
  }
  return labels;
}

async function buildDetailedEvidence(dishId: string, versionId?: string) {
  const ratings = await ratingRowsForDish(dishId, versionId);
  const tasterLabels = anonymizedTasterLabels(ratings);
  return {
    individualRatings: ratings.map((r) => ({
      value: r.value,
      taster: tasterLabels.get(r.tasterId)!,
      sessionId: r.sessionId,
      versionLabel: r.dishVersion
        ? versionLabel(r.dishVersion.majorVersion, r.dishVersion.minorVersion)
        : null,
      sessionOutcome: r.session.state,
      sessionEndedAt: r.session.endedAt,
    })),
  };
}

async function buildFullPrivateHistory(
  ownerId: string,
  dishId: string,
  versionId?: string,
) {
  const ratings = await ratingRowsForDish(dishId);
  const sessions = await prisma.cookingSession.findMany({
    where: {
      ownerId,
      dishId,
      ...(versionId ? { dishVersionId: versionId } : {}),
    },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      state: true,
      startedAt: true,
      endedAt: true,
      adjustedDurationSeconds: true,
      cookingNotes: true,
      dishVersion: { select: { majorVersion: true, minorVersion: true } },
      review: {
        select: {
          whatWentWell: true,
          whatDidNotGoWell: true,
          anythingElse: true,
          actualAmountQuantity: true,
          actualAmountUnit: true,
          reviewAdjustedDurationSeconds: true,
        },
      },
    },
  });
  const ratingsBySession = new Map<string, typeof ratings>();
  for (const rating of ratings) {
    const list = ratingsBySession.get(rating.sessionId) ?? [];
    list.push(rating);
    ratingsBySession.set(rating.sessionId, list);
  }
  const tasterNames = new Map(
    (
      await prisma.taster.findMany({
        where: { ownerId },
        select: { id: true, name: true },
      })
    ).map((t) => [t.id, t.name] as const),
  );

  return {
    cookingSessions: sessions.map((session) => ({
      versionLabel: session.dishVersion
        ? versionLabel(
            session.dishVersion.majorVersion,
            session.dishVersion.minorVersion,
          )
        : null,
      state: session.state,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      adjustedDurationSeconds: session.adjustedDurationSeconds,
      cookingNotes: session.cookingNotes,
      review: session.review
        ? {
            whatWentWell: session.review.whatWentWell,
            whatDidNotGoWell: session.review.whatDidNotGoWell,
            anythingElse: session.review.anythingElse,
            actualAmountQuantity: decimalToNumber(
              session.review.actualAmountQuantity as never,
            ),
            actualAmountUnit: session.review.actualAmountUnit,
            reviewAdjustedDurationSeconds:
              session.review.reviewAdjustedDurationSeconds,
          }
        : null,
      ratings: (ratingsBySession.get(session.id) ?? []).map((r) => ({
        value: r.value,
        taster: tasterNames.get(r.tasterId) ?? "Deleted taster",
      })),
    })),
  };
}

/**
 * Slice 11 correction pass (docs/SLICE_11.md): individual export defaults
 * to the current Version only — full history is no longer implicit. Callers
 * choose `{ mode: "SINGLE" }` (current Version, the dialog's default),
 * `{ mode: "SINGLE", versionId }` (one explicit historical Version), or
 * `{ mode: "ALL" }`. Ratings/evidence are scoped to the exported Version(s)
 * only — a SINGLE export never surfaces another Version's evidence.
 */
export async function buildDishExportDto(
  ownerId: string,
  dishId: string,
  kind: DishKindValue,
  tier: ExportTierValue,
  versionSelection: DishVersionSelection = { mode: "SINGLE" },
) {
  const dish = await prisma.dish.findFirst({
    where: { id: dishId, ownerId, kind },
    select: {
      id: true,
      kind: true,
      stage: true,
      cuisine: true,
      currentTitle: true,
      currentVersionId: true,
      createdAt: true,
      updatedAt: true,
      tags: { select: { tag: { select: { displayName: true } } } },
      flavorProfiles: {
        select: { flavorProfileValue: { select: { displayName: true } } },
      },
      versions: {
        include: versionContentInclude,
        orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
      },
    },
  });
  if (!dish)
    throw new NotFoundError(
      kind === "PART" ? "Part not found." : "Recipe not found.",
    );

  let selectedVersion: (typeof dish.versions)[number] | null = null;
  if (versionSelection.mode === "SINGLE") {
    const targetVersionId = versionSelection.versionId ?? dish.currentVersionId;
    selectedVersion =
      dish.versions.find((v) => v.id === targetVersionId) ?? null;
    if (!selectedVersion) throw new NotFoundError("Version not found.");
  }
  const versionFilterId = selectedVersion?.id;
  const exportedVersions = selectedVersion ? [selectedVersion] : dish.versions;

  const ratings = await ratingRowsForDish(dish.id, versionFilterId);
  const aggregateRating =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length
      : null;

  return {
    format: DISH_EXPORT_FORMAT,
    formatVersion: CURRENT_EXPORT_FORMAT_VERSION,
    exportedAt: new Date(),
    scope: {
      exportType: kind,
      tier,
      versionMode: versionSelection.mode,
      ...(selectedVersion
        ? {
            versionId: selectedVersion.id,
            versionLabel: versionLabel(
              selectedVersion.majorVersion,
              selectedVersion.minorVersion,
            ),
          }
        : {}),
    },
    kind: dish.kind,
    title: dish.currentTitle,
    stage: dish.stage,
    cuisine: dish.cuisine,
    tags: dish.tags.map((t) => t.tag.displayName),
    flavorProfiles: dish.flavorProfiles.map(
      (f) => f.flavorProfileValue.displayName,
    ),
    createdAt: dish.createdAt,
    updatedAt: dish.updatedAt,
    currentVersionId: dish.currentVersionId,
    versions: exportedVersions.map(versionContentDto),
    aggregateRating,
    ratingCount: ratings.length,
    ...(tier === "DETAILED" || tier === "FULL_PRIVATE_HISTORY"
      ? await buildDetailedEvidence(dish.id, versionFilterId)
      : {}),
    ...(tier === "FULL_PRIVATE_HISTORY"
      ? await buildFullPrivateHistory(ownerId, dish.id, versionFilterId)
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Full account backup (§55.1)
// ---------------------------------------------------------------------------

/**
 * Excludes, by never querying them at all: `User`/`Account`/`Session`/
 * `Verification` (passwords, provider credentials, active session tokens)
 * and `ShareLink`/`DirectShare` (raw share-link tokens — also not yet
 * reachable by any creation path, see this file's module doc comment).
 */
export async function buildAccountBackupDto(ownerId: string) {
  const dishes = await prisma.dish.findMany({
    where: { ownerId },
    select: {
      id: true,
      kind: true,
      stage: true,
      cuisine: true,
      currentTitle: true,
      defaultScale: true,
      sourceKind: true,
      sourceTitle: true,
      sourceDishVersionLabel: true,
      createdAt: true,
      updatedAt: true,
      tags: { select: { tag: { select: { displayName: true } } } },
      flavorProfiles: {
        select: { flavorProfileValue: { select: { displayName: true } } },
      },
      preferredUnitOverrides: {
        select: { ingredientLineageId: true, unit: true },
      },
      versions: {
        include: versionContentInclude,
        orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
      },
    },
  });

  const tasters = await prisma.taster.findMany({
    where: { ownerId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, isOwner: true, archivedAt: true },
  });

  const sessions = await prisma.cookingSession.findMany({
    where: { ownerId },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      dishId: true,
      dishVersionId: true,
      state: true,
      startedAt: true,
      endedAt: true,
      adjustedDurationSeconds: true,
      scaleFactor: true,
      cookingNotes: true,
      review: {
        select: {
          whatWentWell: true,
          whatDidNotGoWell: true,
          anythingElse: true,
          actualAmountQuantity: true,
          actualAmountUnit: true,
          reviewAdjustedDurationSeconds: true,
        },
      },
      ratings: {
        select: {
          value: true,
          tasterId: true,
          dishId: true,
          dishVersionId: true,
          dishTitleSnapshot: true,
          dishVersionLabelSnapshot: true,
        },
      },
    },
  });

  const groceryCategories = await prisma.groceryCategory.findMany({
    where: { ownerId },
    orderBy: { position: "asc" },
    select: { displayName: true, position: true, isFallback: true },
  });

  const groceryLists = await prisma.groceryList.findMany({
    where: { ownerId },
    orderBy: { createdAt: "asc" },
    select: {
      title: true,
      mode: true,
      completedAt: true,
      createdAt: true,
      sources: {
        select: {
          sourceDishTitleSnapshot: true,
          sourceDishKindSnapshot: true,
          sourceDishVersionLabelSnapshot: true,
          scaleFactor: true,
        },
      },
      items: {
        select: {
          name: true,
          quantityText: true,
          quantityDecimal: true,
          unit: true,
          isOptional: true,
          isManual: true,
          checkedAt: true,
          category: { select: { displayName: true } },
        },
      },
    },
  });

  const mealPlans = await prisma.mealPlan.findMany({
    where: { ownerId },
    orderBy: { startDate: "asc" },
    select: {
      title: true,
      startDate: true,
      endDate: true,
      notes: true,
      entries: {
        select: {
          cookDate: true,
          targetYieldQuantity: true,
          targetYieldUnit: true,
          note: true,
          status: true,
          sourceDishTitleSnapshot: true,
          sourceDishKindSnapshot: true,
          sourceDishVersionLabelSnapshot: true,
          plannedMeals: {
            select: { label: true, date: true, servings: true },
          },
        },
      },
    },
  });

  const preference = await prisma.userPreference.findUnique({
    where: { userId: ownerId },
    select: {
      measurementSystem: true,
      fractionOrDecimal: true,
      primaryRatingDisplay: true,
      timerSoundEnabled: true,
      reviewPromptEnabled: true,
    },
  });

  const tasterNameById = new Map(tasters.map((t) => [t.id, t.name] as const));

  return {
    format: ACCOUNT_EXPORT_FORMAT,
    formatVersion: CURRENT_EXPORT_FORMAT_VERSION,
    exportedAt: new Date(),
    scope: { exportType: "ACCOUNT" as const },
    preferences: preference
      ? {
          measurementSystem: preference.measurementSystem,
          fractionOrDecimal: preference.fractionOrDecimal,
          primaryRatingDisplay: preference.primaryRatingDisplay,
          timerSoundEnabled: preference.timerSoundEnabled,
          reviewPromptEnabled: preference.reviewPromptEnabled,
        }
      : null,
    tasters: tasters.map((t) => ({
      name: t.name,
      isOwner: t.isOwner,
      archived: t.archivedAt !== null,
    })),
    groceryCategories: groceryCategories.map((c) => ({
      name: c.displayName,
      position: c.position,
      isFallback: c.isFallback,
    })),
    dishes: dishes.map((dish) => ({
      kind: dish.kind,
      title: dish.currentTitle,
      stage: dish.stage,
      cuisine: dish.cuisine,
      defaultScale: decimalToNumber(dish.defaultScale as never),
      sourceKind: dish.sourceKind,
      sourceTitle: dish.sourceTitle,
      sourceDishVersionLabel: dish.sourceDishVersionLabel,
      tags: dish.tags.map((t) => t.tag.displayName),
      flavorProfiles: dish.flavorProfiles.map(
        (f) => f.flavorProfileValue.displayName,
      ),
      preferredUnitOverrides: dish.preferredUnitOverrides.map((o) => ({
        ingredientLineageId: o.ingredientLineageId,
        unit: o.unit,
      })),
      createdAt: dish.createdAt,
      updatedAt: dish.updatedAt,
      versions: dish.versions.map(versionContentDto),
    })),
    cookingSessions: sessions.map((session) => ({
      dishId: session.dishId,
      state: session.state,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      adjustedDurationSeconds: session.adjustedDurationSeconds,
      scaleFactor: decimalToNumber(session.scaleFactor as never),
      cookingNotes: session.cookingNotes,
      review: session.review
        ? {
            whatWentWell: session.review.whatWentWell,
            whatDidNotGoWell: session.review.whatDidNotGoWell,
            anythingElse: session.review.anythingElse,
            actualAmountQuantity: decimalToNumber(
              session.review.actualAmountQuantity as never,
            ),
            actualAmountUnit: session.review.actualAmountUnit,
            reviewAdjustedDurationSeconds:
              session.review.reviewAdjustedDurationSeconds,
          }
        : null,
      ratings: session.ratings.map((r) => ({
        value: r.value,
        taster: tasterNameById.get(r.tasterId) ?? "Deleted taster",
        dishTitleSnapshot: r.dishTitleSnapshot,
        dishVersionLabelSnapshot: r.dishVersionLabelSnapshot,
      })),
    })),
    groceryLists: groceryLists.map((list) => ({
      title: list.title,
      mode: list.mode,
      completedAt: list.completedAt,
      createdAt: list.createdAt,
      sources: list.sources.map((s) => ({
        title: s.sourceDishTitleSnapshot,
        kind: s.sourceDishKindSnapshot,
        versionLabel: s.sourceDishVersionLabelSnapshot,
        scaleFactor: decimalToNumber(s.scaleFactor as never),
      })),
      items: list.items.map((item) => ({
        name: item.name,
        quantityText: item.quantityText,
        quantityDecimal: decimalToNumber(item.quantityDecimal as never),
        unit: item.unit,
        isOptional: item.isOptional,
        isManual: item.isManual,
        checked: item.checkedAt !== null,
        category: item.category?.displayName ?? null,
      })),
    })),
    mealPlans: mealPlans.map((plan) => ({
      title: plan.title,
      startDate: plan.startDate,
      endDate: plan.endDate,
      notes: plan.notes,
      entries: plan.entries.map((entry) => ({
        cookDate: entry.cookDate,
        targetYieldQuantity: decimalToNumber(
          entry.targetYieldQuantity as never,
        ),
        targetYieldUnit: entry.targetYieldUnit,
        note: entry.note,
        status: entry.status,
        sourceDishTitle: entry.sourceDishTitleSnapshot,
        sourceDishKind: entry.sourceDishKindSnapshot,
        sourceDishVersionLabel: entry.sourceDishVersionLabelSnapshot,
        plannedMeals: entry.plannedMeals.map((meal) => ({
          label: meal.label,
          date: meal.date,
          servings: decimalToNumber(meal.servings as never),
        })),
      })),
    })),
  };
}
