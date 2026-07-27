"use client";

import * as React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "@/components/domain/dish/image-field";
import { updateVersionMetadata } from "@/lib/dishes/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

type MetadataFormValues = {
  description: string | null;
  imageAssetId: string | null;
};

/**
 * PRODUCT_SPEC.md §7.2 (Version-trigger correction pass): description and
 * image are Version-associated but mutable — this edits either field in
 * place on whichever Version it's rendered for (current or historical),
 * without branching or creating a refinement. Reuses `ImageField` (the
 * same upload widget the full editor uses) inside its own small
 * `react-hook-form` instance, rather than requiring the full Dish editor
 * for a metadata-only change.
 *
 * Callers must render this with `key={versionId}` — same reason as
 * `VersionNoteEditor`: navigating to a different Version's page must reset
 * this component's local draft state via remount, not a same-render
 * `setState` cascade from a props-sync effect.
 */
export function VersionMetadataEditor({
  kind,
  dishId,
  versionId,
  description,
  imageAssetId,
}: {
  kind: DishKindValue;
  dishId: string;
  versionId: string;
  description: string | null;
  imageAssetId: string | null;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<MetadataFormValues>({
    defaultValues: { description, imageAssetId },
  });

  function handleCancel() {
    form.reset({ description, imageAssetId });
    setError(null);
    setIsEditing(false);
  }

  function handleSave(values: MetadataFormValues) {
    setError(null);
    startTransition(async () => {
      const result = await updateVersionMetadata(kind, {
        dishId,
        versionId,
        description: values.description?.trim() || null,
        imageAssetId: values.imageAssetId,
      });
      if (result.status === "success") {
        setIsEditing(false);
      } else {
        setError(result.message ?? "Could not save.");
      }
    });
  }

  if (!isEditing) {
    return (
      <div className="flex flex-col gap-3">
        {/* PRODUCT_SPEC.md §12.3: no placeholder when there's no image —
            the layout must remain coherent without one. */}
        {imageAssetId && (
          // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
          <img
            src={`/api/images/${imageAssetId}`}
            alt=""
            className="border-border max-h-80 w-full rounded-lg border object-cover"
          />
        )}
        {description && <p>{description}</p>}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0"
          onClick={() => setIsEditing(true)}
        >
          {description || imageAssetId
            ? "Edit photo & description"
            : "Add a photo or description"}
        </Button>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(handleSave)}
        className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
      >
        <ImageField dishId={dishId} />
        <Textarea
          {...form.register("description")}
          placeholder="Optional description"
          aria-label="Description"
        />
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
