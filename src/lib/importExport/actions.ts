"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as importExportService from "@/lib/importExport/service";
import {
  proposeImportFromPasteSchema,
  confirmImportSchema,
} from "@/lib/importExport/schema";
import { dishContentSchema, type DishActionState } from "@/lib/dishes/schema";
import type { PasteParseResult } from "@/lib/importExport/paste-parser";
import type { DishContentInput, DishKindValue } from "@/lib/dishes/schema";

export type ProposeImportActionState =
  | { status: "success"; result: PasteParseResult }
  | { status: "error"; message: string };

/**
 * PRODUCT_SPEC.md §56.1 steps 1-3: parse and validate, then hand back a
 * preview — no persistence happens here (§56.1: "Canceling before
 * confirmation creates nothing").
 */
export async function proposeImportFromPaste(
  rawText: string,
): Promise<ProposeImportActionState> {
  try {
    await requireUserId();
    const { rawText: parsed } = proposeImportFromPasteSchema.parse({ rawText });
    const result = importExportService.proposeImportFromPaste(parsed);
    return { status: "success", result };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

/**
 * PRODUCT_SPEC.md §56.1 steps 6-7: the reviewer's confirm action, passed as
 * `DishEditor`'s `onCreate` override so import confirmation reuses the exact
 * same editor/validation/Save flow as ordinary creation — the only
 * difference from `dishes/actions.ts#createDish` is tagging the new Dish's
 * `sourceKind` as `IMPORT` (`importExport/service.ts#confirmImport`).
 */
export async function confirmImport(
  kind: DishKindValue,
  values: DishContentInput,
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { kind: parsedKind } = confirmImportSchema.parse({ kind });
    const input = dishContentSchema.parse(values);

    const dishId = await importExportService.confirmImport(
      userId,
      parsedKind,
      input,
    );

    revalidatePath(parsedKind === "PART" ? "/parts" : "/recipes");
    revalidatePath(
      `${parsedKind === "PART" ? "/parts" : "/recipes"}/${dishId}`,
    );
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
