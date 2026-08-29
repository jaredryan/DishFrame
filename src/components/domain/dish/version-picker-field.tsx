"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { versionLabel } from "@/lib/dishes/version-note";
import { listDishVersionOptions } from "@/lib/dishes/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

export type VersionOption = {
  id: string;
  majorVersion: number;
  minorVersion: number;
  yieldQuantity?: number | null;
  yieldUnit?: string | null;
};

/**
 * Shared row underlying every rich Version picker: prev/next controls
 * stepping sequentially through every saved Version, plus a Select listing
 * every saved Version (newest first) so any one of them — not just the
 * latest minor of a major line — is directly selectable (bug fix, frontend
 * interaction audit: the previous major-line-only Select showed a fixed
 * "latest minor" label for a whole line, so navigating via prev/next within
 * one line never visibly changed the displayed Version). Navigation is
 * either callback-driven (`onNavigateAction`, used by field/dialog contexts)
 * or link-driven (`hrefForVersionAction`, used by `VersionSelector`'s routed
 * Version History page so prev/next stay real anchors — middle-click/
 * open-in-new-tab keep working). `versions` must already be ordered
 * ascending by (majorVersion, minorVersion).
 */
export function VersionLineRow({
  id,
  versions,
  currentVersionId,
  activeVersionId,
  onNavigateAction,
  hrefForVersionAction,
  disabled,
  className,
}: {
  id?: string;
  versions: VersionOption[];
  currentVersionId?: string | null;
  activeVersionId: string | undefined;
  onNavigateAction: (versionId: string) => void;
  hrefForVersionAction?: (versionId: string) => string;
  disabled?: boolean;
  className?: string;
}) {
  const activeIndex = versions.findIndex((v) => v.id === activeVersionId);
  const active = activeIndex >= 0 ? versions[activeIndex] : undefined;
  const previous = activeIndex > 0 ? versions[activeIndex - 1] : null;
  const next =
    activeIndex >= 0 && activeIndex < versions.length - 1
      ? versions[activeIndex + 1]
      : null;

  // Newest first — the natural order for picking a specific saved Version.
  const orderedVersions = [...versions].reverse();

  function renderStep(
    target: VersionOption | null,
    direction: "previous" | "next",
  ) {
    const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
    const label = target
      ? `${direction === "previous" ? "Previous" : "Next"} version, ${versionLabel(target.majorVersion, target.minorVersion)}`
      : `No ${direction} version`;

    if (hrefForVersionAction) {
      return (
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!target}
          asChild={!!target}
          aria-label={target ? undefined : label}
        >
          {target ? (
            <Link href={hrefForVersionAction(target.id)} aria-label={label}>
              <Icon />
            </Link>
          ) : (
            <span aria-hidden="true">
              <Icon />
            </span>
          )}
        </Button>
      );
    }

    return (
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={disabled || !target}
        onClick={() => target && onNavigateAction(target.id)}
        aria-label={label}
      >
        <Icon aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {renderStep(previous, "previous")}

      <Select
        value={active?.id}
        onValueChange={(versionId) => onNavigateAction(versionId)}
        disabled={disabled || versions.length === 0}
      >
        <SelectTrigger id={id} aria-label="Select a Version" className="w-40">
          <SelectValue placeholder="Select a Version" />
        </SelectTrigger>
        <SelectContent>
          {orderedVersions.map((version) => (
            <SelectItem key={version.id} value={version.id}>
              {versionLabel(version.majorVersion, version.minorVersion)}
              {version.id === currentVersionId ? " (current)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {renderStep(next, "next")}
    </div>
  );
}

/**
 * The rich Version-picker treatment established on the Recipe Version/
 * Version History pages (`VersionSelector`): prev/next controls stepping
 * sequentially through every saved Version, plus a Select listing every
 * saved Version directly, labeled and wrapping `VersionLineRow`
 * above. `VersionSelector` itself navigates via routing to that page's own
 * URL; this is the same interaction generalized to a plain value/callback
 * picker, used everywhere else Version choice is exposed (Cooking Setup,
 * Send, Publish, grocery-list flows, meal-plan Add/Edit meal). `versions`
 * must already be ordered ascending by (majorVersion, minorVersion) — every
 * caller here sources it from `listDishVersionYieldOptions` (or an
 * equivalent per-flow query), which guarantees this.
 */
export function RichVersionPickerField({
  id,
  versions,
  currentVersionId,
  value,
  onChangeAction,
  disabled,
  className,
}: {
  id?: string;
  versions: VersionOption[];
  currentVersionId?: string | null;
  value: string | undefined;
  onChangeAction: (versionId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>Version</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <VersionLineRow
          id={id}
          versions={versions}
          currentVersionId={currentVersionId}
          activeVersionId={value}
          onNavigateAction={onChangeAction}
          disabled={disabled}
        />
      </div>
    </Field>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      versions: VersionOption[];
      currentVersionId: string | null;
    };

function useDishVersionOptions(
  kind: DishKindValue,
  dishId: string,
  value: string | null,
  onChangeAction: (versionId: string) => void,
): LoadState {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets to loading when kind/dishId changes, before the async fetch resolves
    setState({ status: "loading" });
    listDishVersionOptions(kind, dishId).then((result) => {
      if (cancelled) return;
      setState(
        result.status === "success"
          ? {
              status: "ready",
              versions: result.versions,
              currentVersionId: result.currentVersionId,
            }
          : { status: "error" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [kind, dishId]);

  // Every picker starts on "what's current" and only diverges from it on an
  // explicit user choice — necessarily an effect since it reacts to the
  // async fetch resolving, not to a render-time value.
  React.useEffect(() => {
    if (state.status === "ready" && value == null && state.currentVersionId) {
      onChangeAction(state.currentVersionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, value]);

  return state;
}

/**
 * Fetches a Recipe/Part's Version list on demand (`listDishVersionOptions`)
 * and renders `RichVersionPickerField` against it — used wherever a picker
 * appears per selected item rather than backed by page-loaded data (Send,
 * Publish). Defaults `value` to the current Version once loaded, if the
 * caller hasn't already picked one.
 */
export function RichDishVersionPicker({
  id,
  kind,
  dishId,
  value,
  onChangeAction,
  className,
}: {
  id?: string;
  kind: DishKindValue;
  dishId: string;
  value: string | null;
  onChangeAction: (versionId: string) => void;
  className?: string;
}) {
  const state = useDishVersionOptions(kind, dishId, value, onChangeAction);

  if (state.status !== "ready") {
    return (
      <RichVersionPickerField
        id={id}
        versions={[]}
        value={undefined}
        onChangeAction={() => {}}
        disabled
        className={className}
      />
    );
  }

  return (
    <RichVersionPickerField
      id={id}
      versions={state.versions}
      currentVersionId={state.currentVersionId}
      value={value ?? state.currentVersionId ?? undefined}
      onChangeAction={onChangeAction}
      className={className}
    />
  );
}
