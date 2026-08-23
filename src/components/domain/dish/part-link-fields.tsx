import * as React from "react";
import Link from "next/link";
import { Copy, Eye, Pencil } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import { Input } from "@/components/ui/input";
import { DragHandle } from "@/components/ui/drag-handle";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ItemToolbar,
  TooltipIconButton,
} from "@/components/domain/dish/reorder-buttons";
import { PartLinkTreeContent } from "@/components/domain/dish/part-link-tree-view";
import {
  getPartLinkDisplay,
  getPartLinkPreview,
  resolvePartVersionForDetach,
} from "@/lib/sections/actions";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DetachedContent } from "@/lib/sections/service";
import type { PartLinkTree } from "@/lib/sections/service";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * Settled Review Gate 3 decision, PRODUCT_SPEC.md §67.4/§68.6, corrected
 * Slice 6 correction pass §4, refined further in the design remediation
 * pass and Slice 6A: a PartLink is a data relationship, not a link-only or
 * collapsed placeholder — it reads like a Section after a small
 * relationship-specific header (title in the same style as a Section
 * heading, Part/Version/multiplier chips, and actions), with its
 * description and pinned Ingredients/Instructions shown directly beneath
 * once expanded. Scaling is the one editable property of the link itself,
 * via the compact inline row below, not an unlabeled settings toggle.
 *
 * Slice 6A: collapsed by default for an already-saved occurrence (has a
 * `lineageId`, same rule `SectionFields` uses) — a brand-new occurrence
 * just attached/created in this editing session starts expanded so the
 * user can confirm what was added. The header alone (title, chips,
 * actions) stays enough to navigate/act without expanding.
 */
export function PartLinkFields({
  id,
  prefix,
  containerKind,
  onRemove,
  onDetach,
}: {
  id: string;
  prefix: string;
  containerKind: DishKindValue;
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

  const [expanded, setExpanded] = React.useState(
    () => !getValues(`${prefix}.lineageId`),
  );

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

  // Fetched unconditionally, as soon as the target is known and the row is
  // expanded — the pinned content is visible by default once expanded, not
  // gated behind a second action. Re-fetches when the *committed*
  // multiplier changes (i.e. after Apply) — not on every Scaling-draft
  // keystroke.
  React.useEffect(() => {
    if (!expanded || !requestKey || !targetDishId || !targetDishVersionId) {
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
    expanded,
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
    ? formatVersionLabel(display.majorVersion, display.minorVersion)
    : null;
  const title = error
    ? "Linked Part unavailable"
    : (display?.title ?? "Loading…");
  // Slice 6A: "Copy to Section" replaces the old "Detach into local
  // content" engineering language — the tooltip spells out exactly what
  // happens (copies pinned content into a local Section, removes the
  // reusable link), swapping in "Part" when the parent is itself a Part.
  const copyToSectionTooltip = `Copies this Part's current pinned content into a local Section and removes the reusable Part link from this ${containerKind === "PART" ? "Part" : "Recipe"}.`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2 sm:contents">
          <DragHandle
            label={`Drag to reorder ${title}`}
            attributes={attributes}
            listeners={listeners}
            isDragging={isDragging}
          />
          <h3 className="font-heading text-foreground min-w-0 flex-1 truncate text-base font-medium sm:flex-initial">
            {title}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:min-w-0 sm:flex-1">
          <SemanticChip semantic="neutral">Part</SemanticChip>
          {versionLabel && (
            <SemanticChip semantic="purple" className="tabular-nums">
              {versionLabel}
            </SemanticChip>
          )}
          {committedMultiplier !== 1 && (
            <Badge variant="outline">× {committedMultiplier}</Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5 sm:shrink-0">
          {targetDishId && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <Link
                        href={`${dishBasePath("PART")}/${targetDishId}`}
                        target="_blank"
                        aria-label="View Part"
                      >
                        <Eye className="size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View Part</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <Link
                        href={`${dishBasePath("PART")}/${targetDishId}/edit`}
                        target="_blank"
                        aria-label="Edit Part"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit Part</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          <TooltipIconButton
            label="Copy to Section"
            tooltip={copyToSectionTooltip}
            icon={Copy}
            onClick={handleDetach}
            disabled={isDetaching}
          />
          <ItemToolbar
            label={title}
            collapsed={!expanded}
            onToggleCollapsed={() => setExpanded((prev) => !prev)}
            onRemove={onRemove}
          />
        </div>
      </div>

      {expanded && (
        <>
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
          {display?.description && (
            <p className="text-muted-foreground text-sm">
              {display.description}
            </p>
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetScaling}
            >
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
              <p role="alert" className="text-destructive-text text-sm">
                {preview.error}
              </p>
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
        </>
      )}
    </div>
  );
}
