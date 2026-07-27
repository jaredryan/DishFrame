"use server";

import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as imageService from "@/lib/images/service";
import { requestImageUploadSchema } from "@/lib/images/schema";

export type RequestImageUploadState =
  | {
      status: "success";
      imageAssetId: string;
      storageKey: string;
      clientToken: string;
    }
  | { status: "error"; message: string };

/**
 * Issues a short-lived, ownership-validated Blob client token
 * (`src/lib/images/service.ts`). The client uses the returned
 * `clientToken`/`storageKey` to call `@vercel/blob/client`'s `put()`
 * directly — this Server Action never receives the image bytes
 * themselves (ARCHITECTURE_PROPOSAL.md §M).
 */
export async function requestImageUpload(values: {
  dishId?: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<RequestImageUploadState> {
  try {
    const userId = await requireUserId();
    const input = requestImageUploadSchema.parse(values);

    const result = await imageService.requestImageUploadUrl(
      userId,
      input.dishId ?? null,
      input.fileName,
      input.contentType,
      input.sizeBytes,
    );

    return { status: "success", ...result };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
