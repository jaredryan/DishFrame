import "server-only";
import type {
  MoreNutrientEntry,
  NutritionBasisValue,
} from "@/lib/dishes/schema";

/**
 * ARCHITECTURE_PROPOSAL.md §L (nutrition row), BUILD_PLAN.md Slice 13: a
 * thin, server-only client for USDA FoodData Central — search + one food's
 * detail, shaped/whitelisted before ever reaching `nutrition/actions.ts`.
 * `FDC_API_KEY` is only ever read by the caller and passed in here; this
 * module never reads `process.env` itself, so it stays trivially testable
 * with a fake key and a mocked `fetch`, and can never accidentally leak the
 * real key into a log line only it would have access to.
 */

const FDC_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const REQUEST_TIMEOUT_MS = 8000;

export class FdcError extends Error {}
export class FdcTimeoutError extends FdcError {}
export class FdcRateLimitError extends FdcError {}
export class FdcUpstreamError extends FdcError {}
/** The upstream response didn't contain enough to build a truthful result
 * (e.g. no usable description/id) — distinct from a transport failure. */
export class FdcShapeError extends FdcError {}

export type FdcSearchResultItem = {
  fdcId: number;
  description: string;
  dataType: string;
  brandName: string | null;
  brandOwner: string | null;
};

export type FdcSearchResult = {
  query: string;
  totalHits: number;
  items: FdcSearchResultItem[];
};

export type FdcNutritionDetail = {
  fdcId: number;
  sourceName: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  nutritionBasis: NutritionBasisValue;
  nutritionBasisQuantity: number;
  nutritionBasisUnit: string;
  moreNutrients: MoreNutrientEntry[];
};

// ---------------------------------------------------------------------------
// Raw upstream shapes — only the fields this module actually reads. Every
// other field FDC returns is dropped by construction (never spread through),
// per the Slice 13 requirement to never pass raw FDC payloads to the client.
// ---------------------------------------------------------------------------

type RawSearchFood = {
  fdcId?: unknown;
  description?: unknown;
  dataType?: unknown;
  brandName?: unknown;
  brandOwner?: unknown;
};

type RawSearchResponse = {
  totalHits?: unknown;
  foods?: unknown;
};

type RawFoodNutrient = {
  nutrient?: { id?: unknown; unitName?: unknown };
  amount?: unknown;
};

type RawLabelNutrientEntry = { value?: unknown };

type RawLabelNutrients = {
  calories?: RawLabelNutrientEntry;
  protein?: RawLabelNutrientEntry;
  carbohydrates?: RawLabelNutrientEntry;
  fat?: RawLabelNutrientEntry;
  fiber?: RawLabelNutrientEntry;
  sugars?: RawLabelNutrientEntry;
  sodium?: RawLabelNutrientEntry;
  saturatedFat?: RawLabelNutrientEntry;
  cholesterol?: RawLabelNutrientEntry;
};

type RawFoodDetail = {
  fdcId?: unknown;
  description?: unknown;
  dataType?: unknown;
  servingSize?: unknown;
  servingSizeUnit?: unknown;
  foodNutrients?: unknown;
  labelNutrients?: RawLabelNutrients;
};

// ---------------------------------------------------------------------------
// USDA FDC nutrient ids (stable across the API — nal.usda.gov reference
// data) used to pick primary/More-nutrients values out of `foodNutrients`.
// ---------------------------------------------------------------------------

const NUTRIENT_ID_ENERGY_KCAL = 1008;
const NUTRIENT_ID_ENERGY_KJ = 1062;
const NUTRIENT_ID_PROTEIN = 1003;
const NUTRIENT_ID_CARBS = 1005;
const NUTRIENT_ID_FAT = 1004;
const NUTRIENT_ID_FIBER = 1079;
const NUTRIENT_ID_SUGAR_TOTAL = 2000;
const NUTRIENT_ID_SUGAR_TOTAL_LEGACY = 1063;
const NUTRIENT_ID_SODIUM = 1093;
const NUTRIENT_ID_SATURATED_FAT = 1258;
const NUTRIENT_ID_CHOLESTEROL = 1253;

// kcal is the primary calorie unit DishFrame stores — a Foundation/SR
// Legacy food that only reports Energy in kJ is converted here rather than
// left null, per the Slice 13 "kcal versus kJ handling" requirement. 1
// kcal = 4.184 kJ (the same conversion factor USDA's own documentation
// uses).
const KJ_PER_KCAL = 4.184;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new FdcTimeoutError(
        "USDA FoodData Central did not respond in time.",
      );
    }
    throw new FdcUpstreamError("Could not reach USDA FoodData Central.");
  } finally {
    clearTimeout(timeout);
  }
}

async function fdcRequest<T>(
  apiKey: string,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${FDC_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetchWithTimeout(url.toString());

  if (response.status === 429) {
    throw new FdcRateLimitError(
      "USDA FoodData Central rate limit reached. Try again shortly.",
    );
  }
  if (!response.ok) {
    throw new FdcUpstreamError(
      `USDA FoodData Central request failed (${response.status}).`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new FdcShapeError(
      "USDA FoodData Central returned an unreadable response.",
    );
  }
}

function shapeSearchResults(
  raw: RawSearchResponse,
  query: string,
): FdcSearchResult {
  const foods = Array.isArray(raw.foods) ? (raw.foods as RawSearchFood[]) : [];
  const items: FdcSearchResultItem[] = [];
  for (const food of foods) {
    // Malformed/incomplete upstream data: a hit missing the two fields a
    // usable result needs is dropped rather than surfaced as a broken row.
    if (
      typeof food.fdcId !== "number" ||
      typeof food.description !== "string"
    ) {
      continue;
    }
    items.push({
      fdcId: food.fdcId,
      description: food.description,
      dataType: typeof food.dataType === "string" ? food.dataType : "Unknown",
      brandName: typeof food.brandName === "string" ? food.brandName : null,
      brandOwner: typeof food.brandOwner === "string" ? food.brandOwner : null,
    });
  }
  return {
    query,
    totalHits: typeof raw.totalHits === "number" ? raw.totalHits : items.length,
    items,
  };
}

/** Primary Energy value in kcal — prefers a direct kcal reading, falls back
 * to converting a kJ-only reading, per the module doc comment above. */
function pickCalories(nutrients: RawFoodNutrient[]): number | null {
  const kcal = pickNutrientAmount(nutrients, NUTRIENT_ID_ENERGY_KCAL);
  if (kcal !== null) return round(kcal, 0);
  const kj = pickNutrientAmount(nutrients, NUTRIENT_ID_ENERGY_KJ);
  return kj !== null ? round(kj / KJ_PER_KCAL, 0) : null;
}

function pickNutrientAmount(
  nutrients: RawFoodNutrient[],
  nutrientId: number,
): number | null {
  const entry = nutrients.find((n) => n.nutrient?.id === nutrientId);
  return typeof entry?.amount === "number" ? entry.amount : null;
}

const MORE_NUTRIENT_SPECS = [
  {
    key: "fiber" as const,
    label: "Fiber",
    ids: [NUTRIENT_ID_FIBER],
    unit: "g",
  },
  {
    key: "sugar" as const,
    label: "Sugar",
    ids: [NUTRIENT_ID_SUGAR_TOTAL, NUTRIENT_ID_SUGAR_TOTAL_LEGACY],
    unit: "g",
  },
  {
    key: "sodium" as const,
    label: "Sodium",
    ids: [NUTRIENT_ID_SODIUM],
    unit: "mg",
  },
  {
    key: "saturatedFat" as const,
    label: "Saturated fat",
    ids: [NUTRIENT_ID_SATURATED_FAT],
    unit: "g",
  },
  {
    key: "cholesterol" as const,
    label: "Cholesterol",
    ids: [NUTRIENT_ID_CHOLESTEROL],
    unit: "mg",
  },
];

function moreNutrientsFromFoodNutrients(
  nutrients: RawFoodNutrient[],
): MoreNutrientEntry[] {
  const results: MoreNutrientEntry[] = [];
  for (const spec of MORE_NUTRIENT_SPECS) {
    let value: number | null = null;
    for (const id of spec.ids) {
      value = pickNutrientAmount(nutrients, id);
      if (value !== null) break;
    }
    if (value !== null) {
      results.push({
        key: spec.key,
        label: spec.label,
        value: round(value, 1),
        unit: spec.unit,
      });
    }
  }
  return results;
}

const LABEL_MORE_NUTRIENT_SPECS = [
  { key: "fiber" as const, label: "Fiber", field: "fiber" as const, unit: "g" },
  {
    key: "sugar" as const,
    label: "Sugar",
    field: "sugars" as const,
    unit: "g",
  },
  {
    key: "sodium" as const,
    label: "Sodium",
    field: "sodium" as const,
    unit: "mg",
  },
  {
    key: "saturatedFat" as const,
    label: "Saturated fat",
    field: "saturatedFat" as const,
    unit: "g",
  },
  {
    key: "cholesterol" as const,
    label: "Cholesterol",
    field: "cholesterol" as const,
    unit: "mg",
  },
];

function moreNutrientsFromLabel(label: RawLabelNutrients): MoreNutrientEntry[] {
  const results: MoreNutrientEntry[] = [];
  for (const spec of LABEL_MORE_NUTRIENT_SPECS) {
    const value = label[spec.field]?.value;
    if (typeof value === "number") {
      results.push({
        key: spec.key,
        label: spec.label,
        value: round(value, 1),
        unit: spec.unit,
      });
    }
  }
  return results;
}

/**
 * Truthful basis handling (PRODUCT_SPEC.md §54.2/§54.4): a Branded food's
 * `labelNutrients` are reported per its actual declared serving
 * (`servingSize`/`servingSizeUnit`) — used whenever present. Every other
 * case (Foundation/SR Legacy foods, or a Branded food missing label data)
 * falls back to `foodNutrients`, which USDA always reports per 100g,
 * regardless of the food's physical form — never presented as "per
 * serving" when it isn't.
 */
function shapeFoodDetail(raw: RawFoodDetail): FdcNutritionDetail {
  if (typeof raw.fdcId !== "number" || typeof raw.description !== "string") {
    throw new FdcShapeError(
      "USDA FoodData Central did not return enough information about this food.",
    );
  }

  const hasLabelBasis =
    raw.labelNutrients &&
    typeof raw.servingSize === "number" &&
    raw.servingSize > 0 &&
    typeof raw.servingSizeUnit === "string" &&
    raw.servingSizeUnit.length > 0;

  if (hasLabelBasis && raw.labelNutrients) {
    const label = raw.labelNutrients;
    return {
      fdcId: raw.fdcId,
      sourceName: raw.description,
      calories:
        typeof label.calories?.value === "number"
          ? round(label.calories.value, 0)
          : null,
      protein:
        typeof label.protein?.value === "number"
          ? round(label.protein.value, 1)
          : null,
      carbs:
        typeof label.carbohydrates?.value === "number"
          ? round(label.carbohydrates.value, 1)
          : null,
      fat:
        typeof label.fat?.value === "number" ? round(label.fat.value, 1) : null,
      nutritionBasis: "PER_OUTPUT_UNIT",
      nutritionBasisQuantity: raw.servingSize as number,
      nutritionBasisUnit: raw.servingSizeUnit as string,
      moreNutrients: moreNutrientsFromLabel(label),
    };
  }

  const nutrients = Array.isArray(raw.foodNutrients)
    ? (raw.foodNutrients as RawFoodNutrient[])
    : [];
  return {
    fdcId: raw.fdcId,
    sourceName: raw.description,
    calories: pickCalories(nutrients),
    protein: (() => {
      const v = pickNutrientAmount(nutrients, NUTRIENT_ID_PROTEIN);
      return v === null ? null : round(v, 1);
    })(),
    carbs: (() => {
      const v = pickNutrientAmount(nutrients, NUTRIENT_ID_CARBS);
      return v === null ? null : round(v, 1);
    })(),
    fat: (() => {
      const v = pickNutrientAmount(nutrients, NUTRIENT_ID_FAT);
      return v === null ? null : round(v, 1);
    })(),
    // USDA's standard reporting basis for `foodNutrients`, regardless of
    // data type or physical form — see doc comment above.
    nutritionBasis: "PER_OUTPUT_UNIT",
    nutritionBasisQuantity: 100,
    nutritionBasisUnit: "g",
    moreNutrients: moreNutrientsFromFoodNutrients(nutrients),
  };
}

export async function searchFdcFoods(
  apiKey: string,
  query: string,
): Promise<FdcSearchResult> {
  const raw = await fdcRequest<RawSearchResponse>(apiKey, "/foods/search", {
    query,
    pageSize: "25",
    dataType: "Foundation,SR Legacy,Branded",
  });
  return shapeSearchResults(raw, query);
}

export async function getFdcFoodDetail(
  apiKey: string,
  fdcId: number,
): Promise<FdcNutritionDetail> {
  const raw = await fdcRequest<RawFoodDetail>(apiKey, `/food/${fdcId}`, {});
  return shapeFoodDetail(raw);
}
