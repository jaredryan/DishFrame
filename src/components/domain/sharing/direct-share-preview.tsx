"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { getDirectSharePreview } from "@/lib/sharing/actions";
import { PublicShareView } from "@/components/domain/sharing/public-share-view";
import type { DirectSharePreview as DirectSharePreviewData } from "@/lib/sharing/service";

/**
 * Gate 7 §2.2's public whitelist DTO, reused here for a signed-in
 * recipient's (or sender's) preview of a direct share — same
 * `PublicShareView` renderer a public `ShareLink` page uses, images
 * authorized via `?directShareId=` (docs/SLICE_17.md) instead of a share
 * token. Fetched on demand rather than preloaded with the list, since most
 * shares in a list are never expanded.
 *
 * Split into a hook + panel so a caller that needs the trigger button
 * alongside other actions on the same row (the redesigned Sharing page's
 * Preview/Decline/Accept row) can lay them out itself, while `<DirectSharePreview>`
 * below stays the simple, self-contained default for callers that just want
 * a Preview button in place (e.g. the collection review dialog).
 */
export function useDirectSharePreview(directShareId: string) {
  const [expanded, setExpanded] = React.useState(false);
  const [data, setData] = React.useState<DirectSharePreviewData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (data || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await getDirectSharePreview({ directShareId });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setData(result.preview);
    });
  }

  return { expanded, data, error, isPending, toggle };
}

export function DirectSharePreviewPanel({
  directShareId,
  data,
  error,
  isPending,
}: {
  directShareId: string;
  data: DirectSharePreviewData | null;
  error: string | null;
  isPending: boolean;
}) {
  return (
    <div className="border-border rounded-md border">
      {isPending && !data && (
        <p className="text-muted-foreground p-4 text-sm">Loading preview…</p>
      )}
      {error && <p className="text-destructive-text p-4 text-sm">{error}</p>}
      {data && (
        <PublicShareView
          content={data.content}
          mode="FIXED_SNAPSHOT"
          creatorName={data.senderName}
          imageSrc={(assetId) =>
            `/api/images/${assetId}?directShareId=${encodeURIComponent(directShareId)}`
          }
        />
      )}
    </div>
  );
}

export function DirectSharePreview({
  directShareId,
}: {
  directShareId: string;
}) {
  const { expanded, data, error, isPending, toggle } =
    useDirectSharePreview(directShareId);

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={toggle}>
        {expanded ? "Hide preview" : "Preview"}
      </Button>
      {expanded && (
        <DirectSharePreviewPanel
          directShareId={directShareId}
          data={data}
          error={error}
          isPending={isPending}
        />
      )}
    </div>
  );
}
