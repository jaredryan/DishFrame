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
  startCookingSessionSchema,
  addSessionUnitsSchema,
  removeSessionUnitSchema,
  restoreSessionUnitSchema,
  reorderSessionUnitsSchema,
  endCookingSessionSchema,
  sessionIdSchema,
  type ActionState,
} from "@/lib/cooking/schema";

const SESSIONS_PATH = "/cook";

function revalidateSession(sessionId?: string) {
  revalidatePath(SESSIONS_PATH);
  if (sessionId) revalidatePath(`${SESSIONS_PATH}/${sessionId}`);
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
