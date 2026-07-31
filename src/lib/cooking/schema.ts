import { z } from "zod";

/**
 * Slice 7 — Cooking Setup and Cooking Session lifecycle. Zod schemas
 * colocated with `actions.ts`/`service.ts`, per ARCHITECTURE_PROPOSAL.md
 * §K.3. Client-supplied unit selections carry only identifiers, order, and
 * scale numbers — never label/content/quantity text, which the server
 * always re-derives from the persisted Version (PRODUCT_SPEC.md §22.4).
 */

const scaleFactorSchema = z.number().gt(0).nullable();

export const cookingUnitSelectionSchema = z.object({
  unitKey: z.string().min(1),
  scaleFactor: scaleFactorSchema.optional(),
});

export const startCookingSessionSchema = z.object({
  dishId: z.string().min(1),
  dishVersionId: z.string().min(1),
  scaleFactor: scaleFactorSchema.optional(),
  units: z
    .array(cookingUnitSelectionSchema)
    .min(1, "Select at least one Section or Part to cook."),
});
export type StartCookingSessionInput = z.infer<
  typeof startCookingSessionSchema
>;

export const addSessionUnitsSchema = z.object({
  sessionId: z.string().min(1),
  unitKeys: z.array(z.string().min(1)).min(1),
});

export const removeSessionUnitSchema = z.object({
  sessionId: z.string().min(1),
  unitId: z.string().min(1),
});

export const restoreSessionUnitSchema = z.object({
  sessionId: z.string().min(1),
  unitId: z.string().min(1),
});

export const reorderSessionUnitsSchema = z.object({
  sessionId: z.string().min(1),
  orderedUnitIds: z.array(z.string().min(1)).min(1),
});

export const endCookingSessionSchema = z.object({
  sessionId: z.string().min(1),
  outcome: z.enum(["COMPLETED", "ENDED_EARLY"]),
});

export const sessionIdSchema = z.object({ sessionId: z.string().min(1) });

export type ActionState =
  | { status: "success"; message?: string }
  | { status: "error"; message: string };

/**
 * Slice 8 — Cooking Mode: checkoffs, unit completion, mid-session scaling,
 * timers. Same rule as above: client sends only identifiers, booleans, and
 * numbers — never label/content text.
 */

export const toggleChecklistItemSchema = z.object({
  sessionId: z.string().min(1),
  itemId: z.string().min(1),
  checked: z.boolean(),
});

export const setUnitCompletionSchema = z.object({
  sessionId: z.string().min(1),
  unitId: z.string().min(1),
  completed: z.boolean(),
});

export const updateSessionScaleSchema = z.object({
  sessionId: z.string().min(1),
  scaleFactor: scaleFactorSchema,
});

export const updateUnitScaleSchema = z.object({
  sessionId: z.string().min(1),
  unitId: z.string().min(1),
  scaleFactor: scaleFactorSchema,
});

export const createTimerSchema = z.object({
  sessionId: z.string().min(1),
  unitId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  durationSeconds: z
    .number()
    .int()
    .min(1)
    .max(24 * 60 * 60),
});

export const renameTimerSchema = z.object({
  sessionId: z.string().min(1),
  timerId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
});

export const timerIdSchema = z.object({
  sessionId: z.string().min(1),
  timerId: z.string().min(1),
});

export const adjustTimerSchema = z.object({
  sessionId: z.string().min(1),
  timerId: z.string().min(1),
  deltaSeconds: z
    .number()
    .int()
    .refine((v) => v !== 0, "No time change given."),
});
