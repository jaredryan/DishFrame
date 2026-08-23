import { z } from "zod";

// PRODUCT_SPEC.md §76-81 — Meal Plans, planned meals, and Meal-Plan-linked
// grocery generation.

export const mealPlanIdSchema = z.object({ mealPlanId: z.string().min(1) });
export const entryIdSchema = mealPlanIdSchema.extend({
  entryId: z.string().min(1),
});
export const plannedMealIdSchema = entryIdSchema.extend({
  plannedMealId: z.string().min(1),
});

const titleField = z
  .string()
  .trim()
  .min(1, "Enter a title for this Meal Plan.")
  .max(120);

export const createMealPlanSchema = z
  .object({
    title: titleField,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  });

export const updateMealPlanSchema = z
  .object({
    mealPlanId: z.string().min(1),
    title: titleField.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  });

export const duplicateMealPlanSchema = z
  .object({
    mealPlanId: z.string().min(1),
    title: titleField,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  });

const targetYieldQuantity = z
  .number()
  .gt(0, "That amount must be greater than zero.")
  .lte(100000, "That amount is too large.")
  .nullable()
  .optional();

export const addMealPlanEntrySchema = mealPlanIdSchema.extend({
  dishId: z.string().min(1),
  // Explicit Version choice from the Add/Edit meal modal — defaults to the
  // Dish's current Version when omitted.
  dishVersionId: z.string().min(1).optional(),
  cookDate: z.coerce.date(),
  targetYieldQuantity,
  targetYieldUnit: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const updateMealPlanEntrySchema = entryIdSchema.extend({
  cookDate: z.coerce.date().optional(),
  targetYieldQuantity,
  targetYieldUnit: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const entryStatusValues = ["PLANNED", "COOKED", "SKIPPED"] as const;
export type EntryStatusValue = (typeof entryStatusValues)[number];

export const setMealPlanEntryStatusSchema = entryIdSchema.extend({
  status: z.enum(entryStatusValues),
});

export const adoptNewerVersionInEntrySchema = entryIdSchema.extend({
  targetVersionId: z.string().min(1).optional(),
});

export const addPlannedMealSchema = entryIdSchema.extend({
  label: z.string().trim().min(1, "Enter a label.").max(80),
  date: z.coerce.date(),
  servings: z
    .number()
    .gt(0, "Servings must be greater than zero.")
    .lte(1000, "That amount is too large."),
});

export const removePlannedMealSchema = plannedMealIdSchema;

export const generateGroceryListFromMealPlanSchema = mealPlanIdSchema.extend({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title for this grocery list.")
    .max(120),
  entryIds: z.array(z.string().min(1)).optional(),
});

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};
export const initialActionState: ActionState = { status: "idle" };

export type PlannedMealDto = {
  id: string;
  label: string;
  date: string;
  servings: number;
};

export type MealPlanEntryDto = {
  id: string;
  dishId: string | null;
  dishVersionId: string | null;
  dishKind: "RECIPE" | "PART";
  title: string;
  versionLabel: string;
  cookDate: string;
  targetYieldQuantity: number | null;
  targetYieldUnit: string | null;
  note: string | null;
  status: EntryStatusValue | "IN_PROGRESS";
  linkedSessionId: string | null;
  plannedMeals: PlannedMealDto[];
};

export type LinkedGroceryListDto = {
  id: string;
  title: string;
  mode: "STANDALONE" | "MEAL_PLAN_LINKED";
  completedAt: string | null;
};

export type MealPlanDetailDto = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  entries: MealPlanEntryDto[];
  linkedGroceryLists: LinkedGroceryListDto[];
};

export type MealPlanSummaryDto = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  entryCount: number;
};
