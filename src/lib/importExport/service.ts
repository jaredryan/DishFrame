import "server-only";
import {
  parsePastedRecipe,
  type PasteParseResult,
} from "@/lib/importExport/paste-parser";
import * as dishService from "@/lib/dishes/service";
import type { DishContentInput, DishKindValue } from "@/lib/dishes/schema";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) — see
 * src/lib/tasters/service.ts for the same rationale.
 *
 * PRODUCT_SPEC.md §56.1's mandatory-review flow: `proposeImportFromPaste`
 * (parse and validate → preview) is a pure, no-persistence function —
 * nothing is created until `confirmImport` runs, and canceling before that
 * call creates nothing. `confirmImport` never reimplements creation; it
 * funnels straight into the same `dishes/service.ts#createDish` every
 * ordinary Recipe/Part save uses, only tagging `sourceKind: "IMPORT"` so the
 * created Dish records where it came from (ARCHITECTURE_PROPOSAL.md §L's
 * "none of them are permitted to call the Dish-creation service directly"
 * — read literally: they call it exactly the same way everything else does).
 */

export function proposeImportFromPaste(rawText: string): PasteParseResult {
  return parsePastedRecipe(rawText);
}

export async function confirmImport(
  ownerId: string,
  kind: DishKindValue,
  input: DishContentInput,
): Promise<string> {
  return dishService.createDish(ownerId, kind, input, {
    title: "Pasted text",
  });
}
