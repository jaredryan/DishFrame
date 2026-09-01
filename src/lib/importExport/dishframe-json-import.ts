import type {
  DishKindValue,
  IngredientInput,
  InstructionInput,
  MoreNutrientEntry,
  SectionInput,
  StageValue,
} from "@/lib/dishes/schema";
import { stageValues } from "@/lib/dishes/schema";
import { buildParseResult } from "@/lib/importExport/paste-parser";
import type { ArchiveImportDraft } from "@/lib/importExport/recipe-gallery-import";

/**
 * Import QA polish pass §1: DishFrame's own Recipe/Part JSON export
 * (`export-dto.ts#buildDishExportDto`, format `"dishframe.dish-export"`)
 * couldn't be imported back in — an Export → Import round trip is treated
 * as a bug fix, not a new feature. This is the client-side (no
 * `server-only`) sibling of `recipe-gallery-import.ts`: it recognizes and
 * normalizes that exact export shape into the same `ArchiveImportDraft[]`
 * representation the `.rga` adapter produces, so it flows through the
 * identical review/select/classify/import list this file's caller already
 * has — no parallel save path.
 *
 * The literal format string is duplicated from `export-dto.ts`'s
 * `DISH_EXPORT_FORMAT` rather than imported — that module is `server-only`
 * and this one must run in the browser.
 *
 * Scope: only a single-item Dish export (`"dishframe.dish-export"`) is
 * recognized. An account backup (`"dishframe.account-export"`) is a
 * different, much larger shape (grocery lists, meal plans, cooking
 * history…) with no Recipe/Part review flow to normalize into — it's
 * rejected with a clear, specific message rather than silently
 * mis-parsed.
 *
 * Deliberately NOT preserved, because they aren't safely representable
 * through the ordinary review/confirm step:
 * - `partLinks`/`linkedParts` — reference another Dish/Version by id, which
 *   is only meaningful within the same account and only if that target
 *   still exists; validating that is out of scope here, so linked-Part
 *   occurrences are dropped (their ingredients/instructions, if any, are
 *   unaffected — DishFrame doesn't duplicate a linked Part's content
 *   into the section that links it).
 * - `activePublications`, ratings/evidence, cooking-session history — not
 *   part of `dishContentSchema` at all; re-importing a Dish must never
 *   silently resurrect a publication or cooking history.
 * - `imageAssetId` — an internal DishFrame reference (see `export-dto.ts`'s
 *   own comment); only meaningful if the importing account still owns that
 *   exact asset, which can't be verified here, so it's dropped rather than
 *   risking a dangling/wrong-owner reference.
 */
const DISH_EXPORT_FORMAT = "dishframe.dish-export";
const ACCOUNT_EXPORT_FORMAT = "dishframe.account-export";

export type DishframeJsonImportResult =
  | { status: "success"; drafts: ArchiveImportDraft[] }
  | { status: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function countLinkedParts(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function normalizeIngredient(raw: unknown): IngredientInput | null {
  if (!isRecord(raw)) return null;
  const name = asString(raw.name);
  if (!name || !name.trim()) return null;

  const substituteRaw = isRecord(raw.substitute) ? raw.substitute : null;
  const substituteName = substituteRaw ? asString(substituteRaw.name) : null;

  return {
    name,
    quantity: asNullableNumber(raw.quantity),
    quantityEnd: asNullableNumber(raw.quantityEnd),
    isApproximate: raw.isApproximate === true,
    unit: asNullableString(raw.unit),
    displayText: asNullableString(raw.displayText),
    preparationNote: asNullableString(raw.preparationNote),
    isOptional: raw.isOptional === true,
    originalImportedText: asNullableString(raw.originalImportedText),
    substitute:
      substituteRaw && substituteName
        ? {
            name: substituteName,
            quantity: asNullableNumber(substituteRaw.quantity),
            quantityEnd: asNullableNumber(substituteRaw.quantityEnd),
            isApproximate: substituteRaw.isApproximate === true,
            unit: asNullableString(substituteRaw.unit),
            displayText: asNullableString(substituteRaw.displayText),
            preparationNote: asNullableString(substituteRaw.preparationNote),
          }
        : null,
  };
}

function normalizeInstruction(raw: unknown): InstructionInput | null {
  if (!isRecord(raw)) return null;
  const text = asString(raw.text);
  if (!text || !text.trim()) return null;
  return { text };
}

function normalizeSection(raw: unknown, position: number): SectionInput | null {
  if (!isRecord(raw)) return null;
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients
        .map(normalizeIngredient)
        .filter((i): i is IngredientInput => i !== null)
    : [];
  const instructions = Array.isArray(raw.instructions)
    ? raw.instructions
        .map(normalizeInstruction)
        .filter((i): i is InstructionInput => i !== null)
    : [];
  return {
    name: asNullableString(raw.name),
    guidanceNote: asNullableString(raw.guidanceNote),
    ingredients,
    instructions,
    partLinks: [],
    position,
  };
}

function pickImportVersion(versions: unknown): Record<string, unknown> | null {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  // `versionContentDto` carries no version id (ids aren't portable across a
  // restore — see `export-dto.ts`'s `DishPublicationDto` comment), so for a
  // "versionMode: ALL" export there's no way to re-correlate the dish's own
  // `currentVersionId` back to one array entry by id. `versions` is always
  // ordered ascending by (majorVersion, minorVersion) — the last entry is
  // the most recent, a reasonable stand-in for "current" either way (and
  // for the far more common "versionMode: SINGLE" export, it's the only
  // entry).
  const last = versions[versions.length - 1];
  return isRecord(last) ? last : null;
}

function normalizeStage(value: unknown): StageValue {
  return typeof value === "string" &&
    (stageValues as readonly string[]).includes(value)
    ? (value as StageValue)
    : "IDEA";
}

export function normalizeDishExportJson(
  json: unknown,
): DishframeJsonImportResult {
  if (!isRecord(json)) {
    return {
      status: "error",
      message: "That file doesn't look like a DishFrame export.",
    };
  }

  if (json.format === ACCOUNT_EXPORT_FORMAT) {
    return {
      status: "error",
      message:
        "That's a DishFrame account backup, not a single Recipe/Part export — account backups aren't supported for import.",
    };
  }

  if (json.format !== DISH_EXPORT_FORMAT) {
    return {
      status: "error",
      message: "That file doesn't look like a DishFrame Recipe/Part export.",
    };
  }

  const dishKind: DishKindValue = json.kind === "PART" ? "PART" : "RECIPE";
  const title = asString(json.title) ?? "";

  const version = pickImportVersion(json.versions);
  if (!version) {
    return {
      status: "error",
      message: "That DishFrame export has no Recipe/Part content to import.",
    };
  }

  const sourceSections = Array.isArray(version.sections)
    ? version.sections
    : [];
  const sections = sourceSections
    .map((section, index) => normalizeSection(section, index))
    .filter((section): section is SectionInput => section !== null);

  // Follow-up: linked Parts are dropped (see this module's doc comment for
  // why) — counted here, from the *raw* source sections (not the
  // normalized ones, which never carry `linkedParts` at all), purely so
  // the review UI can tell the user this structural loss happened before
  // they commit the import.
  const droppedLinkedPartsCount =
    sourceSections.reduce(
      (sum, section) =>
        sum + (isRecord(section) ? countLinkedParts(section.linkedParts) : 0),
      0,
    ) + countLinkedParts(version.topLevelLinkedParts);

  const nutrition = isRecord(version.nutrition) ? version.nutrition : {};
  const moreNutrients = Array.isArray(nutrition.moreNutrients)
    ? (nutrition.moreNutrients as MoreNutrientEntry[])
    : null;

  const needsReview: string[] = [];
  const result = buildParseResult(
    {
      title: asString(version.title) ?? title,
      description: asNullableString(version.description) ?? undefined,
      cuisine: asNullableString(json.cuisine) ?? undefined,
      yieldQuantity: asNullableNumber(version.yieldQuantity) ?? undefined,
      yieldUnit: asNullableString(version.yieldUnit) ?? undefined,
      prepTimeMinutes: asNullableNumber(version.prepTimeMinutes) ?? undefined,
      cookTimeMinutes: asNullableNumber(version.cookTimeMinutes) ?? undefined,
      calories: asNullableNumber(nutrition.calories) ?? undefined,
      protein: asNullableNumber(nutrition.protein) ?? undefined,
      carbs: asNullableNumber(nutrition.carbs) ?? undefined,
      fat: asNullableNumber(nutrition.fat) ?? undefined,
      nutritionBasis:
        nutrition.basis === "WHOLE" || nutrition.basis === "PER_OUTPUT_UNIT"
          ? nutrition.basis
          : undefined,
      nutritionBasisQuantity:
        asNullableNumber(nutrition.basisQuantity) ?? undefined,
      nutritionBasisUnit: asNullableString(nutrition.basisUnit) ?? undefined,
    },
    // `buildParseResult` expects `WorkingSection[]`, but a DishFrame export's
    // sections are already fully-structured `SectionInput`s (no free-text
    // re-parsing needed) — wrapped as single-section "working" shapes would
    // lose the exact ingredient/instruction objects already normalized
    // above, so this adapter builds the result directly instead of routing
    // through `buildParseResult`'s section-filtering path. See below.
    [],
    needsReview,
  );

  // `buildParseResult` above only establishes the scalar/top-level fields
  // (title, cuisine, nutrition, …) with its own IDEA/null defaults; the
  // already-normalized `sections` built from the export's real content
  // replace its own (empty, since `[]` was passed in) section list —
  // exactly one Version's worth of Recipe/Part content, this module's own
  // job, not a second copy of `buildParseResult`'s section-shaping.
  result.values.sections = sections.length ? sections : result.values.sections;
  result.values.stage = normalizeStage(json.stage);
  result.values.moreNutrients = moreNutrients;
  result.values.difficulty = asNullableString(version.difficulty);

  const draft: ArchiveImportDraft = {
    status: "ok",
    sourceRef: `dishframe-json:${title || "untitled"}`,
    result,
    sourceCategory: null,
    sourceDishKind: dishKind,
    presetTags: asStringArray(json.tags),
    presetFlavorProfiles: asStringArray(json.flavorProfiles),
    droppedLinkedPartsCount,
  };

  return { status: "success", drafts: [draft] };
}
