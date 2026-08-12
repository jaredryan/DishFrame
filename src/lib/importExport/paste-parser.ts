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
// DishFrame's own collapsed-Section copy output puts the ordinal marker and
// its Instruction text on separate lines ("1.", then "Chop cilantro" on the
// next line) rather than the single-line "1. Chop cilantro" convention
// `NUMBERED_STEP` handles — the marker alone, with nothing else on its
// line, so it can never match an ingredient quantity like "0.5–1 tsp Salt".
const STANDALONE_ORDINAL = /^(\d{1,3})[.)]$/;
// A short line ending in a bare colon, not itself a numbered step (checked
// first in the classification order below) — PRODUCT_SPEC.md §9.3's
// "Section: Chicken" / "For the sauce:" convention.
const GENERIC_HEADING = /^([^\n]{1,60}):$/;

// A line made primarily or entirely of repeated `-`/`_`/`=` characters —
// "------", "________", a run of `=` — is a visual divider, not recipe
// content: it's a strong Section boundary, and never itself kept as an
// ingredient/instruction. Whitespace between the repeated characters (e.g.
// "- - - - -") is tolerated by compacting before the length/pattern check.
const SEPARATOR_CHARS = /^[-_=]{3,}$/;
function isSeparatorLine(line: string): boolean {
  const compact = line.replace(/\s+/g, "");
  return compact.length >= 3 && SEPARATOR_CHARS.test(compact);
}

// A short, colon-free, digit-free, non-sentence line — "Chicken", "Sauce",
// "Toppings" — that reads as a heading only in context: this is checked
// exclusively when it sits directly next to a separator line (see
// `buildSections` below), so an ordinary ingredient/instruction line never
// gets reinterpreted just for being short and plain.
const HEADING_MAX_LENGTH = 40;
const SENTENCE_END = /[.!?]$/;
function looksLikeBareHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > HEADING_MAX_LENGTH) return false;
  if (trimmed.endsWith(":")) return false; // GENERIC_HEADING's own case
  if (SENTENCE_END.test(trimmed)) return false;
  if (BULLET_PREFIX.test(trimmed)) return false;
  if (NUMBERED_STEP.test(trimmed)) return false;
  if (/\d/.test(trimmed)) return false;
  return true;
}

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

/**
 * The shared line-classification core: recognizes headings (colon-
 * terminated, or bare next to a separator), ingredient lines, and numbered/
 * bulleted steps, splitting into one or more `WorkingSection`s. Used both by
 * `parsePastedRecipe` (on the body below the title line) and by
 * `parseSectionFromPastedText` (on a whole pasted block, with no title
 * line) — one parser, not two that could drift apart.
 */
function buildSections(lines: string[]): {
  sections: WorkingSection[];
  needsReview: string[];
} {
  const sections: WorkingSection[] = [
    { name: null, ingredients: [], instructions: [], mode: "UNKNOWN" },
  ];
  const needsReview: string[] = [];

  function current(): WorkingSection {
    return sections[sections.length - 1];
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line === "") continue;

    if (isSeparatorLine(line)) {
      // A bare divider is always a Section boundary; an empty resulting
      // Section is harmless — the trailing filter below drops it.
      sections.push({
        name: null,
        ingredients: [],
        instructions: [],
        mode: "UNKNOWN",
      });
      continue;
    }

    if (looksLikeBareHeading(line)) {
      let peek = idx + 1;
      while (peek < lines.length && lines[peek] === "") peek++;
      if (peek < lines.length && isSeparatorLine(lines[peek])) {
        // "Chicken" directly above a divider names the Section that
        // follows; both the heading line and the divider are consumed here
        // and never appear as content.
        sections.push({
          name: line.trim(),
          ingredients: [],
          instructions: [],
          mode: "UNKNOWN",
        });
        idx = peek;
        continue;
      }
    }

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

    if (STANDALONE_ORDINAL.test(line)) {
      let peek = idx + 1;
      while (peek < lines.length && lines[peek] === "") peek++;
      if (peek < lines.length) {
        current().mode = "INSTRUCTIONS";
        current().instructions.push({
          text: parseInstructionLine(lines[peek]),
        });
        idx = peek;
      }
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

  return { sections, needsReview };
}

export function parsePastedRecipe(raw: string): PasteParseResult {
  const rawLines = raw.split(/\r\n|\r|\n/).map((line) => line.trim());

  let idx = 0;
  while (idx < rawLines.length && rawLines[idx] === "") idx++;
  const title = idx < rawLines.length ? rawLines[idx] : "";
  if (idx < rawLines.length) idx++;

  const { sections, needsReview } = buildSections(rawLines.slice(idx));

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

/**
 * The Section editor's "Add section from text" utility (distinct from the
 * full paste-and-review importer above): reuses the exact same
 * `buildSections` classification for one pasted block, but always collapses
 * the result down to a single `SectionInput` — there is no title line to
 * strip, and unlike a whole-recipe paste this never proposes more than one
 * Section. If the block itself contains an internal divider or a second
 * heading, only the first recognized heading becomes the Section's name;
 * everything else's ingredients/instructions are still kept, just merged
 * into the one Section rather than kept as separate ones — the caller
 * always sets a real `position` before inserting this into the form.
 */
export function parseSectionFromPastedText(raw: string): SectionInput {
  const rawLines = raw.split(/\r\n|\r|\n/).map((line) => line.trim());
  const { sections, needsReview } = buildSections(rawLines);

  const contentSections = sections.filter(
    (section) =>
      section.name ||
      section.ingredients.length > 0 ||
      section.instructions.length > 0,
  );

  return {
    name: contentSections.find((section) => section.name)?.name ?? null,
    guidanceNote: null,
    ingredients: contentSections.flatMap((section) => section.ingredients),
    instructions: [
      ...contentSections.flatMap((section) => section.instructions),
      ...needsReview.map((text) => ({ text })),
    ],
    partLinks: [],
    position: 0,
  };
}
