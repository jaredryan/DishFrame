import { parseQuantityText } from "@/lib/dishes/quantity-text";
import type { IngredientInput, SectionInput } from "@/lib/dishes/schema";
import type { DishFormValues } from "@/components/domain/dish/dish-form-values";
import {
  AS_NEEDED_TEXT,
  TO_TASTE_TEXT,
} from "@/components/domain/dish/amount-mode";

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

// A Markdown ATX heading ("# Recipe Name", "## Rice") — recognized
// independently of `GENERIC_HEADING`'s colon convention. The title
// extraction in `parsePastedRecipe` strips a leading `#` (H1) as the
// recipe name; any heading level encountered here (in the body, i.e. by
// `buildSections`) always starts a new named Section rather than ever
// being imported as an ingredient/instruction line.
const MARKDOWN_HEADING = /^#{1,6}\s+(.+)$/;

// A trailing "to taste" / "as needed" amount (§10.5/§10.7's free-text
// presets) — recognized on the ingredient line itself so e.g. "Salt to
// taste" imports as name "Salt" with the matching preset amount, not a
// literal ingredient named "Salt to taste".
const TO_TASTE_SUFFIX = /\s+to taste$/i;
const AS_NEEDED_SUFFIX = /\s+as needed$/i;

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

// Mirrors `ingredientInputSchema.name`'s own 200-char cap
// (`src/lib/dishes/schema.ts`) — live-QA root cause: once a Section's mode
// is already "INGREDIENTS" (set by an "Ingredients:" heading or an earlier
// short ingredient line), every later line fell straight into
// `parseIngredientLine` regardless of length, so a long hand-typed prose
// line (common in Recipe Gallery's non-templated exports — see
// docs/importer-enhancement-implementation.md's "~78%
// INGREDIENTS:/INSTRUCTIONS:, rest messy personal notes") could produce an
// ingredient `name` over the schema's limit. That failure only ever
// surfaced at persistence time, as a raw "Too big: expected string to have
// <=200 characters" Zod message with no indication of which line caused it.
// Checking the *parsed* name's length here — not just the raw line's, so a
// long line with a genuine leading quantity/unit still gets a chance to fit
// — routes it to "Needs review" instead, matching the treatment an
// unstructured paragraph already gets under `UNKNOWN` mode above.
const INGREDIENT_NAME_MAX_LENGTH = 200;

export function parseIngredientLine(raw: string): IngredientInput {
  let line = raw.replace(BULLET_PREFIX, "").trim();

  let isApproximate = false;
  const approxMatch = line.match(APPROX_PREFIX);
  if (approxMatch) {
    isApproximate = true;
    line = line.slice(approxMatch[0].length);
  }

  let displayText: string | null = null;
  if (TO_TASTE_SUFFIX.test(line)) {
    displayText = TO_TASTE_TEXT;
    line = line.replace(TO_TASTE_SUFFIX, "").trim();
  } else if (AS_NEEDED_SUFFIX.test(line)) {
    displayText = AS_NEEDED_TEXT;
    line = line.replace(AS_NEEDED_SUFFIX, "").trim();
  }

  let quantity: number | null = null;
  let quantityEnd: number | null = null;
  let unit: string | null = null;
  let rest = line;

  // A recognized "to taste"/"as needed" amount has no quantity or unit to
  // parse — the rest of the line is entirely the ingredient name.
  if (!displayText) {
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

    const unitMatch = rest.match(UNIT_PATTERN);
    if (unitMatch) {
      unit = unitMatch[1];
      rest = rest.slice(unitMatch[0].length).trim();
    }
  }

  const name = rest.trim() || line.trim() || raw.trim();

  return {
    name,
    quantity,
    quantityEnd,
    isApproximate,
    unit,
    displayText,
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

// The shared normalized intermediate representation every import source
// (paste, file upload, website) converges on before `buildParseResult`
// assembles it into the same `PasteParseResult`/`DishFormValues` shape —
// source-specific adapters only ever need to produce `WorkingSection[]`.
export type WorkingSection = {
  name: string | null;
  ingredients: IngredientInput[];
  instructions: { text: string }[];
  mode: "UNKNOWN" | "INGREDIENTS" | "INSTRUCTIONS";
};

// Importer live-QA polish pass (task §8): the exact marker name `dish-
// editor.tsx` matches on to give this Section a dedicated orange-accent
// warning treatment instead of ordinary Section chrome — exported so both
// sides read the same literal rather than risking silent drift between two
// copies of the string.
export const NEEDS_REVIEW_SECTION_NAME = "Needs review";

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
// Exported so other source adapters (website-import.ts's HTML/JSON-LD path
// builds `WorkingSection[]` directly rather than calling this; the Recipe
// Gallery archive adapter, recipe-gallery-import.ts, calls this directly on
// each contained recipe's plain-text body) can reuse the exact same
// line-classification core `parsePastedRecipe` itself is built on, instead
// of a second recipe-body parser.
export function buildSections(lines: string[]): {
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

    const markdownHeading = line.match(MARKDOWN_HEADING);
    if (markdownHeading) {
      sections.push({
        name: markdownHeading[1].trim(),
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

    // Only a line with neither a recognized quantity nor unit — where
    // `name` ends up being the raw line itself — is the unstructured-prose
    // case this threshold targets; a long line with real leading quantity/
    // unit data is judged solely by the 200-char name cap below.
    const candidateIngredient = parseIngredientLine(line);
    const looksUnstructured =
      candidateIngredient.quantity === null &&
      candidateIngredient.unit === null;
    if (looksUnstructured && line.length > UNSTRUCTURED_LINE_LENGTH_THRESHOLD) {
      needsReview.push(line);
      continue;
    }
    if (candidateIngredient.name.length > INGREDIENT_NAME_MAX_LENGTH) {
      needsReview.push(line);
      continue;
    }

    current().mode = "INGREDIENTS";
    current().ingredients.push(candidateIngredient);
  }

  return { sections, needsReview };
}

// Overridable top-level fields a source adapter (paste/file text, website
// JSON-LD) can supply on top of `buildParseResult`'s own IDEA/null
// defaults — kept to the fields an adapter can actually derive; everything
// else (difficulty, image, More-nutrients, sourced-nutrition attribution)
// stays reviewer-entered only, never guessed at import time.
export type ImportFieldOverrides = Partial<
  Pick<
    DishFormValues,
    | "title"
    | "description"
    | "cuisine"
    | "yieldQuantity"
    | "yieldUnit"
    | "prepTimeMinutes"
    | "cookTimeMinutes"
    | "calories"
    | "protein"
    | "carbs"
    | "fat"
    | "nutritionBasis"
    | "nutritionBasisQuantity"
    | "nutritionBasisUnit"
  >
>;

/**
 * The convergence point every import source adapter funnels through:
 * `WorkingSection[]` (+ any top-level field overrides) → the same
 * `PasteParseResult` the review editor consumes, including the shared
 * "Needs review" trailing-Section treatment for lines/steps a source
 * couldn't confidently place.
 */
// Task §9: the same investigation that found the ingredient-name overflow
// above also asked whether *other* fields a source adapter derives from
// free-form text (a website's Schema.org `name`, a Recipe Gallery `Title`,
// a joined `recipeCuisine` list, an over-length Markdown heading) could
// exceed their own persistence caps (`dishContentSchema`,
// `src/lib/dishes/schema.ts`) the same way. Clamping the handful of
// text-derived override fields here — the one place every adapter's output
// converges — is cheaper and safer than teaching each adapter its own
// limit, and matches those exact caps so a clamp here can never itself
// produce a value the server would still reject.
const TITLE_MAX_LENGTH = 200;
const CUISINE_MAX_LENGTH = 60;
const SECTION_NAME_MAX_LENGTH = 80;

function clamp(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function buildParseResult(
  fields: ImportFieldOverrides,
  sections: WorkingSection[],
  needsReview: string[],
): PasteParseResult {
  const outputSections: SectionInput[] = sections
    .filter(
      (section) =>
        section.ingredients.length > 0 || section.instructions.length > 0,
    )
    .map((section, position) => ({
      name: section.name ? clamp(section.name, SECTION_NAME_MAX_LENGTH) : null,
      guidanceNote: null,
      ingredients: section.ingredients,
      instructions: section.instructions,
      partLinks: [],
      position,
    }));

  if (needsReview.length > 0) {
    outputSections.push({
      name: NEEDS_REVIEW_SECTION_NAME,
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
      title: clamp(fields.title ?? "", TITLE_MAX_LENGTH),
      stage: "IDEA",
      cuisine: fields.cuisine
        ? clamp(fields.cuisine, CUISINE_MAX_LENGTH)
        : null,
      description: fields.description ?? null,
      yieldQuantity: fields.yieldQuantity ?? null,
      yieldUnit: fields.yieldUnit ?? null,
      prepTimeMinutes: fields.prepTimeMinutes ?? null,
      cookTimeMinutes: fields.cookTimeMinutes ?? null,
      difficulty: null,
      imageAssetId: null,
      calories: fields.calories ?? null,
      protein: fields.protein ?? null,
      carbs: fields.carbs ?? null,
      fat: fields.fat ?? null,
      nutritionBasis: fields.nutritionBasis ?? null,
      nutritionBasisQuantity: fields.nutritionBasisQuantity ?? null,
      nutritionBasisUnit: fields.nutritionBasisUnit ?? null,
      moreNutrients: null,
      nutritionSourceProvider: null,
      nutritionSourceId: null,
      nutritionSourceName: null,
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

export function parsePastedRecipe(raw: string): PasteParseResult {
  const rawLines = raw.split(/\r\n|\r|\n/).map((line) => line.trim());

  let idx = 0;
  while (idx < rawLines.length && rawLines[idx] === "") idx++;
  const titleLine = idx < rawLines.length ? rawLines[idx] : "";
  // A "# Recipe Name" Markdown H1 title line names the recipe by its
  // heading text, not the literal "# Recipe Name" string.
  const titleHeadingMatch = titleLine.match(MARKDOWN_HEADING);
  const title = titleHeadingMatch ? titleHeadingMatch[1].trim() : titleLine;
  if (idx < rawLines.length) idx++;

  const { sections, needsReview } = buildSections(rawLines.slice(idx));

  return buildParseResult({ title }, sections, needsReview);
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
