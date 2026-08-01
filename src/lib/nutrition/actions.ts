"use server";

import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import { env, isFdcConfigured } from "@/lib/env/server";
import {
  searchFdcFoods,
  getFdcFoodDetail,
  FdcTimeoutError,
  FdcRateLimitError,
  FdcUpstreamError,
  FdcShapeError,
} from "@/lib/nutrition/fdc-client";
import type {
  FdcSearchResultItem,
  FdcNutritionDetail,
} from "@/lib/nutrition/fdc-client";

/**
 * BUILD_PLAN.md Slice 13: proxies FDC search/detail lookups server-side
 * only — `FDC_API_KEY` never reaches the client (it's read from `env` here
 * and passed into `fdc-client.ts`, never returned in any response). Every
 * action below requires an authenticated caller before making an upstream
 * request, per the owner's clarification that FDC access must remain
 * server-side and authenticated. Search and selection only ever return data
 * for the client to hold in its own (unsaved) editor form state — neither
 * action here touches a `Dish`/`DishVersion` row.
 */

const NOT_CONFIGURED_MESSAGE = "Nutrition search is not available right now.";

function mapFdcError(error: unknown): string {
  if (error instanceof FdcRateLimitError) {
    return "USDA FoodData Central is temporarily rate-limited. Try again shortly.";
  }
  if (error instanceof FdcTimeoutError) {
    return "USDA FoodData Central took too long to respond. Try again.";
  }
  if (error instanceof FdcShapeError) {
    return "That result couldn't be read. Try a different item, or enter nutrition manually.";
  }
  if (error instanceof FdcUpstreamError) {
    return "USDA FoodData Central is unavailable right now. Try manual entry instead.";
  }
  // AuthorizationError (not signed in), ValidationError (bad input), and
  // any genuinely unexpected error all fall through to the shared mapping
  // every other Server Action in this codebase uses.
  return toActionErrorMessage(error);
}

const searchFdcSchema = z.object({
  query: z.string().trim().min(1, "Enter a food to search for.").max(200),
});

export type SearchFdcActionState =
  | { status: "success"; results: FdcSearchResultItem[] }
  | { status: "error"; message: string };

export async function searchFdc(values: {
  query: string;
}): Promise<SearchFdcActionState> {
  try {
    await requireUserId();
    const { query } = searchFdcSchema.parse(values);

    if (!isFdcConfigured) {
      console.error("[nutrition] FDC_API_KEY is not configured.");
      return { status: "error", message: NOT_CONFIGURED_MESSAGE };
    }

    const result = await searchFdcFoods(env.FDC_API_KEY!, query);
    return { status: "success", results: result.items };
  } catch (error) {
    return { status: "error", message: mapFdcError(error) };
  }
}

const applyFdcResultSchema = z.object({
  fdcId: z.number().int().positive(),
});

export type ApplyFdcResultActionState =
  | { status: "success"; nutrition: FdcNutritionDetail }
  | { status: "error"; message: string };

/**
 * BUILD_PLAN.md Slice 13: fetches one food's full detail and shapes it into
 * the primary-nutrient + basis + More-nutrients payload the editor applies
 * to its (still unsaved) form state — "free to edit while the Version is
 * still unsaved — no persistence yet." Never writes to the database.
 */
export async function applyFdcResult(values: {
  fdcId: number;
}): Promise<ApplyFdcResultActionState> {
  try {
    await requireUserId();
    const { fdcId } = applyFdcResultSchema.parse(values);

    if (!isFdcConfigured) {
      console.error("[nutrition] FDC_API_KEY is not configured.");
      return { status: "error", message: NOT_CONFIGURED_MESSAGE };
    }

    const nutrition = await getFdcFoodDetail(env.FDC_API_KEY!, fdcId);
    return { status: "success", nutrition };
  } catch (error) {
    return { status: "error", message: mapFdcError(error) };
  }
}
