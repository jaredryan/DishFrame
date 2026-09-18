"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import {
  toActionErrorMessage,
  ActiveSessionConflictError,
  FinalUnitGuardError,
} from "@/lib/errors";
import * as cookingService from "@/lib/cooking/service";
import {
  listCookablePickerItems as queryCookablePickerItems,
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  listDishVersionSummaries,
  type CookablePickerItem,
} from "@/lib/dishes/queries";
import { buildCookableUnits } from "@/lib/cooking/queries";
import {
  consolidateSources,
  suggestConsolidatedOrder,
} from "@/lib/cooking/consolidation";
import {
  toConsolidatedSetupUnits,
  type ConsolidatedSetupUnit,
} from "@/lib/cooking/setup-units";
import type { VersionOption } from "@/components/domain/dish/version-picker";
import { versionLabel } from "@/lib/dishes/version-note";
import { decimalToNumber } from "@/lib/dishes/format";
import {
  startCookingSessionSchema,
  startMultiSourceCookingSessionSchema,
  addSessionUnitsSchema,
  removeSessionUnitSchema,
  restoreSessionUnitSchema,
  reorderSessionUnitsSchema,
  endCookingSessionSchema,
  sessionIdSchema,
  toggleChecklistItemSchema,
  setUnitCompletionSchema,
  updateSessionScaleSchema,
  updateUnitScaleSchema,
  updateSourceScaleSchema,
  createTimerSchema,
  renameTimerSchema,
  timerIdSchema,
  adjustTimerSchema,
  type ActionState,
} from "@/lib/cooking/schema";

const SESSIONS_PATH = "/cook";

function revalidateSession(sessionId?: string) {
  revalidatePath(SESSIONS_PATH);
  if (sessionId) revalidatePath(`${SESSIONS_PATH}/${sessionId}`);
}

export type ListCookablePickerItemsActionState =
  | { status: "success"; items: CookablePickerItem[] }
  | { status: "error"; message: string };

/**
 * Fresh every call, never cached — the "What will you cook?" picker
 * (Home dashboard / Cook page) fetches this each time it opens, same
 * convention as `sections/actions.ts`'s `listAttachableParts`.
 */
export async function listCookablePickerItems(): Promise<ListCookablePickerItemsActionState> {
  try {
    const userId = await requireUserId();
    const items = await queryCookablePickerItems(userId);
    return { status: "success", items };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type StartCookingSessionActionState =
  | { status: "success"; sessionId: string }
  | { status: "conflict"; message: string; existingSessionId: string | null }
  | { status: "error"; message: string };

export async function startCookingSession(values: {
  dishId: string;
  dishVersionId: string;
  scaleFactor?: number | null;
  units: Array<{ unitKey: string; scaleFactor?: number | null }>;
}): Promise<StartCookingSessionActionState> {
  try {
    const userId = await requireUserId();
    const input = startCookingSessionSchema.parse(values);

    const session = await cookingService.startCookingSession(userId, input);

    revalidateSession(session.id);
    return { status: "success", sessionId: session.id };
  } catch (error) {
    if (error instanceof ActiveSessionConflictError) {
      return {
        status: "conflict",
        message: error.message,
        existingSessionId: error.existingSessionId,
      };
    }
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type MultiSourceSetupSourceDto = {
  dishId: string;
  dishKind: "RECIPE" | "PART";
  dishTitle: string;
  dishVersionId: string;
  versionLabel: string;
  isCurrent: boolean;
  currentVersionId: string | null;
  versions: VersionOption[];
  outputQuantity: number | null;
  outputUnit: string | null;
};

export type GetMultiSourceSetupDataActionState =
  | {
      status: "success";
      sources: MultiSourceSetupSourceDto[];
      units: ConsolidatedSetupUnit[];
    }
  | { status: "error"; message: string };

/**
 * Backs the new multi-source Cooking Setup screen the generic Start Cooking
 * picker hands off to (owner spec, 2026-09-17) — re-derives each selected
 * source's own content and the consolidated combined-order list fresh on
 * every call, same "never trusted from the client" rule as
 * `buildCookableUnits` itself. `dishVersionId` is optional per source (the
 * picker's Step 1 selects only a Recipe/Part; Step 2 picks its Version) —
 * omitted, it defaults to that Dish's own current Version.
 */
export async function getMultiSourceSetupData(values: {
  sources: Array<{ dishId: string; dishVersionId?: string | null }>;
}): Promise<GetMultiSourceSetupDataActionState> {
  try {
    const userId = await requireUserId();
    if (values.sources.length === 0) {
      return {
        status: "error",
        message: "Select at least one Recipe or Part.",
      };
    }

    const resolved = await Promise.all(
      values.sources.map(async (s) => {
        const dish = await getOwnedDishOrThrow(userId, s.dishId);
        const targetVersionId = s.dishVersionId || dish.currentVersionId;
        if (!targetVersionId) {
          throw new Error(
            `${dish.currentTitle ?? "This item"} has no saved Version.`,
          );
        }
        const [version, versions] = await Promise.all([
          getDishScopedVersionContentOrThrow(s.dishId, targetVersionId),
          listDishVersionSummaries(s.dishId),
        ]);
        return { dish, version, versions };
      }),
    );

    const cookableUnitsPerSource = await Promise.all(
      resolved.map(({ dish, version }) =>
        buildCookableUnits(userId, dish, version),
      ),
    );

    const sources: MultiSourceSetupSourceDto[] = resolved.map(
      ({ dish, version, versions }) => ({
        dishId: dish.id,
        dishKind: dish.kind,
        dishTitle: dish.currentTitle || "Untitled",
        dishVersionId: version.id,
        versionLabel: versionLabel(version.majorVersion, version.minorVersion),
        isCurrent: version.id === dish.currentVersionId,
        currentVersionId: dish.currentVersionId,
        versions,
        outputQuantity: decimalToNumber(version.yieldQuantity),
        outputUnit: version.yieldUnit,
      }),
    );

    const consolidated = consolidateSources(
      cookableUnitsPerSource.map((cookableUnits) => ({
        cookableUnits,
        scaleFactor: null,
      })),
    );
    const units = toConsolidatedSetupUnits(
      suggestConsolidatedOrder(consolidated),
      sources.map((s) => s.dishTitle),
    );

    return { status: "success", sources, units };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function startMultiSourceCookingSession(values: {
  sources: Array<{
    dishId: string;
    dishVersionId: string;
    scaleFactor?: number | null;
  }>;
  units: Array<{ mergeKey: string; scaleFactor?: number | null }>;
}): Promise<StartCookingSessionActionState> {
  try {
    const userId = await requireUserId();
    const input = startMultiSourceCookingSessionSchema.parse(values);

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      input,
    );

    revalidateSession(session.id);
    return { status: "success", sessionId: session.id };
  } catch (error) {
    if (error instanceof ActiveSessionConflictError) {
      return {
        status: "conflict",
        message: error.message,
        existingSessionId: error.existingSessionId,
      };
    }
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type EditPlanActionState =
  | { status: "success" }
  | { status: "final-unit-guard"; sessionId: string }
  | { status: "error"; message: string };

export async function addSessionUnits(values: {
  sessionId: string;
  unitKeys: string[];
}): Promise<EditPlanActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, unitKeys } = addSessionUnitsSchema.parse(values);

    await cookingService.addSessionUnits(userId, sessionId, unitKeys);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function removeSessionUnit(values: {
  sessionId: string;
  unitId: string;
}): Promise<EditPlanActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, unitId } = removeSessionUnitSchema.parse(values);

    await cookingService.removeSessionUnit(userId, sessionId, unitId);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    if (error instanceof FinalUnitGuardError) {
      return { status: "final-unit-guard", sessionId: values.sessionId };
    }
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function restoreSessionUnit(values: {
  sessionId: string;
  unitId: string;
}): Promise<EditPlanActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, unitId } = restoreSessionUnitSchema.parse(values);

    await cookingService.restoreSessionUnit(userId, sessionId, unitId);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function reorderSessionUnits(values: {
  sessionId: string;
  orderedUnitIds: string[];
}): Promise<EditPlanActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, orderedUnitIds } =
      reorderSessionUnitsSchema.parse(values);

    await cookingService.reorderSessionUnits(userId, sessionId, orderedUnitIds);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function endCookingSession(values: {
  sessionId: string;
  outcome: "COMPLETED" | "ENDED_EARLY";
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, outcome } = endCookingSessionSchema.parse(values);

    await cookingService.endCookingSession(userId, sessionId, outcome);

    revalidateSession(sessionId);
    return {
      status: "success",
      message: outcome === "COMPLETED" ? "Session finished." : "Session ended.",
    };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteCookingSession(values: {
  sessionId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId } = sessionIdSchema.parse(values);

    await cookingService.deleteCookingSession(userId, sessionId);

    revalidatePath(SESSIONS_PATH);
    return { status: "success", message: "Session deleted." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

// ============================================================================
// Slice 8 — checkoffs, unit completion, mid-session scaling, timers
// ============================================================================

export async function toggleChecklistItem(values: {
  sessionId: string;
  itemId: string;
  checked: boolean;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, itemId, checked } =
      toggleChecklistItemSchema.parse(values);

    await cookingService.toggleChecklistItem(
      userId,
      sessionId,
      itemId,
      checked,
    );

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function setUnitCompletion(values: {
  sessionId: string;
  unitId: string;
  completed: boolean;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, unitId, completed } =
      setUnitCompletionSchema.parse(values);

    await cookingService.setUnitCompletion(
      userId,
      sessionId,
      unitId,
      completed,
    );

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function updateSessionScale(values: {
  sessionId: string;
  scaleFactor: number | null;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, scaleFactor } = updateSessionScaleSchema.parse(values);

    await cookingService.updateSessionScale(userId, sessionId, scaleFactor);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function updateUnitScale(values: {
  sessionId: string;
  unitId: string;
  scaleFactor: number | null;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, unitId, scaleFactor } =
      updateUnitScaleSchema.parse(values);

    await cookingService.updateUnitScale(
      userId,
      sessionId,
      unitId,
      scaleFactor,
    );

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function updateSourceScale(values: {
  sessionId: string;
  sourceId: string;
  scaleFactor: number | null;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, sourceId, scaleFactor } =
      updateSourceScaleSchema.parse(values);

    await cookingService.updateSourceScale(
      userId,
      sessionId,
      sourceId,
      scaleFactor,
    );

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function createTimer(values: {
  sessionId: string;
  unitId: string;
  name: string;
  durationSeconds: number;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, unitId, name, durationSeconds } =
      createTimerSchema.parse(values);

    await cookingService.createTimer(
      userId,
      sessionId,
      unitId,
      name,
      durationSeconds,
    );

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function renameTimer(values: {
  sessionId: string;
  timerId: string;
  name: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, timerId, name } = renameTimerSchema.parse(values);

    await cookingService.renameTimer(userId, sessionId, timerId, name);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function startTimer(values: {
  sessionId: string;
  timerId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, timerId } = timerIdSchema.parse(values);

    await cookingService.startTimer(userId, sessionId, timerId);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function pauseTimer(values: {
  sessionId: string;
  timerId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, timerId } = timerIdSchema.parse(values);

    await cookingService.pauseTimer(userId, sessionId, timerId);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function resetTimer(values: {
  sessionId: string;
  timerId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, timerId } = timerIdSchema.parse(values);

    await cookingService.resetTimer(userId, sessionId, timerId);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function adjustTimer(values: {
  sessionId: string;
  timerId: string;
  deltaSeconds: number;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, timerId, deltaSeconds } =
      adjustTimerSchema.parse(values);

    await cookingService.adjustTimer(userId, sessionId, timerId, deltaSeconds);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function dismissTimer(values: {
  sessionId: string;
  timerId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, timerId } = timerIdSchema.parse(values);

    await cookingService.dismissTimer(userId, sessionId, timerId);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
