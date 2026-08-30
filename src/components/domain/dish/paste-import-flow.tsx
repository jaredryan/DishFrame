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
  getImportFileKind,
} from "@/lib/importExport/file-sources";
import type { PasteParseResult } from "@/lib/importExport/paste-parser";
import type { ArchiveImportDraft } from "@/lib/importExport/recipe-gallery-import";
import { validateDishContentForPersistence } from "@/lib/dishes/validation-messages";
import { createTag } from "@/lib/tags/actions";
import { initialCreateTagActionState } from "@/lib/tags/schema";
import { createFlavorProfile } from "@/lib/flavor-profiles/actions";
import { initialCreateFlavorProfileActionState } from "@/lib/flavor-profiles/schema";
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

// Source-metadata mapping (task §5): what to do with one discovered Recipe
// Gallery `Category` value. Cuisine has no separate entity to create (it's
// free text on the Dish itself, matching `CuisineField`), so a "cuisine"
// mapping is applied directly; Tag/Flavor profile mappings resolve to a
// real id — either an existing one the user picked, or one this pass
// creates via the exact same `createTag`/`createFlavorProfile` actions
// Settings' Tag/Flavor-profile managers use (same normalized-name dedup,
// so re-resolving is always safe).
type CategoryMapping =
  | { target: "ignore" }
  | { target: "cuisine" }
  | { target: "tag"; selection: string } // "create" | `existing:${id}`
  | { target: "flavorProfile"; selection: string };

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

// Task §12: results-section summary — deliberately Recipe/Part-agnostic,
// matching the task's own "62 imported, 3 failed" phrasing; counts are
// always computed fresh from the live `batchResults` map at render time.
function buildResultsSummary(imported: number, failed: number): string {
  if (failed === 0) {
    return imported === 1
      ? "1 recipe imported."
      : `${imported} recipes imported.`;
  }
  return `${imported} imported, ${failed} failed.`;
}

// Task §12: "Recipes added" assumes every success was a Recipe — wrong for
// a mixed batch, so the section label reflects what actually succeeded.
function successSectionLabel(recipes: number, parts: number): string {
  if (recipes > 0 && parts === 0) return "Recipes added";
  if (parts > 0 && recipes === 0) return "Parts added";
  return "Items added";
}

function resultsTargetPath(recipes: number, parts: number): string {
  return recipes === 0 && parts > 0 ? "/parts" : "/recipes";
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
  cuisineOptions,
  tagOptions: initialTagOptions = [],
  flavorProfileOptions: initialFlavorProfileOptions = [],
}: {
  kind?: DishKindValue;
  cuisineOptions: string[];
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

  // Task §4: tracked so "Discard import" only confirms when there's real
  // pending work to lose (a reviewed draft, a reclassification, or a
  // metadata mapping) — not on every "Start over" click.
  const [hasReviewedAnyDraft, setHasReviewedAnyDraft] = React.useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = React.useState(false);

  // Metadata-mapping follow-up: indices whose Cuisine was manually edited
  // during Review — once set, a category→Cuisine mapping stops overwriting
  // that draft's Cuisine on later Apply/Import/Retry (the manual edit wins).
  const [manualCuisineOverrides, setManualCuisineOverrides] = React.useState<
    Set<number>
  >(new Set());

  // Source-metadata mapping (task §5).
  const [categoryMappings, setCategoryMappings] = React.useState<
    Map<string, CategoryMapping>
  >(new Map());
  const [tagOptions, setTagOptions] = React.useState(initialTagOptions);
  const [flavorProfileOptions, setFlavorProfileOptions] = React.useState(
    initialFlavorProfileOptions,
  );
  const [mappingsApplied, setMappingsApplied] = React.useState(false);

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
    if (getImportFileKind(file.name) === "archive") {
      await handleArchiveFileSelected(file);
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

    setBatchDrafts(result.drafts);
    setBatchSelection(
      new Set(
        result.drafts
          .map((draft, index) => (draft.status === "ok" ? index : -1))
          .filter((index) => index !== -1),
      ),
    );
    // Every successfully parsed row defaults to Recipe.
    setBatchDraftKinds(
      new Map(
        result.drafts
          .map((draft, index): [number, DishKindValue] | null =>
            draft.status === "ok" ? [index, "RECIPE"] : null,
          )
          .filter((entry): entry is [number, DishKindValue] => entry !== null),
      ),
    );
    setBatchResults(null);
    setCategoryMappings(new Map());
    setHasReviewedAnyDraft(false);
    setMappingsApplied(false);
    setManualCuisineOverrides(new Set());
  }

  function handleToggleDraftSelection(index: number) {
    setBatchSelection((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleSelectAllReady() {
    if (!batchDrafts) return;
    setBatchSelection(
      new Set(
        batchDrafts
          .map((draft, index) => (draft.status === "ok" ? index : -1))
          .filter((index) => index !== -1),
      ),
    );
  }

  function handleSelectNone() {
    setBatchSelection(new Set());
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
    // Metadata-mapping follow-up: a Cuisine actually changed during Review
    // is a manual, authoritative edit — locks this index out of future
    // category→Cuisine mapping application (Apply/Import/Retry).
    if (draft.result.values.cuisine !== values.cuisine) {
      setManualCuisineOverrides((prev) => {
        const next = new Set(prev);
        next.add(index);
        return next;
      });
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
    setMappingsApplied(false);
    setManualCuisineOverrides(new Set());
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

  function handleSetCategoryTarget(
    category: string,
    target: CategoryMapping["target"],
  ) {
    setCategoryMappings((prev) => {
      const next = new Map(prev);
      if (target === "ignore" || target === "cuisine") {
        next.set(category, { target });
      } else {
        const options = target === "tag" ? tagOptions : flavorProfileOptions;
        const match = options.find(
          (option) =>
            normalizeForMatch(option.displayName) ===
            normalizeForMatch(category),
        );
        next.set(category, {
          target,
          selection: match ? `existing:${match.id}` : "create",
        });
      }
      return next;
    });
    setMappingsApplied(false);
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
    setMappingsApplied(false);
  }

  // Applies any pending "cuisine" category mapping directly into the
  // matching drafts' `cuisine` field — a *default*, not an authoritative
  // value: a draft whose Cuisine was manually changed during Review
  // (`manualCuisineOverrides`) is skipped, so that explicit edit stays
  // authoritative instead of being overwritten on a later Apply/Import/
  // Retry. Pure/local — no Server Action calls — so it's safe to run from
  // "Apply mappings" as well as automatically before Import/Retry.
  function applyCuisineMappingsToDrafts(
    drafts: ArchiveImportDraft[],
  ): ArchiveImportDraft[] {
    return drafts.map((draft, index) => {
      if (draft.status !== "ok" || !draft.sourceCategory) return draft;
      if (manualCuisineOverrides.has(index)) return draft;
      const mapping = categoryMappings.get(draft.sourceCategory);
      if (mapping?.target !== "cuisine") return draft;
      const existingMatch = cuisineOptions.find(
        (option) =>
          normalizeForMatch(option) ===
          normalizeForMatch(draft.sourceCategory!),
      );
      const cuisineValue = existingMatch ?? draft.sourceCategory;
      if (draft.result.values.cuisine === cuisineValue) return draft;
      return {
        ...draft,
        result: {
          ...draft.result,
          values: { ...draft.result.values, cuisine: cuisineValue },
        },
      };
    });
  }

  function handleApplyCategoryMappings() {
    if (batchDrafts) setBatchDrafts(applyCuisineMappingsToDrafts(batchDrafts));
    setMappingsApplied(true);
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
  }> {
    const workingMappings = new Map(categoryMappings);
    let workingTagOptions = tagOptions;
    let workingFlavorProfileOptions = flavorProfileOptions;

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

    return {
      mappings: workingMappings,
      tagOptions: workingTagOptions,
      flavorProfileOptions: workingFlavorProfileOptions,
    };
  }

  function metadataForDraft(
    draft: OkArchiveDraft,
    mappings: Map<string, CategoryMapping>,
    tagOpts: ImportTagOption[],
    flavorOpts: ImportFlavorProfileOption[],
  ): {
    tags: BulkImportMetadataRef[];
    flavorProfiles: BulkImportMetadataRef[];
  } {
    if (!draft.sourceCategory) return { tags: [], flavorProfiles: [] };
    const mapping = mappings.get(draft.sourceCategory);
    if (
      mapping?.target === "tag" &&
      mapping.selection.startsWith("existing:")
    ) {
      const id = mapping.selection.slice("existing:".length);
      const displayName =
        tagOpts.find((option) => option.id === id)?.displayName ??
        draft.sourceCategory;
      return { tags: [{ id, displayName }], flavorProfiles: [] };
    }
    if (
      mapping?.target === "flavorProfile" &&
      mapping.selection.startsWith("existing:")
    ) {
      const id = mapping.selection.slice("existing:".length);
      const displayName =
        flavorOpts.find((option) => option.id === id)?.displayName ??
        draft.sourceCategory;
      return { tags: [], flavorProfiles: [{ id, displayName }] };
    }
    return { tags: [], flavorProfiles: [] };
  }

  function buildBulkImportItemInput(
    draft: OkArchiveDraft,
    index: number,
    mappings: Map<string, CategoryMapping>,
    tagOpts: ImportTagOption[],
    flavorOpts: ImportFlavorProfileOption[],
  ): BulkImportItemInput {
    const metadata = metadataForDraft(draft, mappings, tagOpts, flavorOpts);
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
      const interval = setInterval(() => {
        setImportProgress((prev) =>
          prev >= cap ? prev : prev + (cap - prev) * 0.15,
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

  async function handleImportClick() {
    if (!batchDrafts || batchSelection.size === 0) return;
    const drafts = applyCuisineMappingsToDrafts(batchDrafts);
    setBatchDrafts(drafts);
    const {
      mappings,
      tagOptions: tagOpts,
      flavorProfileOptions: flavorOpts,
    } = await resolveMetadataMappingsForCommit();
    const indices = [...batchSelection].sort((a, b) => a - b);

    const blocked = indices.filter((index) => {
      const draft = drafts[index];
      return (
        draft.status === "ok" &&
        !validateDishContentForPersistence(draft.result.values).ok
      );
    });
    if (blocked.length > 0) {
      setPreflightBlockedIndices(blocked);
      setPreflightBlockOpen(true);
      return;
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
        ),
      });
    }
    if (items.length === 0) return;

    setBatchImporting(true);
    const results = await runChunkedConfirm(items);
    setBatchImporting(false);
    applyBulkResults(items, results);

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

    const drafts = applyCuisineMappingsToDrafts(batchDrafts);
    setBatchDrafts(drafts);
    const {
      mappings,
      tagOptions: tagOpts,
      flavorProfileOptions: flavorOpts,
    } = await resolveMetadataMappingsForCommit();

    const blocked = failedIndices.filter((index) => {
      const draft = drafts[index];
      return (
        draft.status === "ok" &&
        !validateDishContentForPersistence(draft.result.values).ok
      );
    });
    if (blocked.length > 0) {
      setPreflightBlockedIndices(blocked);
      setPreflightBlockOpen(true);
      return;
    }

    const items = failedIndices.map((index) => {
      const draft = drafts[index] as OkArchiveDraft;
      return {
        index,
        input: buildBulkImportItemInput(
          draft,
          index,
          mappings,
          tagOpts,
          flavorOpts,
        ),
      };
    });

    setBatchImporting(true);
    const results = await runChunkedConfirm(items);
    setBatchImporting(false);
    applyBulkResults(items, results);

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
    return confirmImport(confirmKind, values, sourceLabel);
  }

  // Single-item Save confirmation: `DishEditor` awaits this before
  // persisting a create-mode Save; resolving `null` is a cancel.
  function requestSaveTarget(): Promise<DishKindValue | null> {
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
    const selectionCountsLabel = [
      selectedRecipeCount > 0
        ? pluralize(selectedRecipeCount, "Recipe", "Recipes")
        : null,
      selectedPartCount > 0
        ? pluralize(selectedPartCount, "Part", "Parts")
        : null,
    ]
      .filter((segment): segment is string => segment !== null)
      .join(" · ");

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
          ) : draftParserNeedsReview || draftPreflightFailed ? (
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
      const targetPath = resultsTargetPath(importedRecipes, importedParts);

      return (
        <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
          <Breadcrumbs
            items={[
              { label: collectionLabel, href: basePath },
              { label: "Import" },
            ]}
          />

          <section className="flex flex-col gap-3">
            <h1 className="font-heading text-foreground text-2xl font-semibold">
              Results
            </h1>
            <div className="border-border bg-card rounded-lg border p-4">
              <p className="text-foreground text-sm">
                {buildResultsSummary(
                  succeededEntries.length,
                  failedEntries.length,
                )}
              </p>
            </div>
          </section>

          {failedEntries.length > 0 && (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="font-heading text-lg font-medium">
                  Failed to import
                </h2>
                <p className="text-muted-foreground text-sm">
                  These still need attention. Review a draft to fix it, then
                  retry — successful retries move here to Recipes/Parts added.
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
              <h2 className="font-heading text-lg font-medium">
                {successSectionLabel(importedRecipes, importedParts)}
              </h2>
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
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            href={`${rowKind === "PART" ? "/parts" : "/recipes"}/${result.dishId}`}
                          >
                            View
                          </Link>
                        </Button>
                      </div>
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

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={targetPath}>
                Go to {targetPath === "/parts" ? "Parts" : "Recipes"}
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={performDiscardBatch}
            >
              Import another file
            </Button>
          </div>

          {/* Retry (task §14) can trigger the same preflight block as the
              initial import — this branch returns before the list-view's
              own render of the same shared dialog below. */}
          {renderPreflightBlockDialog()}
        </div>
      );
    }

    const needsReviewRows: [number, ArchiveImportDraft][] = [];
    const readyRows: [number, ArchiveImportDraft][] = [];
    batchDrafts.forEach((draft, index) => {
      const flagged =
        draft.status === "error" ||
        (draft.status === "ok" && draft.result.needsReviewCount > 0) ||
        preflightIssuesByIndex.has(index);
      (flagged ? needsReviewRows : readyRows).push([index, draft]);
    });

    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
        <Breadcrumbs
          items={[
            { label: collectionLabel, href: basePath },
            { label: "Import" },
          ]}
        />
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          {batchDrafts.length} {batchDrafts.length === 1 ? "recipe" : "recipes"}{" "}
          found
        </h1>
        <p className="text-muted-foreground text-sm">
          {okCount} ready to import
          {needsReviewRows.length > 0
            ? ` (${needsReviewRows.length} need review)`
            : ""}
          {errorCount > 0
            ? `, ${errorCount} couldn't be read and will be skipped`
            : ""}
          .
        </p>

        {categoryStats.length > 0 && (
          <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
            <div>
              <h2 className="font-heading text-lg font-medium">
                Source categories
              </h2>
              <p className="text-muted-foreground text-sm">
                Recipe Gallery categories like these stay source metadata, not
                cuisine, unless you map them below. Detected matches against
                your existing Tags/Flavor profiles are pre-selected.
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
                return (
                  <li
                    key={category}
                    className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-2"
                  >
                    <span className="text-foreground min-w-0 flex-1 text-sm font-medium">
                      {category}
                    </span>
                    <Badge variant="outline">
                      {pluralize(count, "recipe", "recipes")}
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
                    {isTagOrFlavor && (
                      <Select
                        value={mapping.selection}
                        onValueChange={(value) =>
                          handleSetCategorySelection(category, value)
                        }
                      >
                        <SelectTrigger
                          className="w-56"
                          aria-label={`Map "${category}" to which ${mapping.target === "tag" ? "tag" : "flavor profile"}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="create">
                            Create new{" "}
                            {mapping.target === "tag"
                              ? "tag"
                              : "flavor profile"}
                            : &quot;{category}&quot;
                          </SelectItem>
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
                    )}
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={handleApplyCategoryMappings}
            >
              Apply mappings
            </Button>
            {mappingsApplied && (
              <p className="text-brand-green-text text-sm">
                Cuisine mappings applied to the matching recipes below. New
                Tags/Flavor profiles are created when you import.
              </p>
            )}
          </section>
        )}

        {batchResults === null && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={batchImporting}
              onClick={handleSelectAllReady}
            >
              Select all ready
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={batchImporting}
              onClick={handleSelectNone}
            >
              Select none
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={batchImporting}
              onClick={requestDiscardBatch}
            >
              Discard import
            </Button>
          </div>
        )}

        <p className="text-muted-foreground text-sm">
          Choose what each item becomes in DishFrame. Recipes are standalone
          dishes; Parts are reusable components that can be included in other
          recipes.
        </p>

        {needsReviewRows.length > 0 && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="font-heading text-lg font-medium">Needs review</h2>
              <p className="text-muted-foreground text-sm">
                The importer found content in these it couldn&apos;t confidently
                place, or a problem that would block saving. That doesn&apos;t
                mean the whole item is wrong — open Review to check, correct, or
                move the flagged content.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {needsReviewRows.map(([index, draft]) =>
                renderDraftRow(index, draft),
              )}
            </ul>
          </section>
        )}

        {readyRows.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-lg font-medium">
              Ready to import
            </h2>
            <ul className="flex flex-col gap-2">
              {readyRows.map(([index, draft]) => renderDraftRow(index, draft))}
            </ul>
          </section>
        )}

        {selectionCountsLabel && (
          <p className="text-muted-foreground text-sm">
            {selectionCountsLabel}
          </p>
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

        {batchImporting ? (
          <div className="flex flex-col gap-2">
            <div
              role="progressbar"
              aria-valuenow={Math.round(importProgress)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="bg-muted h-2 w-full overflow-hidden rounded-full"
            >
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-150 ease-linear"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="text-muted-foreground text-sm">Importing recipes…</p>
            <p className="text-muted-foreground text-sm">
              This may take a moment. Keep this page open.
            </p>
          </div>
        ) : (
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
            helpText="Supports .md, .txt, and .rga (Recipe Gallery export) files."
          />
          <FieldDescription>
            A .md or .txt file is read the same way as pasted text; a .rga
            export is extracted into a list of recipes you can review, classify
            as a recipe or a Part, and import individually or all at once.
            Uploaded files are never stored — nothing is saved until you review
            and confirm.
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
