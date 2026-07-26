import { z } from "zod";

// Mirrors Dish.stage (prisma/schema.prisma) — PRODUCT_SPEC.md §5.3.
export const stageValues = [
  "IDEA",
  "EXPERIMENTAL",
  "PROVEN",
  "ACTIVE",
  "ARCHIVED",
] as const;
export type StageValue = (typeof stageValues)[number];

export const dishKindValues = ["RECIPE", "PART"] as const;
export type DishKindValue = (typeof dishKindValues)[number];

// Ingredient.quantity/quantityEnd are `Decimal @db.Decimal(12, 3)`
// (prisma/schema.prisma) — the database itself can only ever hold 3 places
// after the decimal point, rounding anything finer on write. Normalizing to
// that same precision before persistence (rather than letting Postgres be
// the only thing that ever rounds) turns an unbounded parsed value like
// `1/3` → `0.3333333333333333` into a deliberate `0.333` up front, so the
// same value flows through diffing (`diffVersionContent`), any pre-save
// display, and the eventual DB write without surprise. One shared pure
// helper — used by the client's fraction/mixed-number parser
// (number-field.tsx) and the server-side sanitization path
// (`sanitizedSectionsOrThrow` in service.ts) — so there is exactly one
// rounding rule, not two implementations that could drift apart. See
// PRODUCT_SPEC.md §10.6a.
export const QUANTITY_DECIMAL_PLACES = 3;

export function normalizeQuantity(value: number): number {
  return Number(value.toFixed(QUANTITY_DECIMAL_PLACES));
}

// §16.4: restoring requires selecting a non-Archived Stage.
export const restorableStageValues = [
  "IDEA",
  "EXPERIMENTAL",
  "PROVEN",
  "ACTIVE",
] as const;
export type RestorableStageValue = (typeof restorableStageValues)[number];

// A substitute is itself an Ingredient row (schema.prisma's
// `substituteForIngredientId`) — one level only, per PRODUCT_SPEC.md §11.4
// ("a substitute cannot contain another substitute"), so this is
// deliberately not recursive.
const substituteSchema = z.object({
  lineageId: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Enter a name."),
  quantity: z.number().min(0).nullable().optional(),
  quantityEnd: z.number().min(0).nullable().optional(),
  isApproximate: z.boolean().default(false),
  unit: z.string().trim().max(40).nullable().optional(),
  displayText: z.string().trim().max(120).nullable().optional(),
  preparationNote: z.string().trim().max(200).nullable().optional(),
});

export const ingredientInputSchema = z.object({
  // Present when this row was loaded from an existing Version and should
  // carry its lineage identity forward (ARCHITECTURE_PROPOSAL.md §D.-1);
  // absent for a row the editor just added, which gets a fresh lineageId
  // at save time.
  lineageId: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Enter an ingredient name.").max(200),
  quantity: z.number().min(0).nullable().optional(),
  quantityEnd: z.number().min(0).nullable().optional(),
  isApproximate: z.boolean().default(false),
  unit: z.string().trim().max(40).nullable().optional(),
  displayText: z.string().trim().max(120).nullable().optional(),
  preparationNote: z.string().trim().max(200).nullable().optional(),
  isOptional: z.boolean().default(false),
  substitute: substituteSchema.nullable().optional(),
});
export type IngredientInput = z.infer<typeof ingredientInputSchema>;

export const instructionInputSchema = z.object({
  lineageId: z.string().min(1).optional(),
  text: z.string().trim().min(1, "Enter an instruction.").max(2000),
});
export type InstructionInput = z.infer<typeof instructionInputSchema>;

export const sectionInputSchema = z.object({
  lineageId: z.string().min(1).optional(),
  // null/empty = unnamed default Section, hidden in display per §9.1.
  name: z.string().trim().max(80).nullable().optional(),
  guidanceNote: z.string().trim().max(500).nullable().optional(),
  ingredients: z.array(ingredientInputSchema),
  instructions: z.array(instructionInputSchema),
});
export type SectionInput = z.infer<typeof sectionInputSchema>;

export const dishContentSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  stage: z.enum(stageValues),
  cuisine: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  yieldQuantity: z.number().gt(0).nullable().optional(),
  yieldUnit: z.string().trim().max(40).nullable().optional(),
  prepTimeMinutes: z.number().int().min(0).nullable().optional(),
  cookTimeMinutes: z.number().int().min(0).nullable().optional(),
  difficulty: z.string().trim().max(40).nullable().optional(),
  sections: z.array(sectionInputSchema),
});
export type DishContentInput = z.infer<typeof dishContentSchema>;

/**
 * §9.5: empty Sections (no ingredients, no instructions — no linked Parts
 * exist yet in Slice 3) are automatically removed at save time, regardless
 * of what the client sends.
 */
export function removeEmptySections(sections: SectionInput[]): SectionInput[] {
  return sections.filter(
    (section) =>
      section.ingredients.length > 0 || section.instructions.length > 0,
  );
}

/**
 * §8.3's minimum-save rule, practical Slice-3 form (linked Parts arrive in
 * a later slice): at least one meaningful local ingredient or instruction
 * must survive empty-Section removal.
 */
export function hasMinimumContent(sections: SectionInput[]): boolean {
  return sections.some(
    (section) =>
      section.ingredients.length > 0 || section.instructions.length > 0,
  );
}

// Gate 2 correction (docs/SLICE_3.md): a Ingredient/Instruction content
// change requires the user to explicitly choose between staying in the
// current major line (a minor bump) or starting a new major Version.
export const versionChoiceValues = ["MINOR", "MAJOR"] as const;
export type VersionChoiceValue = (typeof versionChoiceValues)[number];
export const versionChoiceSchema = z.enum(versionChoiceValues);

function ingredientContentSignature(ingredient: IngredientInput): string {
  const substitute = ingredient.substitute
    ? {
        name: ingredient.substitute.name,
        quantity: ingredient.substitute.quantity ?? null,
        quantityEnd: ingredient.substitute.quantityEnd ?? null,
        isApproximate: ingredient.substitute.isApproximate,
        unit: ingredient.substitute.unit || null,
        displayText: ingredient.substitute.displayText || null,
        preparationNote: ingredient.substitute.preparationNote || null,
      }
    : null;
  return JSON.stringify({
    name: ingredient.name,
    quantity: ingredient.quantity ?? null,
    quantityEnd: ingredient.quantityEnd ?? null,
    isApproximate: ingredient.isApproximate,
    unit: ingredient.unit || null,
    displayText: ingredient.displayText || null,
    preparationNote: ingredient.preparationNote || null,
    isOptional: ingredient.isOptional,
    substitute,
  });
}

function instructionContentSignature(instruction: InstructionInput): string {
  return JSON.stringify({ text: instruction.text });
}

export type VersionContentChange = {
  // Any Ingredient/Instruction add, remove, edit, or reorder — requires the
  // explicit minor/major choice (PRODUCT_SPEC.md's settled Gate 2 rule).
  cookingChanged: boolean;
  // Section add/remove/rename/reorder that does NOT touch any Ingredient
  // or Instruction content — still Version-owned, but auto-minor, no choice.
  sectionOrganizationChanged: boolean;
};

/**
 * Classifies a proposed edit's Sections against the currently-saved
 * Sections (both already in `SectionInput` shape — the caller is
 * responsible for mapping DB rows via `dishToFormValues`-style conversion
 * first). Rows are matched by `lineageId`; a row with no matching
 * `lineageId` in `base` is always treated as a genuine addition. Framework-
 * and DB-agnostic on purpose so both the client (to decide whether to show
 * the minor/major choice dialog) and the server (the actual authority) can
 * run the identical classification — see docs/SLICE_3.md's Gate 2 section.
 */
export function diffVersionContent(
  base: SectionInput[],
  edited: SectionInput[],
): VersionContentChange {
  type Keyed = {
    sectionLineageId: string;
    position: number;
    signature: string;
  };

  const baseIngredients = new Map<string, Keyed>();
  const baseInstructions = new Map<string, Keyed>();
  const baseSectionMeta = new Map<
    string,
    { name: string | null | undefined; guidanceNote: string | null | undefined }
  >();
  const baseSectionOrder: string[] = [];

  for (const section of base) {
    if (!section.lineageId) continue; // every persisted Section has one
    baseSectionOrder.push(section.lineageId);
    baseSectionMeta.set(section.lineageId, {
      name: section.name,
      guidanceNote: section.guidanceNote,
    });
    section.ingredients.forEach((ingredient, index) => {
      if (!ingredient.lineageId) return;
      baseIngredients.set(ingredient.lineageId, {
        sectionLineageId: section.lineageId!,
        position: index,
        signature: ingredientContentSignature(ingredient),
      });
    });
    section.instructions.forEach((instruction, index) => {
      if (!instruction.lineageId) return;
      baseInstructions.set(instruction.lineageId, {
        sectionLineageId: section.lineageId!,
        position: index,
        signature: instructionContentSignature(instruction),
      });
    });
  }

  let cookingChanged = false;
  let sectionOrganizationChanged = false;
  const seenIngredientLineageIds = new Set<string>();
  const seenInstructionLineageIds = new Set<string>();
  const editedSectionOrder: string[] = [];

  for (const section of edited) {
    if (section.lineageId) {
      editedSectionOrder.push(section.lineageId);
      const meta = baseSectionMeta.get(section.lineageId);
      if (
        !meta ||
        (meta.name || null) !== (section.name || null) ||
        (meta.guidanceNote || null) !== (section.guidanceNote || null)
      ) {
        sectionOrganizationChanged = true;
      }
    }

    section.ingredients.forEach((ingredient, index) => {
      if (!ingredient.lineageId) {
        cookingChanged = true; // newly added row
        return;
      }
      seenIngredientLineageIds.add(ingredient.lineageId);
      const before = baseIngredients.get(ingredient.lineageId);
      if (
        !before ||
        before.sectionLineageId !== section.lineageId ||
        before.position !== index ||
        before.signature !== ingredientContentSignature(ingredient)
      ) {
        cookingChanged = true;
      }
    });

    section.instructions.forEach((instruction, index) => {
      if (!instruction.lineageId) {
        cookingChanged = true;
        return;
      }
      seenInstructionLineageIds.add(instruction.lineageId);
      const before = baseInstructions.get(instruction.lineageId);
      if (
        !before ||
        before.sectionLineageId !== section.lineageId ||
        before.position !== index ||
        before.signature !== instructionContentSignature(instruction)
      ) {
        cookingChanged = true;
      }
    });
  }

  for (const id of baseIngredients.keys()) {
    if (!seenIngredientLineageIds.has(id)) cookingChanged = true; // removed
  }
  for (const id of baseInstructions.keys()) {
    if (!seenInstructionLineageIds.has(id)) cookingChanged = true; // removed
  }

  if (baseSectionOrder.length !== editedSectionOrder.length) {
    sectionOrganizationChanged = true;
  } else {
    const filteredBaseOrder = baseSectionOrder.filter((id) =>
      editedSectionOrder.includes(id),
    );
    if (
      JSON.stringify(filteredBaseOrder) !== JSON.stringify(editedSectionOrder)
    ) {
      sectionOrganizationChanged = true;
    }
  }

  return { cookingChanged, sectionOrganizationChanged };
}

export const duplicateDishSchema = z.object({
  dishId: z.string().min(1),
  sourceVersionId: z.string().min(1).optional(),
});

export const restoreDishSchema = z.object({
  dishId: z.string().min(1),
  stage: z.enum(restorableStageValues),
});

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialActionState: ActionState = { status: "idle" };

export type DishActionState = ActionState & { dishId?: string };
export const initialDishActionState: DishActionState = { status: "idle" };
