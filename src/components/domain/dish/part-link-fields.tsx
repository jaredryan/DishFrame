"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Link2, Unlink, X } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DragHandle } from "@/components/ui/drag-handle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PartLinkTreeContent } from "@/components/domain/dish/part-link-tree-view";
import {
  getPartLinkDisplay,
  getPartLinkPreview,
  resolvePartVersionForDetach,
} from "@/lib/sections/actions";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DetachedContent } from "@/lib/sections/service";
import type { PartLinkTree } from "@/lib/sections/service";

/**
 * Settled Review Gate 3 decision, PRODUCT_SPEC.md §67.4/§68.6, corrected
 * Slice 6 correction pass §4, refined further in the design remediation
 * pass: a PartLink is a data relationship, not a link-only or collapsed
 * placeholder — it reads like a Section after a small relationship-specific
 * header (title in the same style as a Section heading, Part/Version/
 * multiplier chips, and actions), with its description and pinned
 * Ingredients/Instructions shown directly beneath — no redundant nested
 * card repeating the header. Scaling is the one editable property of the
 * link itself, via the compact inline row below, not an unlabeled settings
 * toggle.
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
  const { control, getValues, setValue } = useFormContext();
  const targetDishId = useWatch({ control, name: `${prefix}.targetDishId` });
  const targetDishVersionId = useWatch({
    control,
    name: `${prefix}.targetDishVersionId`,
  });
  const committedMultiplier: number =
    useWatch({ control, name: `${prefix}.multiplier` }) ?? 1;

  // Keyed by target identity so a stale response for a since-changed target
  // is recognized as stale (`key !== requestKey`) without needing an eager
  // synchronous reset at the top of the effect (which `react-hooks/set-
  // state-in-effect` flags as a cascading-render risk).
  const [resolved, setResolved] = React.useState<{
    key: string;
    title: string | null;
    majorVersion: number;
    minorVersion: number;
    description: string | null;
    error: string | null;
  } | null>(null);
  const [preview, setPreview] = React.useState<{
    key: string;
    tree: PartLinkTree | null;
    error: string | null;
  } | null>(null);
  const [isDetaching, setIsDetaching] = React.useState(false);
  const [detachError, setDetachError] = React.useState<string | null>(null);

  // The value this editing session opened with — captured once, at mount,
  // never resynced from the live (possibly since-Applied) form value.
  // "Reset" restores this exact value, not the Part's own authored default.
  const openingMultiplierRef = React.useRef<number>(
    getValues(`${prefix}.multiplier`) ?? 1,
  );
  const [scalingDraft, setScalingDraft] = React.useState(
    String(committedMultiplier),
  );
  const parsedDraft = Number(scalingDraft);
  const isDraftValid =
    scalingDraft.trim() !== "" &&
    Number.isFinite(parsedDraft) &&
    parsedDraft > 0;

  function applyScaling() {
    if (!isDraftValid) return;
    setValue(`${prefix}.multiplier`, parsedDraft, { shouldDirty: true });
  }

  function resetScaling() {
    const opening = openingMultiplierRef.current;
    setScalingDraft(String(opening));
    setValue(`${prefix}.multiplier`, opening, { shouldDirty: true });
  }

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
          description: result.description,
          error: null,
        });
      } else {
        setResolved({
          key,
          title: null,
          majorVersion: 0,
          minorVersion: 0,
          description: null,
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
  // behind an expand action. Re-fetches when the *committed* multiplier
  // changes (i.e. after Apply) — not on every Scaling-draft keystroke.
  React.useEffect(() => {
    if (!requestKey || !targetDishId || !targetDishVersionId) {
      return;
    }
    if (preview?.key === requestKey) return;
    let cancelled = false;
    getPartLinkPreview({
      targetDishId,
      targetDishVersionId,
      multiplier: committedMultiplier,
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
  }, [
    requestKey,
    targetDishId,
    targetDishVersionId,
    committedMultiplier,
    preview,
  ]);

  const isCurrent = resolved !== null && resolved.key === requestKey;
  const display = isCurrent && !resolved.error ? resolved : null;
  const error = detachError ?? (isCurrent ? resolved.error : null);

  async function handleDetach() {
    setIsDetaching(true);
    setDetachError(null);
    const result = await resolvePartVersionForDetach({
      targetDishVersionId,
      multiplier: committedMultiplier,
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
      className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex items-center gap-2">
        <DragHandle
          label={`Drag to reorder ${title}`}
          attributes={attributes}
          listeners={listeners}
          isDragging={isDragging}
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <h3 className="font-heading text-foreground truncate text-base font-medium">
            {title}
          </h3>
          <Badge variant="outline">
            <Link2 className="size-3" aria-hidden="true" /> Part
          </Badge>
          {versionLabel && (
            <Badge variant="outline" className="tabular-nums">
              {versionLabel}
            </Badge>
          )}
          {committedMultiplier !== 1 && (
            <Badge variant="outline">× {committedMultiplier}</Badge>
          )}
        </div>
        <TooltipProvider>
          <div className="flex shrink-0 items-center gap-0.5">
            {targetDishId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <Link
                      href={`${dishBasePath("PART")}/${targetDishId}`}
                      target="_blank"
                      aria-label="Open Part"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open Part</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleDetach}
                  disabled={isDetaching}
                  aria-label="Detach into local content"
                >
                  <Unlink className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Detach into local content</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onRemove}
                  aria-label="Remove"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {display?.description && (
        <p className="text-muted-foreground text-sm">{display.description}</p>
      )}

      <div className="border-border bg-muted/30 flex flex-wrap items-center gap-2 rounded-lg border p-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Scaling
        </span>
        <Input
          inputMode="decimal"
          className="h-8 w-20"
          aria-label="Scaling multiplier"
          value={scalingDraft}
          onChange={(event) => setScalingDraft(event.target.value)}
        />
        <Button type="button" variant="ghost" size="sm" onClick={resetScaling}>
          Reset
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={applyScaling}
          disabled={!isDraftValid}
        >
          Apply
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {preview?.key === requestKey && preview.tree && (
          <PartLinkTreeContent
            tree={preview.tree}
            effectiveScale={committedMultiplier}
            depth={0}
          />
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
