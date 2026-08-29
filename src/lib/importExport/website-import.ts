import "server-only";
import { fetchHtmlSafely } from "@/lib/importExport/url-fetch";
import {
  buildParseResult,
  parseIngredientLine,
  type ImportFieldOverrides,
  type PasteParseResult,
  type WorkingSection,
} from "@/lib/importExport/paste-parser";

/**
 * PRODUCT_SPEC.md §57.2's "source information": the website-import
 * adapter. Its only job is fetching + extracting Schema.org Recipe
 * JSON-LD into the same `WorkingSection[]`/field-override shape every
 * other import source produces — `buildParseResult` (paste-parser.ts) is
 * what actually turns that into the `PasteParseResult` the review editor
 * consumes, so there is exactly one assembly step, not three.
 */

const GENERIC_FAILURE_MESSAGE =
  "Couldn't find a recipe on that page. Try copying the recipe text and using Paste text instead.";

export type WebsiteImportResult =
  | { status: "success"; result: PasteParseResult }
  | { status: "error"; message: string };

export async function proposeImportFromUrl(
  rawUrl: string,
): Promise<WebsiteImportResult> {
  const fetched = await fetchHtmlSafely(rawUrl);
  if (!fetched.ok) {
    return { status: "error", message: fetched.message };
  }

  const recipeNode = extractRecipeJsonLd(fetched.html);
  if (!recipeNode) {
    return { status: "error", message: GENERIC_FAILURE_MESSAGE };
  }

  const draft = mapSchemaOrgRecipe(recipeNode);
  if (!draft) {
    return { status: "error", message: GENERIC_FAILURE_MESSAGE };
  }

  return { status: "success", result: draft };
}

// ---------------------------------------------------------------------------
// JSON-LD extraction
// ---------------------------------------------------------------------------

const JSON_LD_SCRIPT =
  /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => HTML_ENTITIES[m]);
}

function isRecipeType(type: unknown): boolean {
  if (typeof type === "string") return type === "Recipe";
  if (Array.isArray(type)) return type.includes("Recipe");
  return false;
}

function findRecipeNode(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (isRecipeType(obj["@type"])) return obj;
    if (Array.isArray(obj["@graph"])) {
      const found = findRecipeNode(obj["@graph"]);
      if (found) return found;
    }
  }
  return null;
}

export function extractRecipeJsonLd(
  html: string,
): Record<string, unknown> | null {
  for (const match of html.matchAll(JSON_LD_SCRIPT)) {
    const raw = decodeHtmlEntities(match[1]).trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const node = findRecipeNode(parsed);
    if (node) return node;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Schema.org Recipe -> DishFrame mapping
// ---------------------------------------------------------------------------

function firstString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  return null;
}

function joinedString(value: unknown): string | null {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => firstString(item))
      .filter((item): item is string => !!item);
    return parts.length ? parts.join(", ") : null;
  }
  return firstString(value);
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : null))
      .filter((item): item is string => !!item);
  }
  return [];
}

const ISO8601_DURATION =
  /^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?)?$/;

export function parseIso8601DurationToMinutes(value: string): number | null {
  const match = value.match(ISO8601_DURATION);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const total = hours * 60 + minutes;
  return total > 0 || match[1] !== undefined || match[2] !== undefined
    ? total
    : null;
}

function parseDurationField(value: unknown): number | null {
  const text = firstString(value);
  return text ? parseIso8601DurationToMinutes(text) : null;
}

function parseRecipeYield(value: unknown): {
  quantity: number | null;
  unit: string | null;
} {
  const text = firstString(value);
  if (!text) return { quantity: null, unit: null };
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { quantity: null, unit: text || null };
  return { quantity: Number(match[1]), unit: match[2].trim() || null };
}

function parseNutrientNumber(value: unknown): number | null {
  const text = firstString(value);
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function mapNutrition(raw: unknown): ImportFieldOverrides {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const calories = parseNutrientNumber(obj.calories);
  const protein = parseNutrientNumber(obj.proteinContent);
  const carbs = parseNutrientNumber(obj.carbohydrateContent);
  const fat = parseNutrientNumber(obj.fatContent);
  if (calories == null && protein == null && carbs == null && fat == null) {
    return {};
  }
  // Schema.org's NutritionInformation is conventionally per the recipe's
  // own declared yield/serving — a reasonable default basis, editable in
  // review like every other import guess (never presented as verified).
  return {
    calories,
    protein,
    carbs,
    fat,
    nutritionBasis: "PER_OUTPUT_UNIT",
    nutritionBasisQuantity: 1,
    nutritionBasisUnit: "serving",
  };
}

type InstructionStep = { text: string };
type InstructionGroup = {
  name: string | null;
  instructions: InstructionStep[];
};

function hasType(item: unknown, typeName: string): boolean {
  if (!item || typeof item !== "object") return false;
  const type = (item as Record<string, unknown>)["@type"];
  if (typeof type === "string") return type === typeName;
  if (Array.isArray(type)) return type.includes(typeName);
  return false;
}

function stepsFromNode(item: unknown): InstructionStep[] {
  if (typeof item === "string") {
    const text = item.trim();
    return text ? [{ text }] : [];
  }
  if (item && typeof item === "object") {
    if (hasType(item, "HowToSection")) {
      const items = (item as Record<string, unknown>).itemListElement;
      return Array.isArray(items) ? items.flatMap(stepsFromNode) : [];
    }
    const obj = item as Record<string, unknown>;
    const text = firstString(obj.text) ?? firstString(obj.name);
    return text ? [{ text }] : [];
  }
  return [];
}

function collectInstructionGroups(raw: unknown): InstructionGroup[] {
  if (typeof raw === "string") {
    const lines = raw
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const instructions = (lines.length ? lines : [raw.trim()])
      .filter(Boolean)
      .map((text) => ({ text }));
    return instructions.length ? [{ name: null, instructions }] : [];
  }

  if (!Array.isArray(raw)) return [];

  const hasSections = raw.some((item) => hasType(item, "HowToSection"));
  if (!hasSections) {
    const instructions = raw.flatMap(stepsFromNode);
    return instructions.length ? [{ name: null, instructions }] : [];
  }

  const groups: InstructionGroup[] = [];
  for (const item of raw) {
    if (hasType(item, "HowToSection")) {
      const name = firstString((item as Record<string, unknown>).name);
      const instructions = stepsFromNode(item);
      if (instructions.length) groups.push({ name, instructions });
    } else {
      const instructions = stepsFromNode(item);
      if (instructions.length) groups.push({ name: null, instructions });
    }
  }
  return groups;
}

function buildSectionsFromSchemaOrg(
  ingredients: ReturnType<typeof parseIngredientLine>[],
  instructionGroups: InstructionGroup[],
): WorkingSection[] {
  const namedGroups = instructionGroups.filter((group) => group.name);
  const sections: WorkingSection[] = [];

  if (namedGroups.length > 0) {
    if (ingredients.length > 0) {
      sections.push({
        name: null,
        ingredients,
        instructions: [],
        mode: "INGREDIENTS",
      });
    }
    for (const group of instructionGroups) {
      sections.push({
        name: group.name,
        ingredients: [],
        instructions: group.instructions,
        mode: "INSTRUCTIONS",
      });
    }
  } else {
    sections.push({
      name: null,
      ingredients,
      instructions: instructionGroups.flatMap((group) => group.instructions),
      mode: ingredients.length > 0 ? "INGREDIENTS" : "INSTRUCTIONS",
    });
  }

  return sections.filter(
    (section) =>
      section.ingredients.length > 0 || section.instructions.length > 0,
  );
}

export function mapSchemaOrgRecipe(
  node: Record<string, unknown>,
): PasteParseResult | null {
  const title = firstString(node.name) ?? "Imported recipe";
  const description = firstString(node.description);
  const cuisine = joinedString(node.recipeCuisine);
  const { quantity: yieldQuantity, unit: yieldUnit } = parseRecipeYield(
    node.recipeYield,
  );
  const prepTimeMinutes = parseDurationField(node.prepTime);
  const cookTimeMinutes =
    parseDurationField(node.cookTime) ?? parseDurationField(node.totalTime);

  const ingredientLines = toStringArray(
    node.recipeIngredient ?? node.ingredients,
  );
  const ingredients = ingredientLines.map((line) => parseIngredientLine(line));

  const instructionGroups = collectInstructionGroups(node.recipeInstructions);
  const sections = buildSectionsFromSchemaOrg(ingredients, instructionGroups);

  if (sections.length === 0) return null;

  return buildParseResult(
    {
      title,
      description,
      cuisine,
      yieldQuantity,
      yieldUnit,
      prepTimeMinutes,
      cookTimeMinutes,
      ...mapNutrition(node.nutrition),
    },
    sections,
    [],
  );
}
