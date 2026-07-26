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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useUnsavedChangesGuard } from "@/components/domain/dish/use-unsaved-changes-guard";
import {
  blankDishFormValues,
  type DishFormValues,
} from "@/components/domain/dish/dish-form-values";
import { createDish, editDish } from "@/lib/dishes/actions";
import {
  removeEmptySections,
  hasMinimumContent,
  diffVersionContent,
  stageValues,
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
}: {
  kind: DishKindValue;
  dish?: {
    id: string;
    currentVersionId: string;
    currentMajorVersion: number;
    currentMinorVersion: number;
    values: DishFormValues;
  };
}) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [pendingCookingChange, setPendingCookingChange] =
    React.useState<DishFormValues | null>(null);

  const form = useForm<DishFormValues>({
    defaultValues: dish ? dish.values : blankDishFormValues(),
  });
  const { control, register, handleSubmit, formState } = form;
  const sections = useFieldArray({ control, name: "sections" });

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
          dish.currentVersionId,
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
        ingredients: section.ingredients.filter(
          (ingredient) => ingredient.name.trim().length > 0,
        ),
        instructions: section.instructions.filter(
          (instruction) => instruction.text.trim().length > 0,
        ),
      })),
    };

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

  // Slice 3 has no UI path to reach a historical major (see the module doc
  // comment in service.ts), so the currently-loaded Version is always the
  // highest minor within its major line — the next minor is always exactly
  // one past it.
  const versionChoiceLabels = dish
    ? {
        major: `Starts V${dish.currentMajorVersion + 1}.0`,
        minor: `Saves as V${dish.currentMajorVersion}.${dish.currentMinorVersion + 1}`,
      }
    : null;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mx-auto flex max-w-3xl flex-col gap-6 pb-24"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="dish-title">{kindLabel} title</Label>
          <Input
            id="dish-title"
            placeholder={
              kind === "PART" ? "e.g. Nuoc Cham" : "e.g. Ginger Soy Mirin Bowl"
            }
            aria-invalid={!!formState.errors.title}
            {...register("title", { required: true })}
          />
          {formState.errors.title && (
            <p className="text-destructive text-sm">Enter a title.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dish-stage">Status</Label>
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
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dish-cuisine">Cuisine</Label>
            <Input
              id="dish-cuisine"
              placeholder="Optional"
              {...register("cuisine")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dish-description">Description</Label>
          <Textarea
            id="dish-description"
            placeholder="Optional"
            {...register("description")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dish-yield-quantity">Makes</Label>
            <div className="flex gap-2">
              <NumberField
                name="yieldQuantity"
                id="dish-yield-quantity"
                placeholder="Qty"
                step="any"
              />
              <Input placeholder="servings" {...register("yieldUnit")} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dish-prep-time">Prep time (min)</Label>
            <NumberField
              name="prepTimeMinutes"
              id="dish-prep-time"
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dish-cook-time">Cook time (min)</Label>
            <NumberField
              name="cookTimeMinutes"
              id="dish-cook-time"
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dish-difficulty">Difficulty</Label>
            <Input
              id="dish-difficulty"
              placeholder="Optional"
              {...register("difficulty")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-lg font-medium">Sections</h3>
          </div>
          {sections.fields.map((field, sectionIndex) => (
            <SectionFields
              key={field.id}
              sectionIndex={sectionIndex}
              isFirst={sectionIndex === 0}
              isLast={sectionIndex === sections.fields.length - 1}
              onMoveUp={() => sections.move(sectionIndex, sectionIndex - 1)}
              onMoveDown={() => sections.move(sectionIndex, sectionIndex + 1)}
              onRemove={() => sections.remove(sectionIndex)}
            />
          ))}
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
