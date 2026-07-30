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
import { NumberField } from "@/components/domain/dish/number-field";
import { SectionFields } from "@/components/domain/dish/section-fields";
import { CuisineField } from "@/components/domain/dish/cuisine-field";
import { ImageField } from "@/components/domain/dish/image-field";
import { PartLinkFields } from "@/components/domain/dish/part-link-fields";
import {
  PartAttachPicker,
  type AttachablePartOption,
} from "@/components/domain/dish/part-attach-picker";
import { CreatePartDialog } from "@/components/domain/dish/create-part-dialog";
import type { DetachedContent } from "@/lib/sections/service";
import { useUnsavedChangesGuard } from "@/components/domain/dish/use-unsaved-changes-guard";
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
  setDefaultBatchScale,
} from "@/lib/dishes/actions";
import {
  removeEmptySections,
  hasMinimumContent,
  diffVersionContent,
  isBlankSubstitute,
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

// Design remediation pass: edited alongside every other field in this one
// form, but not part of `dishContentSchema`/`DishFormValues` — each keeps
// its own existing non-material persistence path (`updateVersionNote`/
// `setDefaultBatchScale`), called directly after a successful Save rather
// than folded into createDish/editDish's cooking-change classification.
// Only shown (and only meaningful) once a Dish/Version already exists.
type EditorExtras = {
  note: string;
  defaultBatchQuantity: number | null;
  defaultBatchUnit: string | null;
};
type EditorFormValues = DishFormValues & EditorExtras;

export function DishEditor({
  kind,
  dish,
  cuisineOptions = [],
  attachableParts = [],
}: {
  kind: DishKindValue;
  dish?: {
    id: string;
    // The Version this edit is based on — any saved Version belonging to
    // the Dish (Slice 4 correction pass §1: not restricted to the current
    // Version or to a major line's latest minor), reached from that
    // Version's own detail page (PRODUCT_SPEC.md §13.4/§13.7).
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
    values: DishFormValues;
    // Design remediation pass: the consolidated editor is now the one place
    // to edit these, alongside title/description/image/etc — previously
    // each had its own standalone detail-page control
    // (VersionNoteEditor/ScaledVersionView's "Save as default"). Both keep
    // their existing non-material persistence (`updateVersionNote`/
    // `setDefaultBatchScale`, called directly, never through
    // createDish/editDish's own cooking-change classification) — only
    // *where* they're edited changed, not how they're saved.
    note: string | null;
    defaultBatchQuantity: number | null;
    defaultBatchUnit: string | null;
  };
  cuisineOptions?: string[];
  // Slice 6, PRODUCT_SPEC.md §68: candidate Parts this owner may attach —
  // fetched server-side (the same pattern as `cuisineOptions`), excluding
  // this Dish itself when editing an existing Part.
  attachableParts?: AttachablePartOption[];
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
          defaultBatchQuantity: dish.defaultBatchQuantity,
          defaultBatchUnit: dish.defaultBatchUnit,
        }
      : {
          ...blankDishFormValues(),
          note: "",
          defaultBatchQuantity: null,
          defaultBatchUnit: null,
        },
  });
  const { control, register, handleSubmit, formState, setError, getValues } =
    form;
  const sections = useFieldArray({ control, name: "sections" });
  const topLevelPartLinks = useFieldArray({ control, name: "partLinks" });
  const sectionSensors = useReorderSensors();

  // Build Plan Review Gate 3's "unified authored order": top-level Sections
  // and top-level linked Parts share one authored sequence. Both are still
  // two separate `useFieldArray`s (the schema/type change stayed minimal —
  // see docs/SLICE_6.md) — this merges them for *rendering and reordering
  // only*, sorted by each item's own live `position` value (not array
  // index, which no longer reflects true order once the two arrays
  // interleave).
  const watchedSections = useWatch({ control, name: "sections" });
  const watchedTopLevelPartLinks = useWatch({ control, name: "partLinks" });

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

    if (
      extras.defaultBatchQuantity !== dish.defaultBatchQuantity ||
      extras.defaultBatchUnit !== dish.defaultBatchUnit
    ) {
      tasks.push(
        setDefaultBatchScale(kind, {
          dishId: dish.id,
          defaultBatchQuantity: extras.defaultBatchQuantity,
          defaultBatchUnit: extras.defaultBatchUnit,
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
      : await createDish(kind, cleaned);

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
    const { note, defaultBatchQuantity, defaultBatchUnit, ...contentValues } =
      values;
    const extras: EditorExtras = {
      note,
      defaultBatchQuantity,
      defaultBatchUnit,
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

  const editorHeading = `${dish ? "Edit" : "New"} ${kindLabel.toLowerCase()}`;
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
        {editingNonCurrentVersion && dish && (
          <p className="border-border bg-card text-muted-foreground rounded-lg border px-3 py-2 text-sm">
            You&apos;re editing V{dish.baseMajorVersion}.{dish.baseMinorVersion}
            , not the current version. Saving as a refinement adds V
            {dish.baseMajorVersion}.{dish.nextMinorVersion} to this direction;
            starting a new version makes it the current version.
          </p>
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
              <Field>
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
              </Field>
              {dish && (
                <Field>
                  <FieldLabel htmlFor="dish-default-serving-quantity">
                    Default serving size
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <NumberField
                      name="defaultBatchQuantity"
                      id="dish-default-serving-quantity"
                      placeholder="Amount"
                      step="any"
                      aria-label="Default serving amount"
                      className="w-24"
                    />
                    <Input
                      placeholder="Unit"
                      aria-label="Default serving unit"
                      className="w-32"
                      {...register("defaultBatchUnit")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        form.setValue("defaultBatchQuantity", null, {
                          shouldDirty: true,
                        });
                        form.setValue("defaultBatchUnit", null, {
                          shouldDirty: true,
                        });
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                  <FieldDescription>
                    Shown on the recipe page as the default yield. Leave blank
                    to use the authored yield above.
                  </FieldDescription>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="dish-prep-time">
                  Prep time (minutes)
                </FieldLabel>
                <NumberField
                  name="prepTimeMinutes"
                  id="dish-prep-time"
                  placeholder="Optional"
                  className="w-24"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dish-cook-time">
                  Cook time (minutes)
                </FieldLabel>
                <NumberField
                  name="cookTimeMinutes"
                  id="dish-cook-time"
                  placeholder="Optional"
                  className="w-24"
                />
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
                      attachableParts={attachableParts}
                    />
                  ) : (
                    <PartLinkFields
                      key={entry.fieldId}
                      id={entry.fieldId}
                      prefix={`partLinks.${entry.index}`}
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
                attachableParts={attachableParts}
                onAttach={(link) =>
                  topLevelPartLinks.append({
                    ...link,
                    position: nextTopLevelPosition(),
                    multiplier: 1,
                  })
                }
              />
              <CreatePartDialog
                onCreated={(link) =>
                  topLevelPartLinks.append({
                    ...link,
                    position: nextTopLevelPosition(),
                    multiplier: 1,
                  })
                }
              />
            </div>
          </div>

          {serverError && (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
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
