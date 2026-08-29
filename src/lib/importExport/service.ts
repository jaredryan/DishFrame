import "server-only";
import {
  parsePastedRecipe,
  type PasteParseResult,
} from "@/lib/importExport/paste-parser";
import {
  proposeImportFromUrl as fetchAndProposeFromUrl,
  type WebsiteImportResult,
} from "@/lib/importExport/website-import";
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

// Website import: fetches the given URL through the SSRF-safe `url-fetch.ts`
// boundary and extracts Schema.org Recipe JSON-LD (website-import.ts) —
// still no persistence, same as `proposeImportFromPaste` above.
export async function proposeImportFromUrl(
  url: string,
): Promise<WebsiteImportResult> {
  return fetchAndProposeFromUrl(url);
}

// Recipe Gallery (.rga) import has no propose step here: a real export can
// be ~28MB, well past Next's Server Action body limit and Vercel Functions'
// own payload ceiling, so extraction (recipe-gallery-import.ts) runs
// entirely client-side (file-sources.ts#extractRecipesFromArchiveFile) —
// the raw archive is never uploaded.

export async function confirmImport(
  ownerId: string,
  kind: DishKindValue,
  input: DishContentInput,
  // Distinguishes which import source produced this Dish (Pasted text /
  // Uploaded file: <name> / the source URL) — defaults to the original
  // paste-only label so every existing caller is unaffected.
  sourceTitle?: string,
): Promise<string> {
  return dishService.createDish(ownerId, kind, input, {
    title: sourceTitle ?? "Pasted text",
  });
}
