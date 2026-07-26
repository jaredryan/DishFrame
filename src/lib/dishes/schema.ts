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
