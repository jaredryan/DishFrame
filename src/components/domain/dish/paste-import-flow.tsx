"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import {
  proposeImportFromPaste,
  confirmImport,
} from "@/lib/importExport/actions";
import type { PasteParseResult } from "@/lib/importExport/paste-parser";

/**
 * PRODUCT_SPEC.md §56.1's mandatory-review flow, §59's paste-and-review
 * import: step 1 pastes raw text and parses it (no persistence — nothing is
 * created if the user leaves this page); step 2 reuses the ordinary
 * `DishEditor` — pre-filled with the deterministic parser's proposal — as
 * the review/correct/confirm surface, so import confirmation is the exact
 * same validated Save path every other Recipe creation goes through
 * (`confirmImport`, which only additionally tags `sourceKind: "IMPORT"`).
 * §59.2: the original pasted text stays visible for reference throughout
 * review — it's kept in this component's own state, never persisted.
 */
export function PasteImportFlow({
  cuisineOptions,
}: {
  cuisineOptions: string[];
}) {
  const [rawText, setRawText] = React.useState("");
  const [isParsing, setIsParsing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [parseResult, setParseResult] = React.useState<PasteParseResult | null>(
    null,
  );
  const [showOriginal, setShowOriginal] = React.useState(false);

  async function handleParse() {
    setError(null);
    setIsParsing(true);
    const result = await proposeImportFromPaste(rawText);
    setIsParsing(false);
    if (result.status === "success") {
      setParseResult(result.result);
    } else {
      setError(result.message);
    }
  }

  if (parseResult) {
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
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => setShowOriginal((v) => !v)}
          >
            {showOriginal ? "Hide" : "Show"} original pasted text
          </Button>
          {showOriginal && (
            <pre className="border-border bg-card text-muted-foreground mt-2 max-h-64 overflow-auto rounded-lg border p-3 text-xs whitespace-pre-wrap">
              {rawText}
            </pre>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setParseResult(null)}
        >
          Discard and start over
        </Button>
        <DishEditor
          kind="RECIPE"
          cuisineOptions={cuisineOptions}
          initialValues={parseResult.values}
          onCreate={confirmImport}
          heading="Review imported recipe"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
      <Breadcrumbs
        items={[{ label: "Recipes", href: "/recipes" }, { label: "Import" }]}
      />
      <h1 className="font-heading text-foreground text-2xl font-semibold">
        Import a recipe
      </h1>
      <p className="text-muted-foreground text-sm">
        Paste recipe text from Apple Notes, a recipe website, a message, or any
        plain-text document. DishFrame will propose a structured recipe for you
        to review and correct before anything is saved.
      </p>
      <Field>
        <FieldLabel htmlFor="paste-import-text">Pasted recipe text</FieldLabel>
        <Textarea
          id="paste-import-text"
          rows={16}
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder={
            "Grilled Cheese\n\n- 2 slices bread\n- 1 cup shredded cheddar\n\n1. Butter the bread.\n2. Cook until golden on both sides."
          }
        />
        <FieldDescription>
          Nothing is saved until you review and confirm on the next screen.
        </FieldDescription>
      </Field>
      {error && (
        <p className="text-destructive-text flex items-center gap-2 text-sm">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </p>
      )}
      <Button
        type="button"
        onClick={handleParse}
        disabled={isParsing || rawText.trim().length === 0}
        className="self-start"
      >
        {isParsing ? "Parsing…" : "Parse recipe"}
      </Button>
    </div>
  );
}
