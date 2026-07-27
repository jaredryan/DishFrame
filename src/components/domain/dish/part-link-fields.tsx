"use client";

import * as React from "react";
import Link from "next/link";
import { Link2, ExternalLink, Unlink, X } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  getPartLinkDisplay,
  resolvePartVersionForDetach,
} from "@/lib/sections/actions";
import type { DetachedContent } from "@/lib/sections/service";

// Untyped useFormContext — see ingredient-fields.tsx's doc comment.
export function PartLinkFields({
  prefix,
  onRemove,
  onDetach,
}: {
  prefix: string;
  onRemove: () => void;
  onDetach: (content: DetachedContent) => void;
}) {
  const { control } = useFormContext();
  const targetDishId = useWatch({ control, name: `${prefix}.targetDishId` });
  const targetDishVersionId = useWatch({
    control,
    name: `${prefix}.targetDishVersionId`,
  });

  // Keyed by target identity so a stale response for a since-changed target
  // is recognized as stale (`key !== requestKey`) without needing an eager
  // synchronous reset at the top of the effect (which `react-hooks/set-
  // state-in-effect` flags as a cascading-render risk).
  const [resolved, setResolved] = React.useState<{
    key: string;
    title: string | null;
    majorVersion: number;
    minorVersion: number;
    error: string | null;
  } | null>(null);
  const [isDetaching, setIsDetaching] = React.useState(false);
  const [detachError, setDetachError] = React.useState<string | null>(null);

  const requestKey =
    targetDishId && targetDishVersionId
      ? `${targetDishId}:${targetDishVersionId}`
      : null;

  React.useEffect(() => {
    if (!targetDishId || !targetDishVersionId) return;
    let cancelled = false;
    const key = `${targetDishId}:${targetDishVersionId}`;
    getPartLinkDisplay({ targetDishId, targetDishVersionId }).then((result) => {
      if (cancelled) return;
      if (result.status === "success") {
        setResolved({
          key,
          title: result.title,
          majorVersion: result.majorVersion,
          minorVersion: result.minorVersion,
          error: null,
        });
      } else {
        setResolved({
          key,
          title: null,
          majorVersion: 0,
          minorVersion: 0,
          error: result.message,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [targetDishId, targetDishVersionId]);

  const isCurrent = resolved !== null && resolved.key === requestKey;
  const display = isCurrent && !resolved.error ? resolved : null;
  const error = detachError ?? (isCurrent ? resolved.error : null);

  async function handleDetach() {
    setIsDetaching(true);
    setDetachError(null);
    const result = await resolvePartVersionForDetach({
      targetDishVersionId,
    });
    setIsDetaching(false);
    if (result.status === "success") {
      onDetach(result.content);
    } else {
      setDetachError(result.message);
    }
  }

  const versionLabel = display
    ? `V${display.majorVersion}.${display.minorVersion}`
    : null;

  return (
    <div className="border-border bg-muted/30 flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
      <div className="flex min-w-0 items-center gap-2">
        <Link2 className="text-primary size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {error ? "Linked Part unavailable" : (display?.title ?? "Loading…")}
          </p>
          <p className="text-muted-foreground text-xs">
            Saved part{versionLabel ? ` · ${versionLabel}` : ""}
          </p>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {targetDishId && (
          <Button variant="ghost" size="icon-sm" asChild title="Open Part">
            <Link href={`/parts/${targetDishId}`} target="_blank">
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="sr-only">Open Part</span>
            </Link>
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleDetach}
          disabled={isDetaching}
          title="Detach into local content"
        >
          <Unlink className="size-4" aria-hidden="true" />
          <span className="sr-only">Detach</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          title="Remove"
        >
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Remove</span>
        </Button>
      </div>
    </div>
  );
}
