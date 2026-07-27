"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { AlertCircle, Plus } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
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
import { useUnsavedChangesGuard } from "@/components/domain/dish/use-unsaved-changes-guard";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import {
  blankDishFormValues,
  type DishFormValues,
} from "@/components/domain/dish/dish-form-values";
import { createDish, editDish } from "@/lib/dishes/actions";
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

export function DishEditor({
  kind,
  dish,
  cuisineOptions = [],
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
  };
  cuisineOptions?: string[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [pendingCookingChange, setPendingCookingChange] =
    React.useState<DishFormValues | null>(null);

  const form = useForm<DishFormValues>({
    defaultValues: dish ? dish.values : blankDishFormValues(),
  });
  const { control, register, handleSubmit, formState, setError, getValues } =
    form;
  const sections = useFieldArray({ control, name: "sections" });
  const sectionSensors = useReorderSensors();

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.fields.findIndex((f) => f.id === active.id);
    const newIndex = sections.fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    sections.move(oldIndex, newIndex);
  }

  const sectionAnnouncements = createReorderAnnouncements(
    (id) => {
      const index = sections.fields.findIndex((f) => f.id === id);
      const name =
        index >= 0
          ? (getValues(`sections.${index}.name` as never) as unknown as
              string | null)
          : null;
      return name || `section ${index + 1}`;
    },
    (id) => ({
      index: sections.fields.findIndex((f) => f.id === id),
      total: sections.fields.length,
    }),
  );

  const guard = useUnsavedChangesGuard(formState.isDirty && !isSubmitting);

  const basePath = kind === "PART" ? "/parts" : "/recipes";
  const kindLabel = kind === "PART" ? "Part" : "Recipe";
  const cancelHref = dish ? `${basePath}/${dish.id}` : basePath;

  async function performSave(
    cleaned: DishFormValues,
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
      form.reset(cleaned);
      router.push(`${basePath}/${result.dishId}`);
      router.refresh();
    } else {
      setServerError(result.message ?? "Could not save. Please try again.");
      setIsSubmitting(false);
    }
  }

  async function onSubmit(values: DishFormValues) {
    setServerError(null);

    const cleaned: DishFormValues = {
      ...values,
      sections: values.sections.map((section) => ({
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

    if (!hasMinimumContent(removeEmptySections(cleaned.sections))) {
      setServerError(
        "Add at least one ingredient or instruction before saving.",
      );
      return;
    }

    // Only an existing Dish's edit can require the minor/major choice — a
    // new Dish always starts at V1.0, nothing to diff against.
    if (dish) {
      const { cookingChanged } = diffVersionContent(
        dish.values.sections,
        cleaned.sections,
      );
      if (cookingChanged) {
        setPendingCookingChange(cleaned);
        return;
      }
    }

    await performSave(cleaned);
  }

  function chooseVersion(versionChoice: VersionChoiceValue) {
    if (!pendingCookingChange) return;
    const cleaned = pendingCookingChange;
    setPendingCookingChange(null);
    void performSave(cleaned, versionChoice);
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="dish-stage">Status</FieldLabel>
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
              <CuisineField options={cuisineOptions} />
            </div>

            <Field>
              <FieldLabel htmlFor="dish-description">Description</FieldLabel>
              <Textarea
                id="dish-description"
                placeholder="Optional"
                {...register("description")}
              />
            </Field>

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
              <h2 className="font-heading text-lg font-medium">Sections</h2>
            </div>
            <DndContext
              id="dish-sections"
              sensors={sectionSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSectionDragEnd}
              accessibility={{ announcements: sectionAnnouncements }}
            >
              <SortableContext
                items={sections.fields.map((field) => field.id)}
                strategy={verticalListSortingStrategy}
              >
                {sections.fields.map((field, sectionIndex) => (
                  <SectionFields
                    key={field.id}
                    id={field.id}
                    sectionIndex={sectionIndex}
                    onRemove={() => sections.remove(sectionIndex)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() =>
                sections.append({
                  name: null,
                  guidanceNote: null,
                  ingredients: [],
                  instructions: [],
                })
              }
            >
              <Plus /> Add section
            </Button>
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
