"use client";

import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
} from "@/lib/images/schema";

type UploadResponse =
  | { status: "success"; imageAssetId: string }
  | { status: "error"; message: string };

/**
 * PRODUCT_SPEC.md §12: zero-or-one image per Version, never required.
 *
 * Slice 6A: uploads now post the raw file to `/api/images/upload`
 * (`src/app/api/images/upload/route.ts`), which validates, normalizes
 * (orientation, max dimension, WebP conversion/compression —
 * `src/lib/images/processing.ts`), and stores the result server-side —
 * replacing the earlier client-direct-to-Blob signed-token pattern, which
 * never gave the server a chance to touch the bytes.
 *
 * `dishId` is `null` for a brand-new, not-yet-saved Recipe/Part — the
 * upload route still accepts it, scoped by the uploader's own id instead
 * of a Dish id, matching the prior implementation's behavior.
 */
export function ImageField({ dishId }: { dishId: string | null }) {
  const { setValue, watch } = useFormContext();
  const imageAssetId: string | null = watch("imageAssetId");
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // A freshly selected File's `imageAssetId` isn't attached to any saved
  // DishVersion yet — `/api/images/[assetId]` requires that to authorize a
  // read (see its own doc comment), so it 404s until the overall Save
  // completes. A local `URL.createObjectURL(file)` previews the actual
  // chosen bytes immediately instead; an already-persisted asset (loaded
  // from an existing Version, or from a prior Save) still previews through
  // the authorized route, since that read really does succeed.
  const [localPreviewUrl, setLocalPreviewUrl] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);

    if (
      !ALLOWED_IMAGE_CONTENT_TYPES.includes(
        file.type as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number],
      )
    ) {
      setError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is too large (8 MB maximum).");
      return;
    }

    setLocalPreviewUrl(URL.createObjectURL(file));
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (dishId) formData.set("dishId", dishId);

      const response = await fetch("/api/images/upload", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as UploadResponse;

      if (result.status === "error") {
        setError(result.message);
        return;
      }

      setValue("imageAssetId", result.imageAssetId, { shouldDirty: true });
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemove() {
    setValue("imageAssetId", null, { shouldDirty: true });
    setLocalPreviewUrl(null);
  }

  return (
    <Field>
      <FieldLabel>Photo</FieldLabel>
      <div className="flex items-center gap-3">
        {imageAssetId ? (
          <div className="border-border relative size-24 overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated route (or a local blob: object URL), not a static/optimizable asset */}
            <img
              src={localPreviewUrl ?? `/api/images/${imageAssetId}`}
              alt=""
              className="size-full object-cover"
            />
            <TooltipIconButton
              label="Remove photo"
              icon={X}
              onClick={handleRemove}
              className="bg-card/90 hover:bg-card absolute top-1 right-1"
            />
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-4" aria-hidden="true" />
            )}
            {isUploading ? "Uploading…" : "Add a photo"}
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_CONTENT_TYPES.join(",")}
        className="sr-only"
        onChange={handleFileChange}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </Field>
  );
}
