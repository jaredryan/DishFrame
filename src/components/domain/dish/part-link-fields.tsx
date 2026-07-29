"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Link2, Settings, Unlink, X } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { DragHandle } from "@/components/ui/drag-handle";
import { NumberField } from "@/components/domain/dish/number-field";
import { PartLinkTreeView } from "@/components/domain/dish/part-link-tree-view";
import {
  getPartLinkDisplay,
  getPartLinkPreview,
  resolvePartVersionForDetach,
} from "@/lib/sections/actions";
import type { DetachedContent } from "@/lib/sections/service";
import type { PartLinkTree } from "@/lib/sections/service";

/**
 * Settled Review Gate 3 decision, PRODUCT_SPEC.md §67.4/§68.6, corrected
 * Slice 6 correction pass §4: a PartLink is a data relationship, not a
 * link-only or collapsed placeholder — its pinned content (fetched
 * read-only from `getPartLinkPreview`) is visible inline by default, no
 * expand action required. From the parent editor, users may change the
 * multiplier (behind the "Link settings" action, since it's the one
 * editable property of the link itself), detach, remove, or open the
 * standalone Part — but the reusable Part's own Ingredients/Instructions
 * never become parent-owned inline inputs here.
 */
export function PartLinkFields({
  id,
  prefix,
  onRemove,
  onDetach,
}: {
  id: string;
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
  const multiplier = useWatch({ control, name: `${prefix}.multiplier` }) ?? 1;

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
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<{
    key: string;
    tree: PartLinkTree | null;
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

  // Slice 6 correction pass §4: fetched unconditionally, as soon as the
  // target is known — the pinned content is visible by default, not gated
  // behind an expand action.
  React.useEffect(() => {
    if (!requestKey || !targetDishId || !targetDishVersionId) {
      return;
    }
    if (preview?.key === requestKey) return;
    let cancelled = false;
    getPartLinkPreview({
      targetDishId,
      targetDishVersionId,
      multiplier: Number(multiplier) || 1,
    }).then((result) => {
      if (cancelled) return;
      if (result.status === "success") {
        setPreview({ key: requestKey, tree: result.tree, error: null });
      } else {
        setPreview({ key: requestKey, tree: null, error: result.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, targetDishId, targetDishVersionId, multiplier, preview]);

  const isCurrent = resolved !== null && resolved.key === requestKey;
  const display = isCurrent && !resolved.error ? resolved : null;
  const error = detachError ?? (isCurrent ? resolved.error : null);

  async function handleDetach() {
    setIsDetaching(true);
    setDetachError(null);
    const result = await resolvePartVersionForDetach({
      targetDishVersionId,
      multiplier: Number(multiplier) || 1,
    });
    setIsDetaching(false);
    if (result.status === "success") {
      onDetach(result.content);
    } else {
      setDetachError(result.message);
    }
  }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const versionLabel = display
    ? `V${display.majorVersion}.${display.minorVersion}`
    : null;
  const title = error
    ? "Linked Part unavailable"
    : (display?.title ?? "Loading…");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border border-dashed p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <DragHandle
            label={`Drag to reorder ${title}`}
            attributes={attributes}
            listeners={listeners}
            isDragging={isDragging}
          />
          <Link2 className="text-primary size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="text-muted-foreground text-xs">
              Linked part{versionLabel ? ` · ${versionLabel}` : ""}
              {Number(multiplier) !== 1 ? ` · × ${multiplier}` : ""}
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
            onClick={() => setSettingsOpen((prev) => !prev)}
            title="Link settings"
          >
            <Settings className="size-4" aria-hidden="true" />
            <span className="sr-only">Link settings</span>
          </Button>
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

      {settingsOpen && (
        <div className="pl-8">
          <Field className="w-32">
            <FieldLabel htmlFor={`${prefix.replace(/\./g, "-")}-multiplier`}>
              Multiplier
            </FieldLabel>
            <NumberField
              name={`${prefix}.multiplier`}
              id={`${prefix.replace(/\./g, "-")}-multiplier`}
              step="any"
              placeholder="1"
            />
          </Field>
        </div>
      )}

      {/* Slice 6 correction pass §4: the pinned content is visible inline by
          default — no expand action required. */}
      <div className="flex flex-col gap-3 pl-8">
        {preview?.key === requestKey && preview.tree && (
          <PartLinkTreeView tree={preview.tree} />
        )}
        {preview?.key === requestKey && !preview.tree && preview.error && (
          <p className="text-destructive text-sm">{preview.error}</p>
        )}
        {preview?.key === requestKey && !preview.tree && !preview.error && (
          <p className="text-muted-foreground text-sm">
            This Part has no saved content yet.
          </p>
        )}
        {(!preview || preview.key !== requestKey) && (
          <p className="text-muted-foreground text-sm">Loading content…</p>
        )}
      </div>
    </div>
  );
}
