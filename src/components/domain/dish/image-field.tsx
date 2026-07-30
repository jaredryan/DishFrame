"use client";

import * as React from "react";
import { put } from "@vercel/blob/client";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { requestImageUpload } from "@/lib/images/actions";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
} from "@/lib/images/schema";

/**
 * PRODUCT_SPEC.md §12: zero-or-one image per Version, never required. The
 * signed-URL client-upload pattern (ARCHITECTURE_PROPOSAL.md §M) —
 * `requestImageUpload` (a Server Action) validates ownership/MIME/size and
 * returns a short-lived Blob client token; the actual bytes go straight
 * from this browser to Blob storage via `@vercel/blob/client`'s `upload()`,
 * never through a Server Action request body.
 *
 * `dishId` is `null` for a brand-new, not-yet-saved Recipe/Part — see
 * `requestImageUploadUrl`'s own doc comment for why that's a supported
 * case, not an oversight.
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
      const requested = await requestImageUpload({
        dishId,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (requested.status === "error") {
        setError(requested.message);
        return;
      }

      // `put()`, not `upload()`: a client token was already issued by the
      // `requestImageUpload` Server Action above, so there's no need for
      // `@vercel/blob/client`'s own `handleUploadUrl` token-fetch round
      // trip — `access` must still be passed (the SDK's own required
      // field), and matches the store's actual configuration (the
      // `dishframe-images` store is provisioned private-only).
      await put(requested.storageKey, file, {
        access: "private",
        token: requested.clientToken,
      });

      setValue("imageAssetId", requested.imageAssetId, { shouldDirty: true });
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
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute top-1 right-1"
              onClick={handleRemove}
              aria-label="Remove photo"
              title="Remove photo"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
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
