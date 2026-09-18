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

/**
 * Multi-source Cooking Sessions (owner spec, 2026-09-17) — the generic
 * Start Cooking picker's two-step multi-select flow lands here. `sources`
 * mirrors `startCookingSessionSchema`'s single dishId/dishVersionId/
 * scaleFactor per selected top-level Recipe/Part; `units` selects from the
 * *consolidated* set (see lib/cooking/consolidation.ts) by `mergeKey`, never
 * a per-source unitKey — a shared Part is one entry here regardless of how
 * many sources contribute to it.
 */
export const cookingSourceInputSchema = z.object({
  dishId: z.string().min(1),
  dishVersionId: z.string().min(1),
  scaleFactor: scaleFactorSchema.optional(),
});

export const consolidatedUnitSelectionSchema = z.object({
  mergeKey: z.string().min(1),
  scaleFactor: scaleFactorSchema.optional(),
});

export const startMultiSourceCookingSessionSchema = z.object({
  sources: z
    .array(cookingSourceInputSchema)
    .min(1, "Select at least one Recipe or Part to cook."),
  units: z
    .array(consolidatedUnitSelectionSchema)
    .min(1, "Select at least one Section or Part to cook."),
});
export type StartMultiSourceCookingSessionInput = z.infer<
  typeof startMultiSourceCookingSessionSchema
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

// Multi-source Cooking Sessions completion pass (2026-09-18) — live
// per-source rescale, the multi-source counterpart to
// updateSessionScaleSchema above.
export const updateSourceScaleSchema = z.object({
  sessionId: z.string().min(1),
  sourceId: z.string().min(1),
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
