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
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §56.1's mandatory-review flow, §59's paste-and-review
 * import: step 1 pastes raw text and parses it (no persistence — nothing is
 * created if the user leaves this page); step 2 reuses the ordinary
 * `DishEditor` — pre-filled with the deterministic parser's proposal — as
 * the review/correct/confirm surface, so import confirmation is the exact
 * same validated Save path every other Recipe/Part creation goes through
 * (`confirmImport`, which only additionally tags `sourceKind: "IMPORT"`).
 * §59.2: the original pasted text stays visible for reference throughout
 * review — it's kept in this component's own state, never persisted.
 * Slice 22 logged-in polish pass: `kind` drives whether the parsed content
 * is reviewed and confirmed as a Recipe or a Part — everything else
 * (parsing, review, confirm) is identical either way.
 */
export function PasteImportFlow({
  kind = "RECIPE",
  cuisineOptions,
}: {
  kind?: DishKindValue;
  cuisineOptions: string[];
}) {
  const kindLabel = kind === "PART" ? "Part" : "recipe";
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";
  const basePath = kind === "PART" ? "/parts" : "/recipes";
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
          kind={kind}
          cuisineOptions={cuisineOptions}
          initialValues={parseResult.values}
          onCreate={confirmImport}
          heading={`Review imported ${kindLabel.toLowerCase()}`}
        />
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
        Paste {kindLabel.toLowerCase()} text from Apple Notes, a recipe website,
        a message, or any plain-text document. DishFrame will propose a
        structured {kindLabel.toLowerCase()} for you to review and correct
        before anything is saved.
        {kind === "PART" &&
          " Use this for a reusable sauce, dressing, topping, component, dough, or filling — not a full multi-part recipe."}
      </p>
      <Field>
        <FieldLabel htmlFor="paste-import-text">
          Pasted {kindLabel.toLowerCase()} text
        </FieldLabel>
        <Textarea
          id="paste-import-text"
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
          Nothing is saved until you review and confirm on the next screen.
        </FieldDescription>
      </Field>
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
        onClick={handleParse}
        disabled={isParsing || rawText.trim().length === 0}
        className="self-start"
      >
        {isParsing ? "Parsing…" : `Parse ${kindLabel.toLowerCase()}`}
      </Button>
    </div>
  );
}
