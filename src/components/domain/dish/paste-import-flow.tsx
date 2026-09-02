"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BatchProgressDialog } from "@/components/ui/batch-progress";
import { useToast } from "@/components/ui/toast";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { FileDropzone } from "@/components/domain/dish/file-dropzone";
import {
  proposeImportFromPaste,
  proposeImportFromUrl,
  confirmImport,
  confirmImportBatch,
  type BulkImportItemInput,
  type BulkImportItemResult,
  type BulkImportMetadataRef,
} from "@/lib/importExport/actions";
import {
  SUPPORTED_IMPORT_FILE_EXTENSIONS,
  extractTextFromImportFile,
  extractRecipesFromArchiveFile,
  extractDishFromJsonFile,
  getImportFileKind,
} from "@/lib/importExport/file-sources";
import type { PasteParseResult } from "@/lib/importExport/paste-parser";
import type { ArchiveImportDraft } from "@/lib/importExport/recipe-gallery-import";
import { validateDishContentForPersistence } from "@/lib/dishes/validation-messages";
import { createTag } from "@/lib/tags/actions";
import { initialCreateTagActionState } from "@/lib/tags/schema";
import { createFlavorProfile } from "@/lib/flavor-profiles/actions";
import { initialCreateFlavorProfileActionState } from "@/lib/flavor-profiles/schema";
import { createCuisine } from "@/lib/cuisines/actions";
import { initialCreateCuisineActionState } from "@/lib/cuisines/schema";
import type {
  DishActionState,
  DishContentInput,
  DishKindValue,
} from "@/lib/dishes/schema";

const ARCHIVE_SOURCE_LABEL_MAX_LENGTH = 200;
// Task §3: keeps each `confirmImportBatch` Server Action call's sequential
// persistence work well under a typical serverless function's execution
// time ceiling for a large (e.g. 65-recipe) archive, without going as far
// as one call per item — see `runChunkedConfirm` below.
const BULK_IMPORT_CHUNK_SIZE = 15;

type ImportMethod = "paste" | "upload" | "website";

const METHOD_LABEL: Record<ImportMethod, string> = {
  paste: "Paste text",
  upload: "Upload file",
  website: "Import from website",
};

type OkArchiveDraft = Extract<ArchiveImportDraft, { status: "ok" }>;

export type ImportTagOption = { id: string; displayName: string };
export type ImportFlavorProfileOption = { id: string; displayName: string };
export type ImportCuisineOption = { id: string; displayName: string };

// Source-metadata mapping (task §5): what to do with one discovered Recipe
// Gallery `Category` value. A "cuisine" mapping is applied directly as the
// category text, resolved to a real Cuisine (get-or-create, same
// normalized-name dedup as Tag/Flavor profile) only at actual commit time
// (`resolveMetadataMappingsForCommit`) — it never gets its own create/
// existing sub-picker the way Tag/Flavor profile mappings do below, since
// there's exactly one Cuisine guess per item rather than an ambiguous
// multi-way choice. Tag/Flavor profile mappings resolve to a real id —
// either an existing one the user picked, or one this pass creates via the
// exact same `createTag`/`createFlavorProfile` actions Settings' Tag/
// Flavor-profile managers use (same normalized-name dedup, so re-resolving
// is always safe).
type CategoryMapping =
  | { target: "ignore" }
  | { target: "cuisine" }
  | { target: "tag"; selection: string } // "create" | `existing:${id}`
  | { target: "flavorProfile"; selection: string };

// Task §12: one row of the results page's "Classifications" report — what
// happened to one source classification this commit (the initial Import or
// a later Retry), merged across commits by `mergeClassificationOutcomes`.
type ClassificationOutcome = {
  category: string;
  target: "cuisine" | "tag" | "flavorProfile";
  action: "created" | "reused" | "applied";
  displayName: string;
  appliedCount: number;
};

function mergeClassificationOutcomes(
  prev: ClassificationOutcome[],
  next: ClassificationOutcome[],
): ClassificationOutcome[] {
  const byKey = new Map(
    prev.map((outcome) => [`${outcome.target}:${outcome.category}`, outcome]),
  );
  for (const outcome of next) {
    const key = `${outcome.target}:${outcome.category}`;
    const existing = byKey.get(key);
    byKey.set(key, {
      ...outcome,
      appliedCount: (existing?.appliedCount ?? 0) + outcome.appliedCount,
      action: existing?.action === "created" ? "created" : outcome.action,
    });
  }
  return [...byKey.values()];
}

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase();
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// Task §6 copy shapes: "Imported 61 Recipes and 4 Parts." for a fully
// successful mixed batch, sensitive to which of Recipe/Part were actually
// present.
function buildFullSuccessSummary(recipes: number, parts: number): string {
  const segments: string[] = [];
  if (recipes > 0) segments.push(pluralize(recipes, "Recipe", "Recipes"));
  if (parts > 0) segments.push(pluralize(parts, "Part", "Parts"));
  if (segments.length === 0) return "Nothing was imported.";
  if (segments.length === 1) return `Imported ${segments[0]}.`;
  return `Imported ${segments[0]} and ${segments[1]}.`;
}

// Import QA polish pass §9/§11: the results page's top-of-page headline
// summary — lowercase, Recipe/Part-aware (never assumes every success was a
// Recipe), counts computed fresh from the live `batchResults` map at
// render time.
function buildResultsHeadline(
  recipes: number,
  parts: number,
  failed: number,
): string {
  const segments: string[] = [];
  if (recipes > 0) segments.push(pluralize(recipes, "recipe", "recipes"));
  if (parts > 0) segments.push(pluralize(parts, "part", "parts"));
  const subject =
    segments.length === 0
      ? "Nothing"
      : segments.length === 1
        ? segments[0]
        : `${segments[0]} and ${segments[1]}`;
  const verb = recipes + parts === 1 || subject === "Nothing" ? "was" : "were";
  if (failed === 0) return `${subject} ${verb} imported.`;
  return `${subject} ${verb} imported. ${pluralize(failed, "item", "items")} failed to import.`;
}

/**
 * PRODUCT_SPEC.md §56.1's mandatory-review flow, §59's paste-and-review
 * import: whichever of the three input methods runs (paste text, upload a
 * file, import from a website URL), it converges on the exact same
 * `PasteParseResult` shape (`importExport/paste-parser.ts`'s
 * `buildParseResult`) and the exact same review/confirm step below — the
 * ordinary `DishEditor`, pre-filled with the proposal, so import
 * confirmation is the same validated Save path every other Recipe/Part
 * creation goes through (`confirmImport`, which only additionally tags
 * `sourceKind: "IMPORT"` and a source-specific label).
 *
 * Importer live-QA polish pass: this file additionally covers the
 * drag-and-drop upload control, the Needs-review/Ready-to-import batch
 * grouping, source-category-to-metadata mapping, batch-review
 * navigation/"Finish review" semantics, bulk-import preflight validation
 * and chunk-based progress, and the post-import Results/Failed/Added
 * screen with a retry lifecycle — see
 * docs/importer-live-qa-polish-report.md for the full design rationale.
 */
export function PasteImportFlow({
  kind = "RECIPE",
  cuisineOptions: initialCuisineOptions,
  tagOptions: initialTagOptions = [],
  flavorProfileOptions: initialFlavorProfileOptions = [],
}: {
  kind?: DishKindValue;
  cuisineOptions: ImportCuisineOption[];
  tagOptions?: ImportTagOption[];
  flavorProfileOptions?: ImportFlavorProfileOption[];
}) {
  const { showToast } = useToast();
  const kindLabel = kind === "PART" ? "Part" : "recipe";
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";
  const basePath = kind === "PART" ? "/parts" : "/recipes";

  const [method, setMethod] = React.useState<ImportMethod>("paste");
  const [rawText, setRawText] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [urlValue, setUrlValue] = React.useState("");
  const [isParsing, setIsParsing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [parseResult, setParseResult] = React.useState<PasteParseResult | null>(
    null,
  );
  // Set alongside `parseResult` so the confirm step can attribute the
  // created Dish to whichever source actually produced it — undefined for
  // Paste text, which keeps `confirmImport`'s original "Pasted text" default.
  const [sourceLabel, setSourceLabel] = React.useState<string | undefined>(
    undefined,
  );
  const [originalText, setOriginalText] = React.useState<string | null>(null);
  const [showOriginal, setShowOriginal] = React.useState(false);

  // Single-item import Save confirmation (task §3, prior pass): resolves
  // the promise `DishEditor`'s `confirmCreateTargetAction` hands back —
  // `null` when the user cancels. Never used for a batch-item Review save.
  const [saveTargetResolver, setSaveTargetResolver] = React.useState<
    ((choice: DishKindValue | null) => void) | null
  >(null);

  // Recipe Gallery (.rga) batch import state — a `.rga` can contain an
  // entire recipe library, so it converges on this list/selection/
  // classification screen instead of jumping straight to the single-recipe
  // review step.
  const [batchDrafts, setBatchDrafts] = React.useState<
    ArchiveImportDraft[] | null
  >(null);
  const [batchSelection, setBatchSelection] = React.useState<Set<number>>(
    new Set(),
  );
  // Per-row Recipe/Part classification — every successfully parsed row
  // defaults to Recipe; only present for "ok" rows.
  const [batchDraftKinds, setBatchDraftKinds] = React.useState<
    Map<number, DishKindValue>
  >(new Map());
  // Which row (if any) is open in the shared review step below. Reviewing a
  // batch row reuses that exact same `DishEditor` review UI, but Save there
  // only updates the pending draft in memory and returns here — it never
  // persists or navigates away.
  const [batchReviewIndex, setBatchReviewIndex] = React.useState<number | null>(
    null,
  );
  const [batchImporting, setBatchImporting] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState(0);
  const [batchResults, setBatchResults] = React.useState<Map<
    number,
    BulkImportItemResult
  > | null>(null);
  const [collapsedFailedIndices, setCollapsedFailedIndices] = React.useState<
    Set<number>
  >(new Set());
  // Task §4: indices whose batch Review was opened and finished ("Finish
  // review") at least once — drives the orange "Needs review" → green
  // "Reviewed" badge swap and that row's move to the bottom of its group.
  const [reviewedIndices, setReviewedIndices] = React.useState<Set<number>>(
    new Set(),
  );
  // Task §12: accumulated across the initial Import and any later Retry —
  // see `mergeClassificationOutcomes`.
  const [classificationOutcomes, setClassificationOutcomes] = React.useState<
    ClassificationOutcome[]
  >([]);
  const [classificationWarnings, setClassificationWarnings] = React.useState<
    string[]
  >([]);

  // Task §4: tracked so "Discard import" only confirms when there's real
  // pending work to lose (a reviewed draft, a reclassification, or a
  // metadata mapping) — not on every "Start over" click.
  const [hasReviewedAnyDraft, setHasReviewedAnyDraft] = React.useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = React.useState(false);

  // Source-metadata mapping (task §5).
  const [categoryMappings, setCategoryMappings] = React.useState<
    Map<string, CategoryMapping>
  >(new Map());
  const [tagOptions, setTagOptions] = React.useState(initialTagOptions);
  const [flavorProfileOptions, setFlavorProfileOptions] = React.useState(
    initialFlavorProfileOptions,
  );
  const [cuisineOptions, setCuisineOptions] = React.useState(
    initialCuisineOptions,
  );

  // Bulk-import preflight (task §10): every "ok" draft validated against
  // the exact persistence schema, recomputed whenever drafts change (a
  // Review edit, an applied cuisine mapping). Also feeds the Needs-review
  // grouping below, per task §10's "integrate ... into the same review
  // model" — a persistence-blocking problem is surfaced before the user
  // ever clicks Import, not only after a long bulk operation fails.
  const preflightIssuesByIndex = React.useMemo(() => {
    const map = new Map<number, string[]>();
    batchDrafts?.forEach((draft, index) => {
      if (draft.status !== "ok") return;
      const result = validateDishContentForPersistence(draft.result.values);
      if (!result.ok) map.set(index, result.messages);
    });
    return map;
  }, [batchDrafts]);

  const [preflightBlockOpen, setPreflightBlockOpen] = React.useState(false);
  const [preflightBlockedIndices, setPreflightBlockedIndices] = React.useState<
    number[]
  >([]);

  function archiveDraftSourceLabel(draft: ArchiveImportDraft): string {
    const name =
      draft.status === "ok" ? draft.result.values.title : draft.sourceRef;
    return `Recipe Gallery: ${name || draft.sourceRef}`.slice(
      0,
      ARCHIVE_SOURCE_LABEL_MAX_LENGTH,
    );
  }

  async function handleParsePaste() {
    setError(null);
    setIsParsing(true);
    const result = await proposeImportFromPaste(rawText);
    setIsParsing(false);
    if (result.status === "success") {
      setParseResult(result.result);
      setSourceLabel(undefined);
      setOriginalText(rawText);
    } else {
      setError(result.message);
    }
  }

  async function handleFileSelectedFromDropzone(file: File) {
    const fileKind = getImportFileKind(file.name);
    if (fileKind === "archive") {
      await handleArchiveFileSelected(file);
      return;
    }
    if (fileKind === "dishframeJson") {
      await handleDishframeJsonFileSelected(file);
      return;
    }

    setError(null);
    setIsParsing(true);
    const extracted = await extractTextFromImportFile(file);
    if (extracted.status !== "success") {
      setIsParsing(false);
      setError(extracted.message);
      return;
    }

    const result = await proposeImportFromPaste(extracted.text);
    setIsParsing(false);
    if (result.status === "success") {
      setParseResult(result.result);
      setSourceLabel(`Uploaded file: ${file.name}`.slice(0, 200));
      setOriginalText(extracted.text);
      setFileName(file.name);
    } else {
      setError(result.message);
    }
  }

  // Task §3: a batch row's default classification is the source's own
  // known kind when it has one (so far only a DishFrame JSON export, which
  // always records its real `kind` — see `ArchiveImportDraft.sourceDishKind`
  // on `recipe-gallery-import.ts`), else the route-level default: Part when
  // this flow was entered from Import Parts, Recipe otherwise.
  function defaultDraftKind(draft: ArchiveImportDraft): DishKindValue {
    if (draft.status === "ok" && draft.sourceDishKind) {
      return draft.sourceDishKind;
    }
    return kind === "PART" ? "PART" : "RECIPE";
  }

  // Shared by every batch source adapter (.rga, DishFrame .json) — resets
  // the whole batch-review workspace onto a freshly extracted draft list.
  function applyBatchDrafts(drafts: ArchiveImportDraft[]) {
    setBatchDrafts(drafts);
    setBatchSelection(
      new Set(
        drafts
          .map((draft, index) => (draft.status === "ok" ? index : -1))
          .filter((index) => index !== -1),
      ),
    );
    setBatchDraftKinds(
      new Map(
        drafts
          .map((draft, index): [number, DishKindValue] | null =>
            draft.status === "ok" ? [index, defaultDraftKind(draft)] : null,
          )
          .filter((entry): entry is [number, DishKindValue] => entry !== null),
      ),
    );
    setBatchResults(null);
    setCategoryMappings(new Map());
    setHasReviewedAnyDraft(false);
    setReviewedIndices(new Set());
    setClassificationOutcomes([]);
    setClassificationWarnings([]);
  }

  async function handleArchiveFileSelected(file: File) {
    setError(null);
    setIsParsing(true);
    // Extraction runs entirely client-side (recipe-gallery-import.ts) — a
    // real Recipe Gallery export can be ~28MB, well past Server Actions'
    // and Vercel Functions' own payload limits, so the archive's bytes
    // never leave the browser.
    const result = await extractRecipesFromArchiveFile(file);
    setIsParsing(false);

    if (result.status !== "success") {
      setError(result.message);
      return;
    }
    applyBatchDrafts(result.drafts);
  }

  // Task §1: DishFrame's own Recipe/Part JSON export, recognized and
  // normalized entirely client-side (dishframe-json-import.ts) — routes
  // through the exact same batch review list as `.rga` (always exactly one
  // row here) rather than a parallel single-item save path.
  async function handleDishframeJsonFileSelected(file: File) {
    setError(null);
    setIsParsing(true);
    const result = await extractDishFromJsonFile(file);
    setIsParsing(false);

    if (result.status !== "success") {
      setError(result.message);
      return;
    }
    applyBatchDrafts(result.drafts);
  }

  function handleToggleDraftSelection(index: number) {
    setBatchSelection((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleSetDraftKind(index: number, nextKind: DishKindValue) {
    setBatchDraftKinds((prev) => {
      const next = new Map(prev);
      next.set(index, nextKind);
      return next;
    });
  }

  function handleReviewDraft(index: number) {
    const draft = batchDrafts?.[index];
    if (!draft || draft.status !== "ok") return;
    setPreflightBlockOpen(false);
    setBatchReviewIndex(index);
    setParseResult(draft.result);
    setSourceLabel(archiveDraftSourceLabel(draft));
    setOriginalText(null);
  }

  // Batch Review's `onCreate` override: never calls the server — it only
  // writes the edited values back into the pending batch draft and reports
  // a synthetic success so `DishEditor` treats the Save ("Finish review",
  // task §7) as complete. Classification (Recipe/Part) is controlled by the
  // row toggle in the list, not by this step, and is left untouched here.
  async function handleBatchItemReviewSave(
    _targetKind: DishKindValue,
    values: DishContentInput,
  ): Promise<DishActionState> {
    if (batchReviewIndex === null) {
      return { status: "error", message: "Nothing to update." };
    }
    const index = batchReviewIndex;
    const draft = batchDrafts?.[index];
    if (!draft || draft.status !== "ok") {
      return { status: "error", message: "Nothing to update." };
    }
    setBatchDrafts((prev) => {
      if (!prev) return prev;
      const current = prev[index];
      if (current.status !== "ok") return prev;
      const next = [...prev];
      next[index] = { ...current, result: { ...current.result, values } };
      return next;
    });
    setHasReviewedAnyDraft(true);
    // Task §4: "Finish review" marks this row Reviewed regardless of
    // whether anything actually changed — opening Review and confirming is
    // itself the signal the user inspected a flagged item.
    setReviewedIndices((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    return { status: "success", dishId: "pending" };
  }

  // Task §6: returning from a batch Review step (via "Back to import list"
  // or Cancel) never applies the current form edits — it only clears the
  // review-step state, leaving whichever of the pending batch list or the
  // post-import results screen was active underneath untouched, so it's
  // shown again automatically.
  function handleExitBatchReview() {
    setParseResult(null);
    setSourceLabel(undefined);
    setOriginalText(null);
    setShowOriginal(false);
    setError(null);
    setBatchReviewIndex(null);
  }

  function handleDiscardSingleItem() {
    setParseResult(null);
    setSourceLabel(undefined);
    setOriginalText(null);
    setShowOriginal(false);
    setError(null);
  }

  const hasUnsavedBatchWork =
    hasReviewedAnyDraft ||
    [...batchDraftKinds.values()].some((value) => value !== "RECIPE") ||
    [...categoryMappings.values()].some(
      (mapping) => mapping.target !== "ignore",
    );

  function performDiscardBatch() {
    setDiscardConfirmOpen(false);
    setBatchDrafts(null);
    setBatchSelection(new Set());
    setBatchDraftKinds(new Map());
    setBatchReviewIndex(null);
    setBatchResults(null);
    setCollapsedFailedIndices(new Set());
    setCategoryMappings(new Map());
    setHasReviewedAnyDraft(false);
    setReviewedIndices(new Set());
    setClassificationOutcomes([]);
    setClassificationWarnings([]);
    setError(null);
  }

  // Task §4: "Discard import" replaces "Start over" — confirms first only
  // when the user would actually lose something (a reviewed draft, a
  // reclassification, or a metadata-mapping choice).
  function requestDiscardBatch() {
    if (hasUnsavedBatchWork) setDiscardConfirmOpen(true);
    else performDiscardBatch();
  }

  // Source-metadata mapping (task §5) ---------------------------------

  const categoryStats = React.useMemo(() => {
    if (!batchDrafts) return [] as { category: string; count: number }[];
    const counts = new Map<string, number>();
    batchDrafts.forEach((draft) => {
      if (draft.status === "ok" && draft.sourceCategory) {
        counts.set(
          draft.sourceCategory,
          (counts.get(draft.sourceCategory) ?? 0) + 1,
        );
      }
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category, count]) => ({ category, count }));
  }, [batchDrafts]);

  // Task §5: changing a classification's mapping already changes frontend
  // draft state — there is no separate "Apply mappings" step to click.
  // Cuisine mappings (the only mapping kind that writes directly into a
  // draft, rather than resolving to a Tag/Flavor-profile id only at commit
  // time — see `resolveMetadataMappingsForCommit`) are applied to
  // `batchDrafts` right here, event-driven off the user's mapping choice,
  // so opening Review on an affected draft before Import shows the mapped
  // Cuisine live rather than a stale pre-mapping value.
  function handleSetCategoryTarget(
    category: string,
    target: CategoryMapping["target"],
  ) {
    const next = new Map(categoryMappings);
    if (target === "ignore" || target === "cuisine") {
      next.set(category, { target });
    } else {
      const options = target === "tag" ? tagOptions : flavorProfileOptions;
      const match = options.find(
        (option) =>
          normalizeForMatch(option.displayName) === normalizeForMatch(category),
      );
      next.set(category, {
        target,
        selection: match ? `existing:${match.id}` : "create",
      });
    }
    setCategoryMappings(next);
    setBatchDrafts((prev) =>
      prev ? applyCuisineMappingsToDrafts(prev, next) : prev,
    );
  }

  function handleSetCategorySelection(category: string, selection: string) {
    setCategoryMappings((prev) => {
      const current = prev.get(category);
      if (
        !current ||
        (current.target !== "tag" && current.target !== "flavorProfile")
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(category, { target: current.target, selection });
      return next;
    });
  }

  // Applies any pending "cuisine" category mapping directly into the
  // matching drafts' `result.cuisineGuess` field (a sibling of `values` —
  // Cuisine isn't part of persisted content any more, PRODUCT_SPEC.md §46,
  // owner decision 2026-09-02). Pure/local — no Server Action calls — so
  // it's safe to run from "Apply mappings" as well as automatically before
  // Import/Retry. Takes `mappings` explicitly (rather than closing over
  // `categoryMappings`) so callers that just computed a new mapping value
  // can apply it in the same tick, before that value has committed to state.
  function applyCuisineMappingsToDrafts(
    drafts: ArchiveImportDraft[],
    mappings: Map<string, CategoryMapping>,
  ): ArchiveImportDraft[] {
    return drafts.map((draft) => {
      if (draft.status !== "ok" || !draft.sourceCategory) return draft;
      const mapping = mappings.get(draft.sourceCategory);
      if (mapping?.target !== "cuisine") return draft;
      const existingMatch = cuisineOptions.find(
        (option) =>
          normalizeForMatch(option.displayName) ===
          normalizeForMatch(draft.sourceCategory!),
      );
      const cuisineValue = existingMatch?.displayName ?? draft.sourceCategory;
      if (draft.result.cuisineGuess === cuisineValue) return draft;
      return {
        ...draft,
        result: { ...draft.result, cuisineGuess: cuisineValue },
      };
    });
  }

  // Resolves every pending "create a new Tag/Flavor profile" mapping into a
  // real id, via the same `createTag`/`createFlavorProfile` actions
  // Settings' managers use (normalized-name deduped, so re-resolving on a
  // later retry is always safe) — called only at actual import-commit time
  // (Import/Retry), never from "Apply mappings", so choosing "Create new"
  // and then discarding the import never leaves account data behind.
  // Returns the freshly resolved state rather than relying on the (stale,
  // async) React state right after calling this, so the caller's own
  // immediate build of the bulk-import payload doesn't race its own
  // `setCategoryMappings`/`setTagOptions`/`setFlavorProfileOptions` calls.
  async function resolveMetadataMappingsForCommit(): Promise<{
    mappings: Map<string, CategoryMapping>;
    tagOptions: ImportTagOption[];
    flavorProfileOptions: ImportFlavorProfileOption[];
    cuisineOptions: ImportCuisineOption[];
    presetTagIdByName: Map<string, string>;
    presetFlavorProfileIdByName: Map<string, string>;
    cuisineIdByName: Map<string, string>;
  }> {
    const workingMappings = new Map(categoryMappings);
    let workingTagOptions = tagOptions;
    let workingFlavorProfileOptions = flavorProfileOptions;
    let workingCuisineOptions = cuisineOptions;

    // Task §1: preset Tags/Flavor profiles a source adapter already knows
    // are exactly that (so far only `dishframe-json-import.ts`) — resolved
    // the same dedup-safe way as a "Create new" Classifications mapping,
    // but with no ambiguity to ask the user about, so this never touches
    // `categoryMappings`. Deduped by name across every draft so re-importing
    // several items sharing a Tag creates it at most once per commit.
    const presetTagNames = new Set<string>();
    const presetFlavorProfileNames = new Set<string>();
    // PRODUCT_SPEC.md §46 (owner decision, 2026-09-02): every draft's
    // guessed/mapped Cuisine name (`result.cuisineGuess`, set by the parser
    // or by a "cuisine" Classifications mapping) plus any source-adapter
    // preset Cuisine names, deduped the same way — get-or-created here
    // rather than left as free text, since Cuisine is now a normalized,
    // user-owned entity like Tag/Flavor profile.
    const cuisineNames = new Set<string>();
    (batchDrafts ?? []).forEach((draft) => {
      if (draft.status !== "ok") return;
      draft.presetTags?.forEach((name) => presetTagNames.add(name));
      draft.presetFlavorProfiles?.forEach((name) =>
        presetFlavorProfileNames.add(name),
      );
      draft.presetCuisines?.forEach((name) => cuisineNames.add(name));
      if (draft.result.cuisineGuess)
        cuisineNames.add(draft.result.cuisineGuess);
    });

    const presetTagIdByName = new Map<string, string>();
    for (const name of presetTagNames) {
      const match = workingTagOptions.find(
        (option) =>
          normalizeForMatch(option.displayName) === normalizeForMatch(name),
      );
      if (match) {
        presetTagIdByName.set(name, match.id);
        continue;
      }
      const formData = new FormData();
      formData.set("name", name);
      const result = await createTag(initialCreateTagActionState, formData);
      if (result.status === "success" && result.tag) {
        workingTagOptions = [
          ...workingTagOptions,
          { id: result.tag.id, displayName: result.tag.displayName },
        ];
        presetTagIdByName.set(name, result.tag.id);
      }
    }

    const presetFlavorProfileIdByName = new Map<string, string>();
    for (const name of presetFlavorProfileNames) {
      const match = workingFlavorProfileOptions.find(
        (option) =>
          normalizeForMatch(option.displayName) === normalizeForMatch(name),
      );
      if (match) {
        presetFlavorProfileIdByName.set(name, match.id);
        continue;
      }
      const formData = new FormData();
      formData.set("name", name);
      const result = await createFlavorProfile(
        initialCreateFlavorProfileActionState,
        formData,
      );
      if (result.status === "success" && result.flavorProfile) {
        workingFlavorProfileOptions = [
          ...workingFlavorProfileOptions,
          {
            id: result.flavorProfile.id,
            displayName: result.flavorProfile.displayName,
          },
        ];
        presetFlavorProfileIdByName.set(name, result.flavorProfile.id);
      }
    }

    const cuisineIdByName = new Map<string, string>();
    for (const name of cuisineNames) {
      const match = workingCuisineOptions.find(
        (option) =>
          normalizeForMatch(option.displayName) === normalizeForMatch(name),
      );
      if (match) {
        cuisineIdByName.set(name, match.id);
        continue;
      }
      const formData = new FormData();
      formData.set("name", name);
      const result = await createCuisine(
        initialCreateCuisineActionState,
        formData,
      );
      if (result.status === "success" && result.cuisine) {
        workingCuisineOptions = [
          ...workingCuisineOptions,
          { id: result.cuisine.id, displayName: result.cuisine.displayName },
        ];
        cuisineIdByName.set(name, result.cuisine.id);
      }
    }

    for (const { category } of categoryStats) {
      const mapping = workingMappings.get(category);
      if (mapping?.target === "tag" && mapping.selection === "create") {
        const formData = new FormData();
        formData.set("name", category);
        const result = await createTag(initialCreateTagActionState, formData);
        if (result.status === "success" && result.tag) {
          workingTagOptions = [
            ...workingTagOptions,
            { id: result.tag.id, displayName: result.tag.displayName },
          ];
          workingMappings.set(category, {
            target: "tag",
            selection: `existing:${result.tag.id}`,
          });
        }
      } else if (
        mapping?.target === "flavorProfile" &&
        mapping.selection === "create"
      ) {
        const formData = new FormData();
        formData.set("name", category);
        const result = await createFlavorProfile(
          initialCreateFlavorProfileActionState,
          formData,
        );
        if (result.status === "success" && result.flavorProfile) {
          workingFlavorProfileOptions = [
            ...workingFlavorProfileOptions,
            {
              id: result.flavorProfile.id,
              displayName: result.flavorProfile.displayName,
            },
          ];
          workingMappings.set(category, {
            target: "flavorProfile",
            selection: `existing:${result.flavorProfile.id}`,
          });
        }
      }
    }

    setCategoryMappings(workingMappings);
    setTagOptions(workingTagOptions);
    setFlavorProfileOptions(workingFlavorProfileOptions);
    setCuisineOptions(workingCuisineOptions);

    return {
      mappings: workingMappings,
      tagOptions: workingTagOptions,
      flavorProfileOptions: workingFlavorProfileOptions,
      cuisineOptions: workingCuisineOptions,
      presetTagIdByName,
      presetFlavorProfileIdByName,
      cuisineIdByName,
    };
  }

  function metadataForDraft(
    draft: OkArchiveDraft,
    mappings: Map<string, CategoryMapping>,
    tagOpts: ImportTagOption[],
    flavorOpts: ImportFlavorProfileOption[],
    presetTagIdByName: Map<string, string>,
    presetFlavorProfileIdByName: Map<string, string>,
    cuisineIdByName: Map<string, string>,
  ): {
    tags: BulkImportMetadataRef[];
    flavorProfiles: BulkImportMetadataRef[];
    cuisines: BulkImportMetadataRef[];
  } {
    const tags: BulkImportMetadataRef[] = [];
    const flavorProfiles: BulkImportMetadataRef[] = [];
    const cuisines: BulkImportMetadataRef[] = [];

    draft.presetTags?.forEach((name) => {
      const id = presetTagIdByName.get(name);
      if (id) tags.push({ id, displayName: name });
    });
    draft.presetFlavorProfiles?.forEach((name) => {
      const id = presetFlavorProfileIdByName.get(name);
      if (id) flavorProfiles.push({ id, displayName: name });
    });
    draft.presetCuisines?.forEach((name) => {
      const id = cuisineIdByName.get(name);
      if (id) cuisines.push({ id, displayName: name });
    });
    if (draft.result.cuisineGuess) {
      const id = cuisineIdByName.get(draft.result.cuisineGuess);
      if (id && !cuisines.some((ref) => ref.id === id)) {
        cuisines.push({ id, displayName: draft.result.cuisineGuess });
      }
    }

    if (draft.sourceCategory) {
      const mapping = mappings.get(draft.sourceCategory);
      if (
        mapping?.target === "tag" &&
        mapping.selection.startsWith("existing:")
      ) {
        const id = mapping.selection.slice("existing:".length);
        const displayName =
          tagOpts.find((option) => option.id === id)?.displayName ??
          draft.sourceCategory;
        tags.push({ id, displayName });
      } else if (
        mapping?.target === "flavorProfile" &&
        mapping.selection.startsWith("existing:")
      ) {
        const id = mapping.selection.slice("existing:".length);
        const displayName =
          flavorOpts.find((option) => option.id === id)?.displayName ??
          draft.sourceCategory;
        flavorProfiles.push({ id, displayName });
      }
    }

    return { tags, flavorProfiles, cuisines };
  }

  function buildBulkImportItemInput(
    draft: OkArchiveDraft,
    index: number,
    mappings: Map<string, CategoryMapping>,
    tagOpts: ImportTagOption[],
    flavorOpts: ImportFlavorProfileOption[],
    presetTagIdByName: Map<string, string>,
    presetFlavorProfileIdByName: Map<string, string>,
    cuisineIdByName: Map<string, string>,
  ): BulkImportItemInput {
    const metadata = metadataForDraft(
      draft,
      mappings,
      tagOpts,
      flavorOpts,
      presetTagIdByName,
      presetFlavorProfileIdByName,
      cuisineIdByName,
    );
    return {
      sourceRef: draft.sourceRef,
      kind: batchDraftKinds.get(index) ?? "RECIPE",
      values: draft.result.values,
      sourceLabel: archiveDraftSourceLabel(draft),
      ...metadata,
    };
  }

  // Bulk import + progress (task §3/§11) -------------------------------

  // Chunk boundaries are the only real progress checkpoints (we only know
  // true progress when a whole chunk's Server Action resolves) — this
  // smoothly animates toward, but deliberately stops short of, each
  // chunk's own boundary while its call is in flight, then commits exactly
  // to that boundary the moment it resolves, before animating the next
  // segment. No fake per-recipe count is ever shown.
  async function runChunkedConfirm(
    items: Array<{ index: number; input: BulkImportItemInput }>,
  ): Promise<BulkImportItemResult[]> {
    const totalChunks = Math.max(
      1,
      Math.ceil(items.length / BULK_IMPORT_CHUNK_SIZE),
    );
    setImportProgress(0);
    const results: BulkImportItemResult[] = [];

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const chunk = items.slice(
        chunkIndex * BULK_IMPORT_CHUNK_SIZE,
        (chunkIndex + 1) * BULK_IMPORT_CHUNK_SIZE,
      );
      const segmentStart = (chunkIndex / totalChunks) * 100;
      const segmentEnd = ((chunkIndex + 1) / totalChunks) * 100;
      const cap = segmentStart + (segmentEnd - segmentStart) * 0.9;
      // Task §8: live-QA found the synthetic interpolation reaching (and
      // stalling near) each chunk boundary well before the real batch
      // finished — slowed to roughly two-thirds of the prior per-tick step
      // (0.15 → 0.1) rather than pretending the estimate is authoritative.
      const interval = setInterval(() => {
        setImportProgress((prev) =>
          prev >= cap ? prev : prev + (cap - prev) * 0.1,
        );
      }, 150);

      try {
        results.push(
          ...(await confirmImportBatch(chunk.map((item) => item.input))),
        );
      } catch {
        for (const item of chunk) {
          results.push({
            sourceRef: item.input.sourceRef,
            status: "error",
            message: "This item could not be imported.",
          });
        }
      } finally {
        clearInterval(interval);
      }
      setImportProgress(segmentEnd);
    }

    return results;
  }

  function applyBulkResults(
    items: Array<{ index: number; input: BulkImportItemInput }>,
    results: BulkImportItemResult[],
  ) {
    setBatchResults((prev) => {
      const next = new Map(prev ?? []);
      items.forEach((item, i) => {
        const result = results[i];
        if (result) next.set(item.index, result);
      });
      return next;
    });
  }

  // Task §12: what happened to each mapped source classification this
  // commit — only mapped (non-"ignore") categories with at least one
  // successfully-imported item are reported; "created" vs "reused" is
  // determined by comparing the resolved id against the option lists as
  // they stood *before* this commit's resolve step.
  function computeClassificationOutcomes(
    drafts: ArchiveImportDraft[],
    items: Array<{ index: number; input: BulkImportItemInput }>,
    results: BulkImportItemResult[],
    mappings: Map<string, CategoryMapping>,
    tagOptsBefore: ImportTagOption[],
    tagOptsAfter: ImportTagOption[],
    flavorOptsBefore: ImportFlavorProfileOption[],
    flavorOptsAfter: ImportFlavorProfileOption[],
  ): ClassificationOutcome[] {
    const succeededRefs = new Set(
      results
        .filter((result) => result.status === "success")
        .map((result) => result.sourceRef),
    );
    const outcomes: ClassificationOutcome[] = [];

    for (const [category, mapping] of mappings.entries()) {
      if (mapping.target === "ignore") continue;
      const appliedCount = items.filter((item) => {
        if (!succeededRefs.has(item.input.sourceRef)) return false;
        const draft = drafts[item.index];
        return draft.status === "ok" && draft.sourceCategory === category;
      }).length;
      if (appliedCount === 0) continue;

      if (mapping.target === "cuisine") {
        outcomes.push({
          category,
          target: "cuisine",
          action: "applied",
          displayName: category,
          appliedCount,
        });
        continue;
      }

      if (!mapping.selection.startsWith("existing:")) continue;
      const id = mapping.selection.slice("existing:".length);
      const [optsBefore, optsAfter] =
        mapping.target === "tag"
          ? [tagOptsBefore, tagOptsAfter]
          : [flavorOptsBefore, flavorOptsAfter];
      const displayName =
        optsAfter.find((option) => option.id === id)?.displayName ?? category;
      const wasCreated = !optsBefore.some((option) => option.id === id);
      outcomes.push({
        category,
        target: mapping.target,
        action: wasCreated ? "created" : "reused",
        displayName,
        appliedCount,
      });
    }

    return outcomes;
  }

  async function commitBulkImport(indices: number[]): Promise<{
    items: Array<{ index: number; input: BulkImportItemInput }>;
    results: BulkImportItemResult[];
  } | null> {
    if (!batchDrafts) {
      setBatchImporting(false);
      return null;
    }
    const drafts = applyCuisineMappingsToDrafts(batchDrafts, categoryMappings);
    setBatchDrafts(drafts);
    const tagOptsBefore = tagOptions;
    const flavorOptsBefore = flavorProfileOptions;
    const {
      mappings,
      tagOptions: tagOpts,
      flavorProfileOptions: flavorOpts,
      presetTagIdByName,
      presetFlavorProfileIdByName,
      cuisineIdByName,
    } = await resolveMetadataMappingsForCommit();

    const blocked = indices.filter((index) => {
      const draft = drafts[index];
      return (
        draft.status === "ok" &&
        !validateDishContentForPersistence(draft.result.values).ok
      );
    });
    if (blocked.length > 0) {
      setBatchImporting(false);
      setPreflightBlockedIndices(blocked);
      setPreflightBlockOpen(true);
      return null;
    }

    const items: Array<{ index: number; input: BulkImportItemInput }> = [];
    for (const index of indices) {
      const draft = drafts[index];
      if (draft.status !== "ok") continue;
      items.push({
        index,
        input: buildBulkImportItemInput(
          draft,
          index,
          mappings,
          tagOpts,
          flavorOpts,
          presetTagIdByName,
          presetFlavorProfileIdByName,
          cuisineIdByName,
        ),
      });
    }
    if (items.length === 0) {
      setBatchImporting(false);
      return null;
    }

    const results = await runChunkedConfirm(items);
    applyBulkResults(items, results);

    const outcomes = computeClassificationOutcomes(
      drafts,
      items,
      results,
      mappings,
      tagOptsBefore,
      tagOpts,
      flavorOptsBefore,
      flavorOpts,
    );
    setClassificationOutcomes((prev) =>
      mergeClassificationOutcomes(prev, outcomes),
    );
    const warnings = results.flatMap((result) =>
      result.status === "success" ? (result.metadataWarnings ?? []) : [],
    );
    if (warnings.length > 0) {
      setClassificationWarnings((prev) => [
        ...prev,
        ...warnings.filter((warning) => !prev.includes(warning)),
      ]);
    }

    setBatchImporting(false);
    return { items, results };
  }

  async function handleImportClick() {
    if (!batchDrafts || batchSelection.size === 0) return;
    // Task §8: the batch-progress modal renders on the very first tick of
    // this click — every async step below (resolving "Create new"
    // Tags/Flavor profiles, then the chunked confirm calls) happens while
    // it's already showing, instead of leaving the user on the page with
    // no feedback until the first server round trip lands.
    setBatchImporting(true);
    const indices = [...batchSelection].sort((a, b) => a - b);
    const outcome = await commitBulkImport(indices);
    if (!outcome) return;
    const { items, results } = outcome;

    let importedRecipes = 0;
    let importedParts = 0;
    let failed = 0;
    items.forEach((item, i) => {
      if (results[i]?.status === "success") {
        if (item.input.kind === "PART") importedParts++;
        else importedRecipes++;
      } else {
        failed++;
      }
    });

    showToast(
      failed === 0
        ? {
            title: buildFullSuccessSummary(importedRecipes, importedParts),
            variant: "success",
          }
        : {
            title: `Imported ${pluralize(importedRecipes + importedParts, "item", "items")}. ${failed} could not be imported.`,
            variant: "error",
            durationMs: null,
          },
    );
  }

  // Task §13/§14: retries only drafts still marked "error" in the current
  // results — a partial retry leaves untouched failures exactly as they
  // were, still reviewable/retryable again.
  async function handleRetryFailed() {
    if (!batchDrafts || !batchResults) return;
    const failedIndices = [...batchResults.entries()]
      .filter(([, result]) => result.status === "error")
      .map(([index]) => index)
      .filter((index) => batchDrafts[index]?.status === "ok");
    if (failedIndices.length === 0) return;

    setBatchImporting(true);
    const outcome = await commitBulkImport(failedIndices);
    if (!outcome) return;
    const { items, results } = outcome;

    const succeeded = results.filter(
      (result) => result.status === "success",
    ).length;
    showToast({
      title:
        succeeded === items.length
          ? `Imported ${pluralize(succeeded, "item", "items")}.`
          : `${succeeded} of ${items.length} imported.`,
      variant: succeeded === items.length ? "success" : "error",
    });
  }

  function toggleFailedCollapsed(index: number) {
    setCollapsedFailedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleParseWebsite() {
    setError(null);
    setIsParsing(true);
    const result = await proposeImportFromUrl(urlValue);
    setIsParsing(false);
    if (result.status === "success") {
      setParseResult(result.result);
      setSourceLabel(urlValue.trim().slice(0, 500));
      setOriginalText(null);
    } else {
      setError(result.message);
    }
  }

  async function handleConfirmCreate(
    confirmKind: DishKindValue,
    values: DishContentInput,
  ) {
    return confirmImport(
      confirmKind,
      values,
      sourceLabel,
      parseResult?.cuisineGuess ?? null,
    );
  }

  // Single-item Save confirmation: `DishEditor` awaits this before
  // persisting a create-mode Save; resolving `null` is a cancel.
  // Task §14: traced the single-item Import submit path end to end — see
  // the completion report for what was and wasn't confirmed. This one
  // concrete control-flow gap was found and fixed by inspection: a second
  // `requestSaveTarget()` call (e.g. a second Save attempt while this
  // dialog is still open) replaced `saveTargetResolver` with a new
  // resolver, leaving the *first* call's Promise — and the `performSave`
  // awaiting it — permanently unresolved. Resolving any still-pending
  // resolver with `null` (a cancel) before installing the new one closes
  // that gap without ever retrying a save.
  function requestSaveTarget(): Promise<DishKindValue | null> {
    setSaveTargetResolver(
      (prevResolve: ((choice: DishKindValue | null) => void) | null) => {
        prevResolve?.(null);
        return null;
      },
    );
    return new Promise((resolve) => {
      setSaveTargetResolver(() => resolve);
    });
  }

  function handleSaveTargetChoice(choice: DishKindValue | null) {
    saveTargetResolver?.(choice);
    setSaveTargetResolver(null);
  }

  if (parseResult) {
    const isBatchReview = batchReviewIndex !== null;
    const reviewKind = isBatchReview
      ? (batchDraftKinds.get(batchReviewIndex) ?? "RECIPE")
      : kind;
    const reviewKindLabel = reviewKind === "PART" ? "Part" : "recipe";

    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
        {parseResult.needsReviewCount > 0 && (
          <p className="border-border bg-card text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {parseResult.needsReviewCount === 1
                ? "One line "
                : `${parseResult.needsReviewCount} lines `}
              couldn&apos;t be confidently structured — check the &quot;Needs
              review&quot; warning below before saving.
            </span>
          </p>
        )}
        <div>
          {originalText ? (
            <>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? "Hide" : "Show"} original{" "}
                {fileName ? "uploaded" : "pasted"} text
              </Button>
              {showOriginal && (
                <pre className="border-border bg-card text-muted-foreground mt-2 max-h-64 overflow-auto rounded-lg border p-3 text-xs whitespace-pre-wrap">
                  {originalText}
                </pre>
              )}
            </>
          ) : (
            sourceLabel && (
              <p className="text-muted-foreground text-sm">
                Imported from{" "}
                <span className="text-foreground break-all">{sourceLabel}</span>
              </p>
            )
          )}
        </div>
        <Button
          type="button"
          variant={isBatchReview ? "outline" : "destructive"}
          className="self-start"
          onClick={
            isBatchReview ? handleExitBatchReview : handleDiscardSingleItem
          }
        >
          {isBatchReview ? "Back to import list" : "Discard import"}
        </Button>
        <DishEditor
          kind={reviewKind}
          cuisineOptions={cuisineOptions}
          initialValues={parseResult.values}
          onCreate={
            isBatchReview ? handleBatchItemReviewSave : handleConfirmCreate
          }
          confirmCreateTargetAction={
            isBatchReview ? undefined : requestSaveTarget
          }
          onCreatedAction={isBatchReview ? handleExitBatchReview : undefined}
          onCancelAction={isBatchReview ? handleExitBatchReview : undefined}
          submitLabel={isBatchReview ? "Finish review" : undefined}
          heading={`Review imported ${reviewKindLabel.toLowerCase()}`}
        />

        <Dialog
          open={saveTargetResolver !== null}
          onOpenChange={(open) => !open && handleSaveTargetChoice(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save</DialogTitle>
              <DialogDescription>
                Save this as a recipe when it stands on its own as something you
                would cook or serve. Save it as a reusable Part when it is a
                component you may use in multiple recipes, such as a marinara
                sauce, pizza dough, or dressing.
                <br />
                <br />
                How would you like to save it?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleSaveTargetChoice(null)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSaveTargetChoice("PART")}
              >
                Save as Part
              </Button>
              <Button onClick={() => handleSaveTargetChoice("RECIPE")}>
                Save as recipe
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (batchDrafts) {
    const drafts = batchDrafts;
    const okCount = drafts.filter((d) => d.status === "ok").length;
    const errorCount = drafts.length - okCount;

    // Shared between the results view (task §14's retry can trigger this
    // same block) and the pending-list view (task §10's initial-import
    // block) — defined once here rather than duplicated in both returns.
    function renderPreflightBlockDialog() {
      return (
        <Dialog open={preflightBlockOpen} onOpenChange={setPreflightBlockOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {pluralize(
                  preflightBlockedIndices.length,
                  "recipe needs",
                  "recipes need",
                )}{" "}
                attention
              </DialogTitle>
              <DialogDescription>
                These items have a problem that would block saving. Review and
                fix them, or uncheck them and import the rest.
              </DialogDescription>
            </DialogHeader>
            <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {preflightBlockedIndices.map((index) => {
                const draft = drafts[index];
                if (draft.status !== "ok") return null;
                const title = draft.result.values.title || "Untitled recipe";
                const messages = preflightIssuesByIndex.get(index) ?? [];
                return (
                  <li
                    key={draft.sourceRef}
                    className="border-border flex flex-col gap-1 rounded-lg border p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground text-sm font-medium">
                        {title}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReviewDraft(index)}
                      >
                        Review
                      </Button>
                    </div>
                    <ul className="text-muted-foreground list-disc pl-4 text-xs">
                      {messages.map((message, i) => (
                        <li key={i}>{message}</li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreflightBlockOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }

    const selectedOkIndices = [...batchSelection].filter(
      (index) => batchDrafts[index]?.status === "ok",
    );
    const selectedRecipeCount = selectedOkIndices.filter(
      (index) => (batchDraftKinds.get(index) ?? "RECIPE") === "RECIPE",
    ).length;
    const selectedPartCount = selectedOkIndices.length - selectedRecipeCount;

    // Task §7: the paragraph that used to repeat this count above the
    // button is gone — the button's own label already says it.
    const importButtonLabel =
      selectedRecipeCount > 0 && selectedPartCount > 0
        ? `Import ${batchSelection.size} items`
        : selectedPartCount > 0
          ? `Import ${pluralize(selectedPartCount, "part", "parts")}`
          : `Import ${pluralize(selectedRecipeCount, "recipe", "recipes")}`;

    function renderDraftRow(index: number, draft: ArchiveImportDraft) {
      const title =
        draft.status === "ok"
          ? draft.result.values.title || "Untitled recipe"
          : draft.sourceRef;
      const draftParserNeedsReview =
        draft.status === "ok" && draft.result.needsReviewCount > 0;
      const draftPreflightFailed = preflightIssuesByIndex.has(index);
      // Follow-up: a DishFrame JSON export's linked Parts are dropped
      // during normalization (never resolved/reconnected in this pass) —
      // surfaced here, before Import, so this structural loss is never a
      // surprise discovered only after saving.
      const draftHasDroppedPartLinks =
        draft.status === "ok" && (draft.droppedLinkedPartsCount ?? 0) > 0;
      const rowResult = batchResults?.get(index);
      const rowKind = batchDraftKinds.get(index) ?? "RECIPE";

      return (
        <li
          key={draft.sourceRef}
          className="border-border bg-card flex flex-row flex-wrap items-center gap-3 rounded-lg border p-3"
        >
          {!batchResults && (
            <Checkbox
              disabled={draft.status !== "ok" || batchImporting}
              checked={batchSelection.has(index)}
              onCheckedChange={() => handleToggleDraftSelection(index)}
              aria-label={`Import ${title}`}
            />
          )}
          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
            {title}
          </span>
          {draft.status === "ok" && draft.sourceCategory && (
            <Badge variant="outline">{draft.sourceCategory}</Badge>
          )}
          {rowResult ? (
            rowResult.status === "success" ? (
              <Badge variant="secondary">
                <CircleCheck /> Imported
              </Badge>
            ) : (
              <Badge variant="destructive">
                <CircleX /> Failed
              </Badge>
            )
          ) : draft.status === "error" ? (
            <Badge variant="destructive">
              <CircleX /> Couldn&apos;t be read
            </Badge>
          ) : reviewedIndices.has(index) ? (
            // Task §4: deliberately distinct from the plain "Ready" badge
            // below — this communicates "you looked at this," not just
            // "the parser found nothing wrong."
            <Badge
              variant="outline"
              className="border-brand-green/40 bg-brand-green/10 text-brand-green-text"
            >
              <CircleCheck /> Reviewed
            </Badge>
          ) : draftParserNeedsReview ||
            draftPreflightFailed ||
            draftHasDroppedPartLinks ? (
            <Badge
              variant="outline"
              className="border-brand-orange/40 bg-brand-orange/10 text-brand-orange-text"
            >
              Needs review
            </Badge>
          ) : (
            <Badge variant="secondary">
              <CircleCheck /> Ready
            </Badge>
          )}
          {draft.status === "error" && !rowResult && (
            <p className="text-muted-foreground w-full text-xs">
              {draft.message}
            </p>
          )}
          {draftHasDroppedPartLinks && !rowResult && (
            <p className="text-brand-orange-text w-full text-xs">
              This item&apos;s linked Parts won&apos;t be restored — reconnect
              them manually after import.
            </p>
          )}
          {rowResult?.status === "error" && (
            <p className="text-muted-foreground w-full text-xs">
              {rowResult.message}
            </p>
          )}
          {draft.status === "ok" && !batchResults && (
            <>
              <div
                role="radiogroup"
                aria-label={`Save "${title}" as`}
                className="border-border bg-background inline-flex shrink-0 gap-1 rounded-lg border p-0.5"
              >
                {(["RECIPE", "PART"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rowKind === value}
                    variant={rowKind === value ? "default" : "ghost"}
                    size="sm"
                    disabled={batchImporting}
                    onClick={() => handleSetDraftKind(index, value)}
                  >
                    {value === "RECIPE" ? "Recipe" : "Part"}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={batchImporting}
                onClick={() => handleReviewDraft(index)}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Review
              </Button>
            </>
          )}
        </li>
      );
    }

    if (batchResults) {
      const failedEntries = [...batchResults.entries()].filter(
        ([, result]) => result.status === "error",
      );
      const succeededEntries = [...batchResults.entries()].filter(
        ([, result]) => result.status === "success",
      );
      let importedRecipes = 0;
      let importedParts = 0;
      succeededEntries.forEach(([index]) => {
        if ((batchDraftKinds.get(index) ?? "RECIPE") === "PART")
          importedParts++;
        else importedRecipes++;
      });
      // Task §11: considers every result row (failed and succeeded), not
      // just successes, so a batch that only failed to import a Part still
      // reads "Parts" rather than defaulting to "Recipes".
      const recipesPresent = [...batchResults.keys()].some(
        (index) => (batchDraftKinds.get(index) ?? "RECIPE") === "RECIPE",
      );
      const partsPresent = [...batchResults.keys()].some(
        (index) => (batchDraftKinds.get(index) ?? "RECIPE") === "PART",
      );
      const resultsHeading =
        recipesPresent && partsPresent
          ? "Recipes & Parts"
          : partsPresent
            ? "Parts"
            : "Recipes";

      // Task §9: route-based, matching whichever of /recipes/import or
      // /parts/import this flow was entered from — not the batch's actual
      // content mix, so it stays a stable pair of destinations.
      const navActions = (
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={basePath}>Go to {collectionLabel.toLowerCase()}</Link>
          </Button>
          <Button type="button" variant="outline" onClick={performDiscardBatch}>
            Import another {kindLabel.toLowerCase()}
          </Button>
        </div>
      );

      return (
        <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
          <Breadcrumbs
            items={[
              { label: collectionLabel, href: basePath },
              { label: "Import" },
            ]}
          />

          <section className="flex flex-col gap-3">
            <p className="text-foreground text-lg font-medium">
              {buildResultsHeadline(
                importedRecipes,
                importedParts,
                failedEntries.length,
              )}
            </p>
            {navActions}
          </section>

          {failedEntries.length > 0 && (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="font-heading text-lg font-medium">
                  {resultsHeading}
                </h2>
                <h3 className="text-foreground mt-2 text-sm font-medium">
                  Failed to import
                </h3>
                <p className="text-muted-foreground text-sm">
                  These still need attention. Review a draft to fix it, then
                  retry — successful retries move here to Successfully imported.
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                {failedEntries.map(([index, result]) => {
                  const draft = batchDrafts[index];
                  if (draft.status !== "ok") return null;
                  const title = draft.result.values.title || "Untitled recipe";
                  const rowKind = batchDraftKinds.get(index) ?? "RECIPE";
                  const collapsed = collapsedFailedIndices.has(index);
                  return (
                    <li
                      key={draft.sourceRef}
                      className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="text-foreground truncate text-sm font-medium">
                            {title}
                          </span>
                          <Badge variant="outline">
                            {rowKind === "PART" ? "Part" : "Recipe"}
                          </Badge>
                          {draft.sourceCategory && (
                            <Badge variant="outline">
                              {draft.sourceCategory}
                            </Badge>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={batchImporting}
                            onClick={() => handleReviewDraft(index)}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                            Review
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={
                              collapsed
                                ? "Show error details"
                                : "Hide error details"
                            }
                            onClick={() => toggleFailedCollapsed(index)}
                          >
                            {collapsed ? <ChevronDown /> : <ChevronUp />}
                          </Button>
                        </div>
                      </div>
                      {!collapsed && (
                        <div className="border-destructive/30 bg-destructive/10 text-destructive-text flex flex-col gap-1 rounded-lg border p-3 text-sm">
                          <p className="font-medium">
                            Couldn&apos;t import this item
                          </p>
                          <p>
                            {result.status === "error" ? result.message : ""}
                          </p>
                          <p className="text-xs opacity-80">
                            Review to fix it, then use &quot;Retry failed
                            imports&quot; below.
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Button
                type="button"
                variant="outline"
                loading={batchImporting}
                onClick={handleRetryFailed}
                className="self-start"
              >
                Retry failed imports
              </Button>
            </section>
          )}

          {succeededEntries.length > 0 && (
            <section className="flex flex-col gap-3">
              {failedEntries.length === 0 && (
                <h2 className="font-heading text-lg font-medium">
                  {resultsHeading}
                </h2>
              )}
              <h3 className="text-foreground text-sm font-medium">
                Successfully imported
              </h3>
              <ul className="flex flex-col gap-2">
                {succeededEntries.map(([index, result]) => {
                  const draft = batchDrafts[index];
                  if (draft.status !== "ok" || result.status !== "success") {
                    return null;
                  }
                  const title = draft.result.values.title || "Untitled recipe";
                  const rowKind = batchDraftKinds.get(index) ?? "RECIPE";
                  const warnings = result.metadataWarnings ?? [];
                  return (
                    <li
                      key={draft.sourceRef}
                      className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                          {title}
                        </span>
                        <Badge variant="outline">
                          {rowKind === "PART" ? "Part" : "Recipe"}
                        </Badge>
                        {/* Task §10: opens the ordinary Recipe/Part Details
                            page in a new tab so the results page (and its
                            context — what succeeded/failed) stays intact in
                            this tab, with no Import-specific details variant
                            or custom back-navigation. */}
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            href={`${rowKind === "PART" ? "/parts" : "/recipes"}/${result.dishId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View
                          </Link>
                        </Button>
                      </div>
                      {(draft.droppedLinkedPartsCount ?? 0) > 0 && (
                        <p className="border-brand-orange/40 bg-brand-orange/10 text-brand-orange-text flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            This item&apos;s linked Parts weren&apos;t restored
                            — reconnect them manually.
                          </span>
                        </p>
                      )}
                      {warnings.length > 0 && (
                        <p className="border-brand-orange/40 bg-brand-orange/10 text-brand-orange-text flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            Imported, but some metadata could not be applied.{" "}
                            {warnings.join(" ")}
                          </span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {(classificationOutcomes.length > 0 ||
            classificationWarnings.length > 0) && (
            <section className="flex flex-col gap-3">
              <h2 className="font-heading text-lg font-medium">
                Classifications
              </h2>
              {classificationOutcomes.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {classificationOutcomes.map((outcome) => (
                    <li
                      key={`${outcome.target}:${outcome.category}`}
                      className="border-border bg-card rounded-lg border p-3 text-sm"
                    >
                      {outcome.target === "cuisine" ? (
                        <>
                          Cuisine &quot;{outcome.displayName}&quot; applied to{" "}
                          {pluralize(outcome.appliedCount, "item", "items")}.
                        </>
                      ) : (
                        <>
                          {outcome.target === "tag" ? "Tag" : "Flavor profile"}{" "}
                          &quot;{outcome.displayName}&quot;{" "}
                          {outcome.action === "created" ? "created" : "reused"},
                          applied to{" "}
                          {pluralize(outcome.appliedCount, "item", "items")}.
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {classificationWarnings.length > 0 && (
                <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
                  {classificationWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {navActions}

          {/* Retry (task §14) can trigger the same preflight block as the
              initial import — this branch returns before the list-view's
              own render of the same shared dialog below. */}
          {renderPreflightBlockDialog()}
        </div>
      );
    }

    // Task §2/§4: "flagged" ok drafts (parser needs-review or a preflight
    // problem) are the "Needs review" group; error-status ("couldn't be
    // read") drafts are never selectable/importable at all and are shown
    // in the same group but kept out of every "N ready / M need review"
    // count — those two numbers describe only the importable ok drafts, so
    // they always sum to `okCount`.
    const flaggedOkRows: [number, ArchiveImportDraft][] = [];
    const readyRows: [number, ArchiveImportDraft][] = [];
    const errorRows: [number, ArchiveImportDraft][] = [];
    batchDrafts.forEach((draft, index) => {
      if (draft.status === "error") {
        errorRows.push([index, draft]);
        return;
      }
      const flagged =
        draft.result.needsReviewCount > 0 ||
        preflightIssuesByIndex.has(index) ||
        (draft.droppedLinkedPartsCount ?? 0) > 0;
      (flagged ? flaggedOkRows : readyRows).push([index, draft]);
    });
    // Task §4: reviewed items sink to the bottom of the group, computed
    // fresh at render time (a stable sort preserves relative order within
    // each of the two buckets) so the final position is what's shown the
    // very first time this list re-renders after "Finish review" — never a
    // separate reorder pass the user could see happen.
    flaggedOkRows.sort(
      (a, b) =>
        (reviewedIndices.has(a[0]) ? 1 : 0) -
        (reviewedIndices.has(b[0]) ? 1 : 0),
    );
    const needsReviewRows = [...flaggedOkRows, ...errorRows];

    function groupSelectableIndices(rows: [number, ArchiveImportDraft][]) {
      return rows
        .filter(([, draft]) => draft.status === "ok")
        .map(([index]) => index);
    }
    function selectAllInGroup(rows: [number, ArchiveImportDraft][]) {
      const indices = groupSelectableIndices(rows);
      setBatchSelection((prev) => new Set([...prev, ...indices]));
    }
    function selectNoneInGroup(rows: [number, ArchiveImportDraft][]) {
      const indices = new Set(groupSelectableIndices(rows));
      setBatchSelection(
        (prev) => new Set([...prev].filter((i) => !indices.has(i))),
      );
    }
    function groupSelectedCount(rows: [number, ArchiveImportDraft][]) {
      return groupSelectableIndices(rows).filter((index) =>
        batchSelection.has(index),
      ).length;
    }

    // Task §2: one shared selection-controls row (global + both scoped
    // subsections) rather than three unrelated implementations — the count
    // sits to the right of the buttons when there's room, and wraps
    // underneath on narrower widths since it's a separate flex child on a
    // wrapping flex row.
    function renderSelectionControls(
      rows: [number, ArchiveImportDraft][],
      extra?: React.ReactNode,
    ) {
      const total = groupSelectableIndices(rows).length;
      if (total === 0) return null;
      return (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={batchImporting}
              onClick={() => selectAllInGroup(rows)}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={batchImporting}
              onClick={() => selectNoneInGroup(rows)}
            >
              Select none
            </Button>
            {extra}
          </div>
          <span className="text-muted-foreground text-sm">
            {groupSelectedCount(rows)} / {total} selected
          </span>
        </div>
      );
    }

    const allSelectableRows: [number, ArchiveImportDraft][] = [
      ...readyRows,
      ...flaggedOkRows,
    ];

    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
        <Breadcrumbs
          items={[
            { label: collectionLabel, href: basePath },
            { label: "Import" },
          ]}
        />
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          {okCount} ready to import
          {flaggedOkRows.length > 0
            ? ` (${flaggedOkRows.length} need review)`
            : ""}
        </h1>
        {errorCount > 0 && (
          <p className="text-muted-foreground text-sm">
            {errorCount} couldn&apos;t be read and will be skipped.
          </p>
        )}

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-heading text-lg font-medium">
              {collectionLabel}
            </h2>
            <p className="text-muted-foreground text-sm">
              Choose what each item becomes in DishFrame. Recipes are standalone
              dishes; Parts are reusable components that can be included in
              other recipes.
            </p>
          </div>
          {batchResults === null &&
            renderSelectionControls(
              allSelectableRows,
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={batchImporting}
                onClick={requestDiscardBatch}
              >
                Discard import
              </Button>,
            )}
        </section>

        {needsReviewRows.length > 0 && (
          <section className="mt-2 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="font-heading text-base font-medium">
                Needs review
              </h3>
              <p className="text-muted-foreground text-sm">
                The importer found content in these it couldn&apos;t confidently
                place, or a problem that would block saving. That doesn&apos;t
                mean the whole item is wrong — open Review to check, correct, or
                move the flagged content.
              </p>
            </div>
            {batchResults === null && renderSelectionControls(flaggedOkRows)}
            <ul className="flex flex-col gap-2">
              {needsReviewRows.map(([index, draft]) =>
                renderDraftRow(index, draft),
              )}
            </ul>
          </section>
        )}

        {readyRows.length > 0 && (
          <section className="mt-2 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="font-heading text-base font-medium">
                Ready to import
              </h3>
              <p className="text-muted-foreground text-sm">
                No obvious issues found when parsing these recipes.
              </p>
            </div>
            {batchResults === null && renderSelectionControls(readyRows)}
            <ul className="flex flex-col gap-2">
              {readyRows.map(([index, draft]) => renderDraftRow(index, draft))}
            </ul>
          </section>
        )}

        {categoryStats.length > 0 && (
          <section className="mt-2 flex flex-col gap-3">
            <div>
              <h2 className="font-heading text-lg font-medium">
                Classifications
              </h2>
              <p className="text-muted-foreground text-sm">
                These classifications were found on your{" "}
                {collectionLabel.toLowerCase()}. If you want to keep them,
                choose how you&apos;d like to preserve them: as a cuisine, tag,
                or flavor profile. Or ignore them and remove them.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {categoryStats.map(({ category, count }) => {
                const mapping = categoryMappings.get(category) ?? {
                  target: "ignore" as const,
                };
                const isTagOrFlavor =
                  mapping.target === "tag" ||
                  mapping.target === "flavorProfile";
                const options =
                  mapping.target === "tag" ? tagOptions : flavorProfileOptions;
                const isNew = isTagOrFlavor && mapping.selection === "create";
                const targetLabel =
                  mapping.target === "tag" ? "tag" : "flavor profile";
                return (
                  <li
                    key={category}
                    className="border-border rounded-lg border p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground min-w-0 flex-1 text-sm font-medium">
                        {category}
                      </span>
                      <Badge variant="outline">
                        {pluralize(
                          count,
                          kindLabel.toLowerCase(),
                          collectionLabel.toLowerCase(),
                        )}
                      </Badge>
                      <Select
                        value={mapping.target}
                        onValueChange={(value) =>
                          handleSetCategoryTarget(
                            category,
                            value as CategoryMapping["target"],
                          )
                        }
                      >
                        <SelectTrigger
                          className="w-36"
                          aria-label={`Map "${category}" to`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore">Ignore</SelectItem>
                          <SelectItem value="cuisine">Cuisine</SelectItem>
                          <SelectItem value="tag">Tag</SelectItem>
                          <SelectItem value="flavorProfile">
                            Flavor profile
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Task §6: expands the row downward — the top row's
                        own controls never move — instead of inserting a
                        second dropdown beside the first that would shift it. */}
                    {isTagOrFlavor && (
                      <div className="border-border/60 mt-2 flex flex-col gap-2 border-t pt-2">
                        <p className="text-muted-foreground text-xs">
                          Create a new {targetLabel}, or use one you already
                          have.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={isNew}
                              disabled={options.length === 0}
                              aria-label={`Create a new ${targetLabel} for "${category}"`}
                              onCheckedChange={(checked) =>
                                handleSetCategorySelection(
                                  category,
                                  checked
                                    ? "create"
                                    : options[0]
                                      ? `existing:${options[0].id}`
                                      : "create",
                                )
                              }
                            />
                            New
                          </span>
                          <Select
                            value={
                              !isNew
                                ? mapping.selection
                                : options[0]
                                  ? `existing:${options[0].id}`
                                  : undefined
                            }
                            disabled={isNew || options.length === 0}
                            onValueChange={(value) =>
                              handleSetCategorySelection(category, value)
                            }
                          >
                            <SelectTrigger
                              className="w-56"
                              aria-label={`Use an existing ${targetLabel} for "${category}"`}
                            >
                              <SelectValue
                                placeholder={`No existing ${targetLabel}s yet`}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((option) => (
                                <SelectItem
                                  key={option.id}
                                  value={`existing:${option.id}`}
                                >
                                  {option.displayName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {error && (
          <p
            role="alert"
            className="text-destructive-text flex items-center gap-2 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </p>
        )}

        {!batchImporting && (
          <Button
            type="button"
            onClick={handleImportClick}
            disabled={batchSelection.size === 0}
            className="self-start"
          >
            {importButtonLabel}
          </Button>
        )}

        <ConfirmDialog
          open={discardConfirmOpen}
          onOpenChangeAction={setDiscardConfirmOpen}
          title="Discard this import?"
          description="You've reviewed or changed some of these recipes. Discarding throws away the whole pending import workspace — nothing has been saved — and returns you to the start of Import."
          confirmLabel="Discard import"
          destructive
          onConfirmAction={performDiscardBatch}
        />

        {/* Task §8: renders on the same click that starts the import — see
            `handleImportClick`, which flips `batchImporting` before any of
            its async work (resolving "Create new" mappings, then the
            chunked confirm calls) begins. Not dismissible: no close button,
            outside click, or Escape — the same click-guard `Discard
            import`'s absence already gives the row-selection controls. */}
        <BatchProgressDialog
          open={batchImporting}
          title="Importing…"
          progress={{ percent: importProgress }}
        />

        {renderPreflightBlockDialog()}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: basePath },
          { label: "Import" },
        ]}
      />
      <h1 className="font-heading text-foreground text-2xl font-semibold">
        Import a {kindLabel.toLowerCase()}
      </h1>
      <p className="text-muted-foreground text-sm">
        Bring in a {kindLabel.toLowerCase()} from anywhere — paste text, upload
        a file, or import from a recipe website. DishFrame will propose a
        structured {kindLabel.toLowerCase()} for you to review and correct
        before anything is saved.
        {kind === "PART" &&
          " Use this for a reusable sauce, dressing, topping, component, dough, or filling — not a full multi-part recipe."}
      </p>

      <div
        role="tablist"
        aria-label="Import method"
        className="border-border bg-card inline-flex w-fit gap-1 rounded-lg border p-1"
      >
        {(Object.keys(METHOD_LABEL) as ImportMethod[]).map((value) => (
          <Button
            key={value}
            type="button"
            role="tab"
            aria-selected={method === value}
            variant={method === value ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setMethod(value);
              setError(null);
            }}
          >
            {METHOD_LABEL[value]}
          </Button>
        ))}
      </div>

      {method === "paste" && (
        <Field>
          <FieldLabel htmlFor="paste-import-text">
            Pasted {kindLabel.toLowerCase()} text
          </FieldLabel>
          <Textarea
            id="paste-import-text"
            className="bg-card dark:bg-card"
            rows={16}
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={
              kind === "PART"
                ? "Chimichurri\n\n- 1 cup parsley\n- 3 cloves garlic\n- 1/2 cup olive oil\n\n1. Finely chop parsley and garlic.\n2. Stir in oil and season to taste."
                : "Grilled Cheese\n\n- 2 slices bread\n- 1 cup shredded cheddar\n\n1. Butter the bread.\n2. Cook until golden on both sides."
            }
          />
          <FieldDescription>
            Ordinary text works, and Markdown formatting is supported — a top
            &quot;# Title&quot; line, &quot;## Section&quot; headings, and
            bulleted/numbered lists are all recognized. Nothing is saved until
            you review and confirm on the next screen.
          </FieldDescription>
        </Field>
      )}

      {method === "upload" && (
        <Field>
          <FieldLabel htmlFor="file-import-input">
            Upload a {kindLabel.toLowerCase()} file
          </FieldLabel>
          <FileDropzone
            id="file-import-input"
            accept={SUPPORTED_IMPORT_FILE_EXTENSIONS.join(",")}
            onFileSelectedAction={handleFileSelectedFromDropzone}
            disabled={isParsing}
            label={`Drop a ${kindLabel.toLowerCase()} file here, or click to choose`}
            helpText="Supports .md, .txt, .rga (Recipe Gallery export), and .json (DishFrame export) files."
          />
          <FieldDescription>
            A .md or .txt file is read the same way as pasted text; a .rga or
            DishFrame .json export is extracted into a list you can review,
            classify as a recipe or a Part, and import individually or all at
            once. Uploaded files are never stored — nothing is saved until you
            review and confirm.
          </FieldDescription>
        </Field>
      )}

      {method === "website" && (
        <Field>
          <FieldLabel htmlFor="website-import-url">Recipe URL</FieldLabel>
          <Input
            id="website-import-url"
            type="url"
            inputMode="url"
            className="bg-card dark:bg-card"
            placeholder="https://example.com/recipes/grilled-cheese"
            value={urlValue}
            onChange={(event) => setUrlValue(event.target.value)}
          />
          <FieldDescription>
            Paste the link to a recipe page and DishFrame will try to extract
            it. If a page doesn&apos;t work, copy and paste its recipe text
            instead.
          </FieldDescription>
        </Field>
      )}

      {error && (
        <p
          role="alert"
          className="text-destructive-text flex items-center gap-2 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {method === "paste" && (
        <Button
          type="button"
          onClick={handleParsePaste}
          disabled={rawText.trim().length === 0}
          loading={isParsing}
          className="self-start"
        >
          Parse {kindLabel.toLowerCase()}
        </Button>
      )}
      {method === "upload" && isParsing && (
        <p className="text-muted-foreground text-sm">
          Reading file — this can take a moment for a large Recipe Gallery
          export…
        </p>
      )}
      {method === "website" && (
        <Button
          type="button"
          onClick={handleParseWebsite}
          disabled={urlValue.trim().length === 0}
          loading={isParsing}
          className="self-start"
        >
          Import from website
        </Button>
      )}
    </div>
  );
}
