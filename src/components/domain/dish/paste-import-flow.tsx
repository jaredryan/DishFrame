"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import {
  proposeImportFromPaste,
  proposeImportFromUrl,
  confirmImport,
  confirmImportBatch,
  type BulkImportItemInput,
  type BulkImportItemResult,
} from "@/lib/importExport/actions";
import {
  SUPPORTED_IMPORT_FILE_EXTENSIONS,
  extractTextFromImportFile,
  extractRecipesFromArchiveFile,
  getImportFileKind,
} from "@/lib/importExport/file-sources";
import type { PasteParseResult } from "@/lib/importExport/paste-parser";
import type { ArchiveImportDraft } from "@/lib/importExport/recipe-gallery-import";
import type {
  DishActionState,
  DishContentInput,
  DishKindValue,
} from "@/lib/dishes/schema";

const ARCHIVE_SOURCE_LABEL_MAX_LENGTH = 200;
// Task §3: keeps each `confirmImportBatch` Server Action call's sequential
// persistence work well under a typical serverless function's execution
// time ceiling for a large (e.g. 65-recipe) archive, without going as far
// as one call per item — see handleBulkImport below.
const BULK_IMPORT_CHUNK_SIZE = 15;

type ImportMethod = "paste" | "upload" | "website";

const METHOD_LABEL: Record<ImportMethod, string> = {
  paste: "Paste text",
  upload: "Upload file",
  website: "Import from website",
};

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

// Task §6: "Imported 62 items. 3 could not be imported." for a partial
// failure — deliberately Recipe/Part-agnostic, matching the task's own
// example copy.
function buildPartialSummary(imported: number, failed: number): string {
  return `Imported ${pluralize(imported, "item", "items")}. ${failed} could not be imported.`;
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
 * Slice 22 logged-in polish pass: `kind` drives whether the parsed content
 * is reviewed and confirmed as a Recipe or a Part — everything else
 * (parsing, review, confirm) is identical either way.
 * Importer follow-up pass: for a *single*-item import, `kind` no longer
 * decides the persisted target on its own — Save opens an explicit
 * Recipe/Part confirmation dialog (task §3). A *batch* (`.rga`) import
 * instead classifies each row up front (defaulting to Recipe, task §4) and
 * persists the whole selection in one `confirmImportBatch` call (task §5).
 */
export function PasteImportFlow({
  kind = "RECIPE",
  cuisineOptions,
}: {
  kind?: DishKindValue;
  cuisineOptions: string[];
}) {
  const router = useRouter();
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

  // Single-item import Save confirmation (task §3): resolves the promise
  // `DishEditor`'s `confirmCreateTargetAction` hands back — `null` when the
  // user cancels. Never used for a batch-item Review save (see
  // `batchReviewIndex` below), which never shows this dialog.
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
  // Per-row Recipe/Part classification (task §4) — every successfully
  // parsed row defaults to Recipe; only present for "ok" rows.
  const [batchDraftKinds, setBatchDraftKinds] = React.useState<
    Map<number, DishKindValue>
  >(new Map());
  // Which row (if any) is open in the shared review step below. Reviewing a
  // batch row reuses that exact same `DishEditor` review UI, but Save there
  // (task §4's "Batch Review behavior") only updates the pending draft in
  // memory and returns here — it never persists or navigates away.
  const [batchReviewIndex, setBatchReviewIndex] = React.useState<number | null>(
    null,
  );
  const [batchImporting, setBatchImporting] = React.useState(false);
  const [batchResults, setBatchResults] = React.useState<Map<
    number,
    BulkImportItemResult
  > | null>(null);

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

  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

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
    // Task §4: every successfully parsed row defaults to Recipe.
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
    setBatchReviewIndex(index);
    setParseResult(draft.result);
    setSourceLabel(archiveDraftSourceLabel(draft));
    setOriginalText(null);
  }

  // Batch Review's `onCreate` override (task §4): never calls the server —
  // it only writes the edited values back into the pending batch draft and
  // reports a synthetic success so `DishEditor` treats the Save as
  // complete. Classification (Recipe/Part) is controlled by the row toggle
  // in the list, not by this step, and is left untouched here.
  async function handleBatchItemReviewSave(
    _targetKind: DishKindValue,
    values: DishContentInput,
  ): Promise<DishActionState> {
    if (batchReviewIndex === null) {
      return { status: "error", message: "Nothing to update." };
    }
    const index = batchReviewIndex;
    setBatchDrafts((prev) => {
      if (!prev) return prev;
      const draft = prev[index];
      if (draft.status !== "ok") return prev;
      const next = [...prev];
      next[index] = { ...draft, result: { ...draft.result, values } };
      return next;
    });
    return { status: "success", dishId: "pending" };
  }

  function handleStartOverBatch() {
    setBatchDrafts(null);
    setBatchSelection(new Set());
    setBatchDraftKinds(new Map());
    setBatchReviewIndex(null);
    setBatchResults(null);
    setError(null);
  }

  async function handleBulkImport() {
    if (!batchDrafts || batchSelection.size === 0) return;
    const indices = [...batchSelection].sort((a, b) => a - b);

    const items: Array<{ index: number; input: BulkImportItemInput }> = [];
    for (const index of indices) {
      const draft = batchDrafts[index];
      if (draft.status !== "ok") continue;
      items.push({
        index,
        input: {
          sourceRef: draft.sourceRef,
          kind: batchDraftKinds.get(index) ?? "RECIPE",
          values: draft.result.values,
          sourceLabel: archiveDraftSourceLabel(draft),
        },
      });
    }
    if (items.length === 0) return;

    setBatchImporting(true);
    // Task §2/§3: one `confirmImportBatch` call per ~15 items rather than
    // one call for the whole selection. The normalized payload itself is
    // comfortably small even for a real 65-recipe archive (well under
    // typical Server Action body limits), but persisting each item is its
    // own DB transaction (createDish/createDishWithVersion) — 65 of those
    // run sequentially in one call risks a large archive's import
    // approaching a serverless function's execution-time ceiling. A chunk
    // failing outright (e.g. a timeout) is caught and reported as a failed
    // result for just that chunk's items — it never stops the rest.
    const results: BulkImportItemResult[] = [];
    for (let i = 0; i < items.length; i += BULK_IMPORT_CHUNK_SIZE) {
      const chunk = items.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
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
      }
    }
    setBatchImporting(false);

    const nextResults = new Map<number, BulkImportItemResult>();
    let importedRecipes = 0;
    let importedParts = 0;
    let failed = 0;
    items.forEach(({ index, input }, i) => {
      const result = results[i];
      if (result) nextResults.set(index, result);
      if (result?.status === "success") {
        if (input.kind === "PART") importedParts++;
        else importedRecipes++;
      } else {
        failed++;
      }
    });
    setBatchResults(nextResults);

    if (failed === 0) {
      showToast({
        title: buildFullSuccessSummary(importedRecipes, importedParts),
        variant: "success",
      });
      // Task §4: all-Recipes → /recipes, all-Parts → /parts, mixed → /recipes
      // (a mixed batch has no single natural collection page).
      router.push(
        importedRecipes === 0 && importedParts > 0 ? "/parts" : "/recipes",
      );
    } else {
      showToast({
        title: buildPartialSummary(importedRecipes + importedParts, failed),
        variant: "error",
        durationMs: null,
      });
    }
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

  function handleDiscard() {
    setParseResult(null);
    setSourceLabel(undefined);
    setOriginalText(null);
    setShowOriginal(false);
    setError(null);
    setBatchReviewIndex(null);
  }

  async function handleConfirmCreate(
    confirmKind: DishKindValue,
    values: DishContentInput,
  ) {
    return confirmImport(confirmKind, values, sourceLabel);
  }

  // Single-item Save confirmation (task §3): `DishEditor` awaits this
  // before persisting a create-mode Save; resolving `null` is a cancel.
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
              review&quot; section below before saving.
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
          variant="outline"
          className="self-start"
          onClick={handleDiscard}
        >
          {isBatchReview ? "Back to recipe list" : "Discard and start over"}
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
          onCreatedAction={isBatchReview ? handleDiscard : undefined}
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
    const okCount = batchDrafts.filter((d) => d.status === "ok").length;
    const needsReviewCount = batchDrafts.filter(
      (d) => d.status === "ok" && d.result.needsReviewCount > 0,
    ).length;
    const errorCount = batchDrafts.length - okCount;

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
          {needsReviewCount > 0 ? ` (${needsReviewCount} need review)` : ""}
          {errorCount > 0
            ? `, ${errorCount} couldn't be read and will be skipped`
            : ""}
          .
        </p>

        {batchResults ? (
          <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-foreground text-sm">
              {[...batchResults.values()].filter((r) => r.status === "error")
                .length === 0
                ? "Everything imported successfully."
                : `${[...batchResults.values()].filter((r) => r.status === "success").length} imported, ${[...batchResults.values()].filter((r) => r.status === "error").length} failed.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/recipes">Go to Recipes</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleStartOverBatch}
              >
                Import another file
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAllReady}
            >
              Select all ready
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectNone}
            >
              Select none
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStartOverBatch}
            >
              Start over
            </Button>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {batchDrafts.map((draft, index) => {
            const title =
              draft.status === "ok"
                ? draft.result.values.title || "Untitled recipe"
                : draft.sourceRef;
            const draftNeedsReview =
              draft.status === "ok" && draft.result.needsReviewCount > 0;
            const rowResult = batchResults?.get(index);
            const rowKind = batchDraftKinds.get(index) ?? "RECIPE";

            return (
              <li
                key={draft.sourceRef}
                className="border-border bg-card flex items-start gap-3 rounded-lg border p-3"
              >
                {!batchResults && (
                  <Checkbox
                    className="mt-1"
                    disabled={draft.status !== "ok"}
                    checked={batchSelection.has(index)}
                    onCheckedChange={() => handleToggleDraftSelection(index)}
                    aria-label={`Import ${title}`}
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground truncate text-sm font-medium">
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
                    ) : (
                      <>
                        {draft.status === "error" && (
                          <Badge variant="destructive">
                            <CircleX /> Couldn&apos;t be read
                          </Badge>
                        )}
                        {draftNeedsReview && (
                          <Badge variant="outline">Needs review</Badge>
                        )}
                        {draft.status === "ok" && !draftNeedsReview && (
                          <Badge variant="secondary">
                            <CircleCheck /> Parsed
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                  {draft.status === "error" && (
                    <p className="text-muted-foreground text-xs">
                      {draft.message}
                    </p>
                  )}
                  {rowResult?.status === "error" && (
                    <p className="text-muted-foreground text-xs">
                      {rowResult.message}
                    </p>
                  )}
                </div>
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
                      onClick={() => handleReviewDraft(index)}
                    >
                      Review
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {!batchResults && (
          <>
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

            <Button
              type="button"
              onClick={handleBulkImport}
              disabled={batchSelection.size === 0}
              loading={batchImporting}
              className="self-start"
            >
              {importButtonLabel}
            </Button>
          </>
        )}
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
          <Input
            id="file-import-input"
            type="file"
            accept={SUPPORTED_IMPORT_FILE_EXTENSIONS.join(",")}
            onChange={handleFileSelected}
            className="bg-card dark:bg-card"
          />
          <FieldDescription>
            Markdown (.md), text (.txt), and Recipe Gallery exports (.rga) are
            all supported. A .md or .txt file is read the same way as pasted
            text; a .rga export is extracted into a list of recipes you can
            review, classify as a recipe or a Part, and import individually or
            all at once. Uploaded files are never stored — nothing is saved
            until you review and confirm.
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
