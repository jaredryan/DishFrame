"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { AlertCircle, Plus } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { NumberField } from "@/components/domain/dish/number-field";
import { NutritionFields } from "@/components/domain/dish/nutrition-fields";
import { SectionFields } from "@/components/domain/dish/section-fields";
import { CuisineField } from "@/components/domain/dish/cuisine-field";
import { ImageField } from "@/components/domain/dish/image-field";
import { PartLinkFields } from "@/components/domain/dish/part-link-fields";
import { PartAttachPicker } from "@/components/domain/dish/part-attach-picker";
import { CreatePartLink } from "@/components/domain/dish/create-part-link";
import type { DetachedContent } from "@/lib/sections/service";
import { useUnsavedChangesGuard } from "@/components/domain/dish/use-unsaved-changes-guard";
import { CoachMark } from "@/components/onboarding/coach-mark";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import {
  blankDishFormValues,
  type DishFormValues,
} from "@/components/domain/dish/dish-form-values";
import {
  createDish,
  editDish,
  updateVersionNote,
  setDefaultScale,
} from "@/lib/dishes/actions";
import {
  removeEmptySections,
  hasMinimumContent,
  diffVersionContent,
  isBlankSubstitute,
  normalizeQuantity,
  stageValues,
  difficultyValues,
  type DishKindValue,
  type VersionChoiceValue,
} from "@/lib/dishes/schema";

const STAGE_LABEL: Record<(typeof stageValues)[number], string> = {
  IDEA: "Idea",
  EXPERIMENTAL: "Experimental",
  PROVEN: "Proven",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

// An effective 1× scale (unset, non-positive, or explicitly typed "1") is
// stored as `null` — a preference-only field, not a second authored
// quantity. Keeps the "unchanged effective 1×" case from producing an
// unnecessary setDefaultScale call even when the user typed "1" by hand.
function normalizeDefaultScale(value: number | null): number | null {
  return value != null && value > 0 && value !== 1 ? value : null;
}

// Design remediation pass: edited alongside every other field in this one
// form, but not part of `dishContentSchema`/`DishFormValues` — each keeps
// its own existing non-material persistence path (`updateVersionNote`/
// `setDefaultScale`), called directly after a successful Save rather than
// folded into createDish/editDish's cooking-change classification. Only
// shown (and only meaningful) once a Dish/Version already exists.
type EditorExtras = {
  note: string;
  defaultScale: number | null;
};
type EditorFormValues = DishFormValues & EditorExtras;

// PRODUCT_SPEC.md §39.4/§39.5 — the read-only evidence a Cooking Session or
// Review's "Edit Recipe"/"Edit Part" action can hand the editor. Shown in a
// Sheet the form never reacts to (§39.4: "accessible without losing unsaved
// edits") — never merged into form state, never copied into content fields.
export type EditorSessionEvidence = {
  sessionId: string;
  outcome: "COMPLETED" | "ENDED_EARLY";
  endedAt: Date | string | null;
  cookedVersionLabel: string;
  cookingNotes: string | null;
  review: {
    whatWentWell: string | null;
    whatDidNotGoWell: string | null;
    anythingElse: string | null;
    actualAmountQuantity: number | null;
    actualAmountUnit: string | null;
    reviewAdjustedDurationSeconds: number | null;
  } | null;
  ratings: Array<{ tasterName: string; isOwner: boolean; value: number }>;
};

export function DishEditor({
  kind,
  dish,
  cuisineOptions = [],
  initialValues,
  onCreate,
  heading,
}: {
  kind: DishKindValue;
  // Slice 11: seeds create-mode `defaultValues` in place of
  // `blankDishFormValues()` — used by the paste-and-review importer to
  // pre-fill the editor with the deterministic parser's proposal, so the
  // reviewer edits/corrects/confirms through this exact same form rather
  // than a parallel review UI. Ignored once `dish` is set (edit mode
  // already has its own loaded values).
  initialValues?: DishFormValues;
  // Slice 11: overrides the create-mode save call — the paste importer
  // passes `confirmImport` (which tags the new Dish's `sourceKind` as
  // `IMPORT` before funneling into this exact same `createDish` service
  // function) instead of the ordinary `createDish` action. Defaults to the
  // ordinary action so every existing "New Recipe/Part" caller is
  // unaffected.
  onCreate?: typeof createDish;
  // Slice 11: overrides the computed "New Recipe/Part" heading — the
  // importer uses this for "Review imported recipe/part" so the reviewer
  // understands they're confirming a parsed proposal, not starting blank.
  heading?: string;
  dish?: {
    id: string;
    // The Version this edit is based on — any saved Version belonging to
    // the Dish (Slice 4 correction pass §1: not restricted to the current
    // Version or to a major line's latest minor), reached from that
    // Version's own detail page (PRODUCT_SPEC.md §13.4/§13.7) or from a
    // Session Review's "Edit Recipe"/"Edit Part" action pinned to the exact
    // cooked Version (§39.5).
    baseVersionId: string;
    baseMajorVersion: number;
    baseMinorVersion: number;
    // The Dish's highest existing major, independent of which line is
    // being edited — "Start a new version" always creates the *next*
    // major overall (Arch §F.5), not `baseMajorVersion + 1`, which would
    // be wrong whenever the base isn't already the current line.
    highestMajorVersion: number;
    // MAX(minorVersion) + 1 within the base's own major line — not
    // `baseMinorVersion + 1` (Slice 4 correction pass §1): branching from
    // an older saved minor while later ones already exist still allocates
    // the line's next overall minor.
    nextMinorVersion: number;
    // Whether `baseVersionId` is the Dish's current Version — used only to
    // decide whether to show the "you're not editing the current version"
    // banner below, independent of which major line it's in.
    isCurrent: boolean;
    // The Dish's actual current Version label, shown alongside the base
    // being edited whenever they differ (§39.5's "clearly identifies the
    // cooked Version [and] the current Version"). Omitted/null when
    // `isCurrent`, or when the caller doesn't have it on hand.
    currentMajorVersion?: number | null;
    currentMinorVersion?: number | null;
    values: DishFormValues;
    // Design remediation pass: the consolidated editor is now the one place
    // to edit these, alongside title/description/image/etc — previously
    // each had its own standalone detail-page control
    // (VersionNoteEditor/ScaledVersionView's "Save as default"). Both keep
    // their existing non-material persistence (`updateVersionNote`/
    // `setDefaultScale`, called directly, never through
    // createDish/editDish's own cooking-change classification) — only
    // *where* they're edited changed, not how they're saved.
    note: string | null;
    defaultScale: number | null;
    // Present only when reached via a Cooking Session/Review's Edit action
    // for a session that belongs to this Dish (§39.4).
    evidence?: EditorSessionEvidence | null;
  };
  cuisineOptions?: string[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [pendingCookingChange, setPendingCookingChange] = React.useState<{
    cleaned: DishFormValues;
    extras: EditorExtras;
  } | null>(null);

  const form = useForm<EditorFormValues>({
    defaultValues: dish
      ? {
          ...dish.values,
          note: dish.note ?? "",
          defaultScale: dish.defaultScale,
        }
      : {
          ...(initialValues ?? blankDishFormValues()),
          note: "",
          defaultScale: null,
        },
  });
  const { control, register, handleSubmit, formState, setError, getValues } =
    form;
  const sections = useFieldArray({ control, name: "sections" });
  const topLevelPartLinks = useFieldArray({ control, name: "partLinks" });
  const sectionSensors = useReorderSensors();

  // Build Plan Review Gate 3's "unified authored order": top-level Sections
  // and top-level linked Parts share one authored sequence. Both are still
  // two separate `useFieldArray`s (the schema/type change stayed minimal)
  // — this merges them for *rendering and reordering
  // only*, sorted by each item's own live `position` value (not array
  // index, which no longer reflects true order once the two arrays
  // interleave).
  const watchedSections = useWatch({ control, name: "sections" });
  const watchedTopLevelPartLinks = useWatch({ control, name: "partLinks" });

  // Slice 6A: "Default scale" is a live-computed preview, not a second
  // authored quantity/unit — the result text always derives from the
  // authored yield × the (draft) scale, never a separately stored value.
  const watchedYieldQuantity = useWatch({ control, name: "yieldQuantity" });
  const watchedYieldUnit = useWatch({ control, name: "yieldUnit" });
  const watchedDefaultScale = useWatch({ control, name: "defaultScale" });
  const effectiveDefaultScale =
    watchedDefaultScale != null && watchedDefaultScale > 0
      ? watchedDefaultScale
      : 1;
  const defaultScaleResultText =
    watchedYieldQuantity != null
      ? `adjusted to ${normalizeQuantity(watchedYieldQuantity * effectiveDefaultScale)}${watchedYieldUnit ? ` ${watchedYieldUnit}` : ""}`
      : null;

  type TopLevelEntry =
    | { kind: "section"; fieldId: string; index: number; position: number }
    | { kind: "partLink"; fieldId: string; index: number; position: number };

  const topLevelEntries: TopLevelEntry[] = [
    ...sections.fields.map((field, index) => ({
      kind: "section" as const,
      fieldId: field.id,
      index,
      position: watchedSections?.[index]?.position ?? index,
    })),
    ...topLevelPartLinks.fields.map((field, index) => ({
      kind: "partLink" as const,
      fieldId: field.id,
      index,
      position: watchedTopLevelPartLinks?.[index]?.position ?? index,
    })),
  ].sort((a, b) => a.position - b.position);

  function nextTopLevelPosition(): number {
    return topLevelEntries.length === 0
      ? 0
      : Math.max(...topLevelEntries.map((entry) => entry.position)) + 1;
  }

  // Slice 6, PRODUCT_SPEC.md §70.1: a top-level detach keeps each of the
  // target Part Version's own Sections intact as brand-new top-level
  // Sections (there's room for real nesting here, unlike inside a single
  // Section — see `SectionFields`'s own detach handler for that case), and
  // promotes the target's own top-level linked Parts into this container's
  // top-level linked Parts. Each newly-appended item gets the next slot in
  // the unified sequence.
  function handleTopLevelDetach(
    partLinkIndex: number,
    content: DetachedContent,
  ) {
    let nextPosition = nextTopLevelPosition();
    content.sections.forEach((section) => {
      sections.append({ ...section, position: nextPosition });
      nextPosition += 1;
    });
    content.partLinks.forEach((link) => {
      topLevelPartLinks.append({ ...link, position: nextPosition });
      nextPosition += 1;
    });
    topLevelPartLinks.remove(partLinkIndex);
  }

  function handleTopLevelDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = topLevelEntries.findIndex((e) => e.fieldId === active.id);
    const newIndex = topLevelEntries.findIndex((e) => e.fieldId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(topLevelEntries, oldIndex, newIndex);
    reordered.forEach((entry, position) => {
      if (entry.position === position) return;
      if (entry.kind === "section") {
        form.setValue(`sections.${entry.index}.position`, position, {
          shouldDirty: true,
        });
      } else {
        form.setValue(`partLinks.${entry.index}.position`, position, {
          shouldDirty: true,
        });
      }
    });
  }

  const topLevelAnnouncements = createReorderAnnouncements(
    (id) => {
      const entry = topLevelEntries.find((e) => e.fieldId === id);
      if (!entry) return "item";
      if (entry.kind === "section") {
        const name = getValues(
          `sections.${entry.index}.name` as never,
        ) as unknown as string | null;
        return name || `section ${entry.index + 1}`;
      }
      return "linked part";
    },
    (id) => ({
      index: topLevelEntries.findIndex((e) => e.fieldId === id),
      total: topLevelEntries.length,
    }),
  );

  const guard = useUnsavedChangesGuard(formState.isDirty && !isSubmitting);

  const basePath = kind === "PART" ? "/parts" : "/recipes";
  const kindLabel = kind === "PART" ? "Part" : "Recipe";
  const cancelHref = dish ? `${basePath}/${dish.id}` : basePath;

  // Design remediation pass: fires only when a Dish already exists and the
  // relevant field actually changed from what the editor loaded — same
  // "only touch what changed" discipline `editDish` itself already applies
  // to stable/version-metadata/cooking content. Both calls stay entirely
  // independent of the cooking-change Version choice; neither ever creates
  // a Version.
  async function applyEditorExtras(extras: EditorExtras) {
    if (!dish) return;
    const tasks: Promise<unknown>[] = [];

    const nextNote = extras.note.trim() || null;
    if (nextNote !== (dish.note ?? null)) {
      tasks.push(
        updateVersionNote(kind, {
          dishId: dish.id,
          versionId: dish.baseVersionId,
          note: nextNote,
        }),
      );
    }

    if (extras.defaultScale !== dish.defaultScale) {
      tasks.push(
        setDefaultScale(kind, {
          dishId: dish.id,
          defaultScale: extras.defaultScale,
        }),
      );
    }

    if (tasks.length > 0) await Promise.all(tasks);
  }

  async function performSave(
    cleaned: DishFormValues,
    extras: EditorExtras,
    versionChoice?: VersionChoiceValue,
  ) {
    setIsSubmitting(true);
    const result = dish
      ? await editDish(
          kind,
          dish.id,
          dish.baseVersionId,
          cleaned,
          versionChoice,
        )
      : await (onCreate ?? createDish)(kind, cleaned);

    if (result.status === "success" && result.dishId) {
      await applyEditorExtras(extras);
      form.reset({ ...cleaned, ...extras });
      router.push(`${basePath}/${result.dishId}`);
      router.refresh();
    } else {
      setServerError(result.message ?? "Could not save. Please try again.");
      setIsSubmitting(false);
    }
  }

  async function onSubmit(values: EditorFormValues) {
    setServerError(null);
    const { note, defaultScale, ...contentValues } = values;
    const extras: EditorExtras = {
      note,
      defaultScale: normalizeDefaultScale(defaultScale),
    };

    const cleaned: DishFormValues = {
      ...contentValues,
      sections: contentValues.sections.map((section) => ({
        ...section,
        ingredients: section.ingredients
          .filter((ingredient) => ingredient.name.trim().length > 0)
          .map((ingredient) => ({
            ...ingredient,
            // A completely unused "Add substitute" click (every field still
            // blank) must never itself fail validation — drop it here so
            // the server never sees it (Gate 2 remediation). A *partially*
            // filled-in substitute (something set, but no name) is not
            // blank, and is instead caught as a field-level error below.
            substitute: isBlankSubstitute(ingredient.substitute)
              ? null
              : ingredient.substitute,
          })),
        instructions: section.instructions.filter(
          (instruction) => instruction.text.trim().length > 0,
        ),
      })),
    };

    let hasPartialSubstitute = false;
    cleaned.sections.forEach((section, sectionIndex) => {
      section.ingredients.forEach((ingredient, ingredientIndex) => {
        if (ingredient.substitute && !ingredient.substitute.name.trim()) {
          hasPartialSubstitute = true;
          setError(
            `sections.${sectionIndex}.ingredients.${ingredientIndex}.substitute.name` as never,
            {
              type: "manual",
              message: "Enter a substitute name, or remove the substitute.",
            },
          );
        }
      });
    });
    if (hasPartialSubstitute) {
      setServerError(
        "Fix the highlighted substitute before saving — enter a name, or remove it.",
      );
      return;
    }

    if (
      !hasMinimumContent(
        removeEmptySections(cleaned.sections),
        cleaned.partLinks,
      )
    ) {
      setServerError(
        "Add at least one ingredient, instruction, or linked Part before saving.",
      );
      return;
    }

    // Only an existing Dish's edit can require the minor/major choice — a
    // new Dish always starts at V1.0, nothing to diff against.
    if (dish) {
      const { cookingChanged } = diffVersionContent(
        { sections: dish.values.sections, partLinks: dish.values.partLinks },
        { sections: cleaned.sections, partLinks: cleaned.partLinks },
      );
      if (cookingChanged) {
        setPendingCookingChange({ cleaned, extras });
        return;
      }
    }

    await performSave(cleaned, extras);
  }

  function chooseVersion(versionChoice: VersionChoiceValue) {
    if (!pendingCookingChange) return;
    const { cleaned, extras } = pendingCookingChange;
    setPendingCookingChange(null);
    void performSave(cleaned, extras, versionChoice);
  }

  // Slice 4 correction pass §1: any saved Version may be the edit base, not
  // just a major line's latest minor, so the next minor is `MAX(minorVersion)
  // + 1` within the base's own line (`dish.nextMinorVersion`, computed
  // server-side) — never `baseMinorVersion + 1`, which is only correct when
  // the base already happens to be that line's latest minor. "Start a new
  // version" always creates the *next major overall* (Arch §F.5), computed
  // from the Dish's highest existing major — not from whichever line is
  // being edited, which matters as soon as that line is historical.
  const versionChoiceLabels = dish
    ? {
        major: `Starts V${dish.highestMajorVersion + 1}.0`,
        minor: `Saves as V${dish.baseMajorVersion}.${dish.nextMinorVersion}`,
      }
    : null;
  const editingNonCurrentVersion = !!dish && !dish.isCurrent;

  const editorHeading =
    heading ?? `${dish ? "Edit" : "New"} ${kindLabel.toLowerCase()}`;
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";
  const breadcrumbItems = dish
    ? [
        { label: collectionLabel, href: basePath },
        {
          label: dish.values.title || `Untitled ${kindLabel.toLowerCase()}`,
          href: `${basePath}/${dish.id}`,
        },
        { label: "Edit" },
      ]
    : [
        { label: collectionLabel, href: basePath },
        { label: `New ${kindLabel.toLowerCase()}` },
      ];

  return (
    <FormProvider {...form}>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
        <Breadcrumbs items={breadcrumbItems} />
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          {editorHeading}
        </h1>

        {!dish && kind === "RECIPE" && (
          <CoachMark
            guideKey="recipe-sections-stage"
            title="Sections and Stage"
          >
            Break a Recipe into{" "}
            <strong className="text-foreground">Sections</strong> (a marinade, a
            filling, a garnish) — each can be written just for this Recipe, or
            linked to a saved Part.{" "}
            <strong className="text-foreground">Stage</strong> tracks how far
            along a Recipe is (Idea, Testing, Keeper, etc.), separate from its
            content.
          </CoachMark>
        )}

        {dish && (
          <CoachMark guideKey="editor-versions" title="Versions">
            Saving here never overwrites what you had — it either refines the
            current Version or starts a new one, so earlier attempts stay
            available in the history below.
          </CoachMark>
        )}

        {editingNonCurrentVersion && dish && (
          <p className="border-border bg-card text-muted-foreground rounded-lg border px-3 py-2 text-sm">
            You&apos;re editing V{dish.baseMajorVersion}.{dish.baseMinorVersion}
            {dish.currentMajorVersion != null &&
            dish.currentMinorVersion != null
              ? ` — the current version is V${dish.currentMajorVersion}.${dish.currentMinorVersion}`
              : ", not the current version"}
            . Saving as a refinement adds V{dish.baseMajorVersion}.
            {dish.nextMinorVersion} to this direction; starting a new version
            makes it the current version.
          </p>
        )}

        {dish?.evidence && (
          <SessionEvidenceTrigger
            evidence={dish.evidence}
            kindLabel={kindLabel}
          />
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <Field>
            <FieldLabel htmlFor="dish-title">{kindLabel} title</FieldLabel>
            <Input
              id="dish-title"
              placeholder={
                kind === "PART"
                  ? "e.g. Nuoc Cham"
                  : "e.g. Ginger Soy Mirin Bowl"
              }
              aria-invalid={!!formState.errors.title}
              {...register("title", { required: true })}
            />
            <FieldError>
              {formState.errors.title && "Enter a title."}
            </FieldError>
          </Field>

          <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4">
            <h2 className="text-foreground text-sm font-semibold">Details</h2>
            <ImageField dishId={dish?.id ?? null} />
            <div className="grid gap-4 sm:grid-cols-2">
              <CuisineField options={cuisineOptions} />
              <Field>
                <FieldLabel htmlFor="dish-stage">{kindLabel} stage</FieldLabel>
                <Controller
                  control={control}
                  name="stage"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="dish-stage" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stageValues.map((value) => (
                          <SelectItem key={value} value={value}>
                            {STAGE_LABEL[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="dish-description">Description</FieldLabel>
              <Textarea
                id="dish-description"
                placeholder="Optional"
                {...register("description")}
              />
            </Field>

            {dish && (
              <Field>
                <FieldLabel htmlFor="dish-note">Version note</FieldLabel>
                <Textarea
                  id="dish-note"
                  placeholder="What changed, or why — optional"
                  maxLength={500}
                  rows={2}
                  {...register("note")}
                />
              </Field>
            )}

            <div className="flex flex-wrap gap-4">
              {/* Slice 6A: Yield (authored) and Default scale (the saved
                  proportional multiplier, a preference only — never a
                  second authored quantity/unit) live together under one
                  concept. */}
              <Field className="w-full">
                <FieldLabel htmlFor="dish-yield-quantity">Yield</FieldLabel>
                <div className="flex gap-2">
                  <NumberField
                    name="yieldQuantity"
                    id="dish-yield-quantity"
                    placeholder="Amount"
                    step="any"
                    aria-label="Yield amount"
                    className="w-24"
                  />
                  <Input
                    placeholder="Unit, e.g. servings"
                    aria-label="Yield unit"
                    className="w-40"
                    {...register("yieldUnit")}
                  />
                </div>
                {dish && (
                  <div className="border-border mt-2 flex flex-col gap-1.5 border-t pt-3">
                    <FieldLabel htmlFor="dish-default-scale">
                      Default scale
                    </FieldLabel>
                    <FieldDescription>
                      Automatically adjust all {kindLabel} quantities when this{" "}
                      {kindLabel.toLowerCase()} is opened.
                    </FieldDescription>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span aria-hidden="true">×</span>
                        <NumberField
                          name="defaultScale"
                          id="dish-default-scale"
                          placeholder="1"
                          step="any"
                          aria-label="Default scale multiplier"
                          className="w-13"
                          emptyDisplay="1"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          form.setValue("defaultScale", null, {
                            shouldDirty: true,
                          })
                        }
                      >
                        Reset
                      </Button>
                      {defaultScaleResultText && (
                        <span className="text-muted-foreground text-sm">
                          {kindLabel} {defaultScaleResultText}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </Field>
              {/* Slice 6A: "minutes" moves out of the label, next to each
                  input, in a compact row sized for realistic values. */}
              <Field>
                <FieldLabel htmlFor="dish-prep-time">Prep time</FieldLabel>
                <div className="flex items-center gap-2">
                  <NumberField
                    name="prepTimeMinutes"
                    id="dish-prep-time"
                    placeholder="Optional"
                    aria-label="Prep time in minutes"
                    className="w-13"
                  />
                  <span className="text-muted-foreground text-sm">minutes</span>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="dish-cook-time">Cook time</FieldLabel>
                <div className="flex items-center gap-2">
                  <NumberField
                    name="cookTimeMinutes"
                    id="dish-cook-time"
                    placeholder="Optional"
                    aria-label="Cook time in minutes"
                    className="w-13"
                  />
                  <span className="text-muted-foreground text-sm">minutes</span>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="dish-difficulty">Difficulty</FieldLabel>
                <Controller
                  control={control}
                  name="difficulty"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "UNSET"}
                      onValueChange={(value) =>
                        field.onChange(value === "UNSET" ? null : value)
                      }
                    >
                      <SelectTrigger id="dish-difficulty" className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNSET">Not set</SelectItem>
                        {difficultyValues.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
          </div>

          <NutritionFields />

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-medium">Content</h2>
            </div>
            <DndContext
              id="dish-content"
              sensors={sectionSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleTopLevelDragEnd}
              accessibility={{ announcements: topLevelAnnouncements }}
            >
              <SortableContext
                items={topLevelEntries.map((entry) => entry.fieldId)}
                strategy={verticalListSortingStrategy}
              >
                {topLevelEntries.map((entry) =>
                  entry.kind === "section" ? (
                    <SectionFields
                      key={entry.fieldId}
                      id={entry.fieldId}
                      sectionIndex={entry.index}
                      onRemove={() => sections.remove(entry.index)}
                      onConvertToPart={(link) => {
                        topLevelPartLinks.append({
                          ...link,
                          position: entry.position,
                          multiplier: 1,
                        });
                        sections.remove(entry.index);
                      }}
                      containerDishId={dish?.id ?? null}
                      containerKind={kind}
                    />
                  ) : (
                    <PartLinkFields
                      key={entry.fieldId}
                      id={entry.fieldId}
                      prefix={`partLinks.${entry.index}`}
                      containerKind={kind}
                      onRemove={() => topLevelPartLinks.remove(entry.index)}
                      onDetach={(content) =>
                        handleTopLevelDetach(entry.index, content)
                      }
                    />
                  ),
                )}
              </SortableContext>
            </DndContext>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  sections.append({
                    name: null,
                    guidanceNote: null,
                    ingredients: [],
                    instructions: [],
                    partLinks: [],
                    position: nextTopLevelPosition(),
                  })
                }
              >
                <Plus /> Add section
              </Button>
              <PartAttachPicker
                containerDishId={dish?.id ?? null}
                containerKind={kind}
                excludeDishId={dish?.id}
                onAttach={(link) =>
                  topLevelPartLinks.append({
                    ...link,
                    position: nextTopLevelPosition(),
                    multiplier: 1,
                  })
                }
              />
              <CreatePartLink />
            </div>
          </div>

          {serverError && (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive-text flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{serverError}</span>
            </p>
          )}

          <div className="bg-background/95 sticky bottom-0 flex items-center justify-end gap-2 border-t py-4 backdrop-blur-sm">
            <Button variant="outline" asChild>
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>

      <Dialog
        open={guard.isPromptOpen}
        onOpenChange={(open) => !open && guard.keepEditing()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes to this {kindLabel.toLowerCase()}. If you
              leave now, they will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={guard.discardChanges}>
              Discard changes
            </Button>
            <Button onClick={guard.keepEditing}>Keep editing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingCookingChange !== null}
        onOpenChange={(open) => !open && setPendingCookingChange(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How should this change be saved?</DialogTitle>
            <DialogDescription>
              You changed an ingredient or instruction. Save this as a
              refinement of the current version, or start a new version for a
              more substantial change.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => chooseVersion("MAJOR")}
              disabled={isSubmitting}
              className="h-auto flex-col items-start gap-0 py-1.5"
            >
              <span>Start a new version</span>
              {versionChoiceLabels && (
                <span className="text-xs font-normal opacity-75">
                  {versionChoiceLabels.major}
                </span>
              )}
            </Button>
            <Button
              onClick={() => chooseVersion("MINOR")}
              disabled={isSubmitting}
              className="h-auto flex-col items-start gap-0 py-1.5"
            >
              <span>Save as a refinement</span>
              {versionChoiceLabels && (
                <span className="text-xs font-normal opacity-75">
                  {versionChoiceLabels.minor}
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}

/**
 * PRODUCT_SPEC.md §39.4 — quick, read-only access to the Cooking Session
 * that led here, without leaving the editor or touching form state. The
 * Sheet's own open/closed state is independent of `useForm`'s state, so
 * opening or closing it never resets in-progress edits.
 */
function SessionEvidenceTrigger({
  evidence,
  kindLabel,
}: {
  evidence: EditorSessionEvidence;
  kindLabel: string;
}) {
  const endedAtLabel = evidence.endedAt
    ? new Date(evidence.endedAt).toLocaleDateString()
    : null;
  const hasReviewText =
    !!evidence.review?.whatWentWell ||
    !!evidence.review?.whatDidNotGoWell ||
    !!evidence.review?.anythingElse;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
        >
          View session evidence
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Session evidence</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {evidence.outcome === "COMPLETED" ? "Completed" : "Ended early"}
            </Badge>
            <Badge variant="outline" className="tabular-nums">
              {evidence.cookedVersionLabel}
            </Badge>
            {endedAtLabel && (
              <span className="text-muted-foreground">{endedAtLabel}</span>
            )}
          </div>

          {evidence.cookingNotes && (
            <div className="flex flex-col gap-1">
              <p className="text-foreground font-medium">Cooking notes</p>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {evidence.cookingNotes}
              </p>
            </div>
          )}

          {hasReviewText && (
            <div className="flex flex-col gap-3">
              {evidence.review?.whatWentWell && (
                <div className="flex flex-col gap-1">
                  <p className="text-foreground font-medium">What went well</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {evidence.review.whatWentWell}
                  </p>
                </div>
              )}
              {evidence.review?.whatDidNotGoWell && (
                <div className="flex flex-col gap-1">
                  <p className="text-foreground font-medium">
                    What did not go well
                  </p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {evidence.review.whatDidNotGoWell}
                  </p>
                </div>
              )}
              {evidence.review?.anythingElse && (
                <div className="flex flex-col gap-1">
                  <p className="text-foreground font-medium">Anything else</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {evidence.review.anythingElse}
                  </p>
                </div>
              )}
            </div>
          )}

          {evidence.ratings.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-foreground font-medium">Ratings</p>
              <ul className="flex flex-col gap-1">
                {evidence.ratings.map((rating, index) => (
                  <li
                    key={index}
                    className="text-muted-foreground flex items-center justify-between"
                  >
                    <span>{rating.isOwner ? "You" : rating.tasterName}</span>
                    <span className="tabular-nums">{rating.value}/5</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!evidence.cookingNotes &&
            !hasReviewText &&
            evidence.ratings.length === 0 && (
              <p className="text-muted-foreground">
                No notes or ratings were recorded for this{" "}
                {kindLabel.toLowerCase()}&apos;s session.
              </p>
            )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
