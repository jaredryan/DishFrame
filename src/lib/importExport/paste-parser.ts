import { parseQuantityText } from "@/lib/dishes/quantity-text";
import type { IngredientInput, SectionInput } from "@/lib/dishes/schema";
import type { DishFormValues } from "@/components/domain/dish/dish-form-values";

/**
 * PRODUCT_SPEC.md §59.1: the deterministic (non-AI) paste-and-review
 * importer's first stage — `rawSource → structuredProposal`
 * (ARCHITECTURE_PROPOSAL.md §L). Pure and framework-agnostic on purpose so
 * it's directly unit-testable and swappable: a future AI-assisted parser
 * (§59.3, Tier 3, not built here) would only ever replace this one function,
 * never the review/confirm/creation stages downstream of it
 * (`src/lib/importExport/service.ts`'s `confirmImport`, which funnels
 * straight into the ordinary `dishes/service.ts#createDish`).
 *
 * Recognizes headings, ingredient lines (leading quantity/unit, §10.4's
 * supported forms), and numbered/bulleted steps — §59.1's named targets.
 * Deliberately does not invent linked Parts (§57.4) and never guesses a
 * Section into existence beyond what the source text's own headings imply.
 * Accuracy is inherently limited by input variety (Build Plan's own named
 * risk for this slice) — the mandatory review step downstream
 * (§56.1/§59.2, the reused `DishEditor`) is what makes that acceptable, not
 * a goal of perfect recognition here.
 */

const BULLET_PREFIX = /^[-*•]\s+/;
const APPROX_PREFIX = /^(about|approx\.?|approximately)\s+/i;

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;
const RANGE_SEP = String.raw`(?:-|–|—|to)`;
const LEADING_QTY_RANGE = new RegExp(
  `^(${NUM})\\s*${RANGE_SEP}\\s*(${NUM})\\s+(.+)$`,
  "i",
);
const LEADING_QTY = new RegExp(`^(${NUM})\\s+(.+)$`);

// Common recipe units, longest-alternative-safe because every alternative is
// anchored with a trailing word boundary (`cup` cannot partially match
// `cups` — the boundary check fails and the regex falls through to the
// `cups` alternative instead).
const UNIT_WORDS = [
  "cups",
  "cup",
  "c",
  "tablespoons",
  "tablespoon",
  "tbsp",
  "tbs",
  "tbl",
  "teaspoons",
  "teaspoon",
  "tsp",
  "ounces",
  "ounce",
  "oz",
  "pounds",
  "pound",
  "lbs",
  "lb",
  "grams",
  "gram",
  "g",
  "kilograms",
  "kilogram",
  "kg",
  "milliliters",
  "milliliter",
  "ml",
  "liters",
  "liter",
  "l",
  "cans",
  "can",
  "bunches",
  "bunch",
  "cloves",
  "clove",
  "pinches",
  "pinch",
  "dashes",
  "dash",
  "slices",
  "slice",
  "packages",
  "package",
  "pkg",
  "quarts",
  "quart",
  "qt",
  "pints",
  "pint",
  "pt",
  "sticks",
  "stick",
  "pieces",
  "piece",
  "heads",
  "head",
];
const UNIT_PATTERN = new RegExp(`^(${UNIT_WORDS.join("|")})\\.?(?=\\s|$)`, "i");

const INGREDIENTS_HEADING = /^ingredients?:?$/i;
const INSTRUCTIONS_HEADING = /^(instructions?|directions?|steps?|method):?$/i;
const NUMBERED_STEP = /^(\d{1,3})[.)]\s+(.+)$/;
// A short line ending in a bare colon, not itself a numbered step (checked
// first in the classification order below) — PRODUCT_SPEC.md §9.3's
// "Section: Chicken" / "For the sauce:" convention.
const GENERIC_HEADING = /^([^\n]{1,60}):$/;

// A line this long, encountered before any structure has been recognized
// yet, reads as a paragraph/description rather than a single ingredient —
// flagged for review instead of guessed at, per §56.1 step 4 ("identify
// unsupported or ambiguous fields").
const UNSTRUCTURED_LINE_LENGTH_THRESHOLD = 140;

function parseIngredientLine(raw: string): IngredientInput {
  let line = raw.replace(BULLET_PREFIX, "").trim();

  let isApproximate = false;
  const approxMatch = line.match(APPROX_PREFIX);
  if (approxMatch) {
    isApproximate = true;
    line = line.slice(approxMatch[0].length);
  }

  let quantity: number | null = null;
  let quantityEnd: number | null = null;
  let rest = line;

  const rangeMatch = line.match(LEADING_QTY_RANGE);
  if (rangeMatch) {
    quantity = parseQuantityText(rangeMatch[1]);
    quantityEnd = parseQuantityText(rangeMatch[2]);
    rest = rangeMatch[3];
  } else {
    const singleMatch = line.match(LEADING_QTY);
    if (singleMatch) {
      quantity = parseQuantityText(singleMatch[1]);
      rest = singleMatch[2];
    }
  }

  let unit: string | null = null;
  const unitMatch = rest.match(UNIT_PATTERN);
  if (unitMatch) {
    unit = unitMatch[1];
    rest = rest.slice(unitMatch[0].length).trim();
  }

  const name = rest.trim() || line.trim() || raw.trim();

  return {
    name,
    quantity,
    quantityEnd,
    isApproximate,
    unit,
    displayText: null,
    preparationNote: null,
    isOptional: false,
    substitute: null,
    originalImportedText: raw.trim(),
  };
}

function parseInstructionLine(raw: string): string {
  const numbered = raw.match(NUMBERED_STEP);
  if (numbered) return numbered[2].trim();
  return raw.replace(BULLET_PREFIX, "").trim();
}

type WorkingSection = {
  name: string | null;
  ingredients: IngredientInput[];
  instructions: { text: string }[];
  mode: "UNKNOWN" | "INGREDIENTS" | "INSTRUCTIONS";
};

export type PasteParseResult = {
  values: DishFormValues;
  // Count of source lines the deterministic parser could not confidently
  // place — surfaced by the review UI as a "needs review" prompt pointing
  // at the dedicated trailing Section those lines land in below, rather
  // than silently dropping them (§56.1 step 4).
  needsReviewCount: number;
};

export function parsePastedRecipe(raw: string): PasteParseResult {
  const rawLines = raw.split(/\r\n|\r|\n/).map((line) => line.trim());

  let idx = 0;
  while (idx < rawLines.length && rawLines[idx] === "") idx++;
  const title = idx < rawLines.length ? rawLines[idx] : "";
  if (idx < rawLines.length) idx++;

  const sections: WorkingSection[] = [
    { name: null, ingredients: [], instructions: [], mode: "UNKNOWN" },
  ];
  const needsReview: string[] = [];

  function current(): WorkingSection {
    return sections[sections.length - 1];
  }

  for (; idx < rawLines.length; idx++) {
    const line = rawLines[idx];
    if (line === "") continue;

    if (INGREDIENTS_HEADING.test(line)) {
      current().mode = "INGREDIENTS";
      continue;
    }
    if (INSTRUCTIONS_HEADING.test(line)) {
      current().mode = "INSTRUCTIONS";
      continue;
    }

    if (NUMBERED_STEP.test(line)) {
      current().mode = "INSTRUCTIONS";
      current().instructions.push({ text: parseInstructionLine(line) });
      continue;
    }

    const genericHeading = line.match(GENERIC_HEADING);
    if (genericHeading) {
      sections.push({
        name: genericHeading[1].trim(),
        ingredients: [],
        instructions: [],
        mode: "UNKNOWN",
      });
      continue;
    }

    if (current().mode === "INSTRUCTIONS") {
      current().instructions.push({ text: parseInstructionLine(line) });
      continue;
    }

    if (
      current().mode === "UNKNOWN" &&
      line.length > UNSTRUCTURED_LINE_LENGTH_THRESHOLD
    ) {
      needsReview.push(line);
      continue;
    }

    current().mode = "INGREDIENTS";
    current().ingredients.push(parseIngredientLine(line));
  }

  const outputSections: SectionInput[] = sections
    .filter(
      (section) =>
        section.ingredients.length > 0 || section.instructions.length > 0,
    )
    .map((section, position) => ({
      name: section.name,
      guidanceNote: null,
      ingredients: section.ingredients,
      instructions: section.instructions,
      partLinks: [],
      position,
    }));

  if (needsReview.length > 0) {
    outputSections.push({
      name: "Needs review",
      guidanceNote:
        "The importer could not confidently structure these lines — check, correct, or move them before saving.",
      ingredients: [],
      instructions: needsReview.map((text) => ({ text })),
      partLinks: [],
      position: outputSections.length,
    });
  }

  return {
    values: {
      title,
      stage: "IDEA",
      cuisine: null,
      description: null,
      yieldQuantity: null,
      yieldUnit: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      difficulty: null,
      imageAssetId: null,
      sections: outputSections.length
        ? outputSections
        : [
            {
              name: null,
              guidanceNote: null,
              ingredients: [],
              instructions: [],
              partLinks: [],
              position: 0,
            },
          ],
      partLinks: [],
    },
    needsReviewCount: needsReview.length,
  };
}
