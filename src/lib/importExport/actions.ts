"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as importExportService from "@/lib/importExport/service";
import * as dishMetadata from "@/lib/dishes/dish-metadata";
import {
  proposeImportFromPasteSchema,
  proposeImportFromUrlSchema,
  confirmImportSchema,
} from "@/lib/importExport/schema";
import { dishContentSchema, type DishActionState } from "@/lib/dishes/schema";
import { describeDishContentIssue } from "@/lib/dishes/validation-messages";
import type { PasteParseResult } from "@/lib/importExport/paste-parser";
import type { DishContentInput, DishKindValue } from "@/lib/dishes/schema";

// Task §9: `dishContentSchema.parse`'s raw Zod message ("Too big: expected
// string to have <=200 characters") names no field — replaced with
// `describeDishContentIssue`'s field-specific phrasing (e.g. "Ingredient
// name for ... must be 200 characters or fewer.") whenever the failure came
// from *this* schema specifically, falling back to the generic
// `toActionErrorMessage` for anything else (auth/not-found/other Zod
// schemas in this file, unexpected errors).
function describeImportError(error: unknown, values: DishContentInput): string {
  if (error instanceof z.ZodError && error.issues.length > 0) {
    return describeDishContentIssue(error.issues[0], values);
  }
  return toActionErrorMessage(error);
}

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
 * Website import's propose step: fetches and extracts through the same
 * SSRF-safe boundary as `importExport/service.ts#proposeImportFromUrl` —
 * still no persistence, mirrors `proposeImportFromPaste` above.
 */
export async function proposeImportFromUrl(
  url: string,
): Promise<ProposeImportActionState> {
  try {
    await requireUserId();
    const { url: parsedUrl } = proposeImportFromUrlSchema.parse({ url });
    const outcome = await importExportService.proposeImportFromUrl(parsedUrl);
    return outcome.status === "success"
      ? { status: "success", result: outcome.result }
      : { status: "error", message: outcome.message };
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
 * `sourceLabel` (optional, defaults to "Pasted text") lets each import
 * source — paste, file upload, website — record which one produced this
 * Dish; callers with a closure over the active source (e.g. the uploaded
 * file's name, or the imported URL) pass it in without changing
 * `DishEditor`'s own `onCreate` contract.
 */
export async function confirmImport(
  kind: DishKindValue,
  values: DishContentInput,
  sourceLabel?: string,
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { kind: parsedKind } = confirmImportSchema.parse({ kind });
    const input = dishContentSchema.parse(values);

    const dishId = await importExportService.confirmImport(
      userId,
      parsedKind,
      input,
      sourceLabel,
    );

    revalidatePath(parsedKind === "PART" ? "/parts" : "/recipes");
    revalidatePath(
      `${parsedKind === "PART" ? "/parts" : "/recipes"}/${dishId}`,
    );
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: describeImportError(error, values) };
  }
}

export type BulkImportMetadataRef = { id: string; displayName: string };

export type BulkImportItemInput = {
  // Round-trips back to the caller so the client can match each result to
  // its source row without relying on array order surviving unmodified.
  sourceRef: string;
  kind: DishKindValue;
  values: DishContentInput;
  sourceLabel?: string;
  // Source-metadata mapping (task §5): Tags/Flavor profiles aren't part of
  // `dishContentSchema` (they're separate join tables, set the same way
  // `DishTagFlavorEditor` sets them post-create), so a mapped-category
  // draft carries them here instead — applied via `dishMetadata.setDishTags`
  // /`setDishFlavorProfiles` right after this item's Dish is created.
  // `displayName` rides along only to build a human-readable warning if
  // attachment fails (see `BulkImportItemResult.metadataWarnings`).
  tags?: BulkImportMetadataRef[];
  flavorProfiles?: BulkImportMetadataRef[];
};

export type BulkImportItemResult =
  | {
      sourceRef: string;
      status: "success";
      dishId: string;
      // Metadata-mapping follow-up (docs/importer-live-qa-polish-report.md):
      // the Dish itself saved successfully — these are requested Tags/Flavor
      // profiles that couldn't be attached. Kept out of `status: "error"`
      // because retrying the whole item would create a duplicate Dish.
      metadataWarnings?: string[];
    }
  | { sourceRef: string; status: "error"; message: string };

function describeMetadataFailure(
  label: "Tag" | "Flavor profile",
  refs: BulkImportMetadataRef[],
): string {
  const plural = refs.length === 1 ? label : `${label}s`;
  const names = refs.map((ref) => `"${ref.displayName}"`).join(", ");
  return `${plural} ${names} could not be applied.`;
}

/**
 * The batch importer's confirm step: one browser → server call for an
 * entire `.rga` (or future multi-item source) batch, replacing what used to
 * be one `confirmImport` call per selected draft. Each item carries its own
 * explicit Recipe/Part `kind` (task: never inferred) and is persisted
 * through the exact same `importExportService.confirmImport` single-item
 * path every other import source already uses — no parallel creation
 * logic, no `isPart` mechanism. Processed sequentially (not
 * `Promise.all`) so one item's failure can never take down items after it,
 * and so this stays a plain request/response call rather than needing any
 * job/queue infrastructure.
 */
export async function confirmImportBatch(
  items: BulkImportItemInput[],
): Promise<BulkImportItemResult[]> {
  const userId = await requireUserId();
  const results: BulkImportItemResult[] = [];
  let touchedRecipes = false;
  let touchedParts = false;

  for (const item of items) {
    try {
      const { kind: parsedKind } = confirmImportSchema.parse({
        kind: item.kind,
      });
      const input = dishContentSchema.parse(item.values);
      const dishId = await importExportService.confirmImport(
        userId,
        parsedKind,
        input,
        item.sourceLabel,
      );
      // Task §5: mapped Tags/Flavor profiles aren't part of the Dish's own
      // content — set the same way the ordinary editor's Tags & Flavors
      // popover does, right after this item's Dish exists. A metadata
      // attachment failure never turns this item's result into "error" —
      // the Dish itself was created successfully; it's carried back as a
      // `metadataWarnings` entry on the success result instead, since
      // retrying the whole item would create a duplicate Dish.
      const metadataWarnings: string[] = [];
      if (item.tags?.length) {
        try {
          await dishMetadata.setDishTags(
            userId,
            dishId,
            parsedKind,
            item.tags.map((tag) => tag.id),
          );
        } catch (metadataError) {
          console.error(
            "[confirmImportBatch] Could not apply mapped tags:",
            metadataError,
          );
          metadataWarnings.push(describeMetadataFailure("Tag", item.tags));
        }
      }
      if (item.flavorProfiles?.length) {
        try {
          await dishMetadata.setDishFlavorProfiles(
            userId,
            dishId,
            parsedKind,
            item.flavorProfiles.map((profile) => profile.id),
          );
        } catch (metadataError) {
          console.error(
            "[confirmImportBatch] Could not apply mapped flavor profiles:",
            metadataError,
          );
          metadataWarnings.push(
            describeMetadataFailure("Flavor profile", item.flavorProfiles),
          );
        }
      }
      if (parsedKind === "PART") touchedParts = true;
      else touchedRecipes = true;
      results.push({
        sourceRef: item.sourceRef,
        status: "success",
        dishId,
        ...(metadataWarnings.length ? { metadataWarnings } : {}),
      });
    } catch (error) {
      results.push({
        sourceRef: item.sourceRef,
        status: "error",
        message: describeImportError(error, item.values),
      });
    }
  }

  if (touchedRecipes) revalidatePath("/recipes");
  if (touchedParts) revalidatePath("/parts");

  return results;
}
