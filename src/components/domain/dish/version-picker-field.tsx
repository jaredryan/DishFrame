"use client";

import * as React from "react";
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
 * The established Version-picker treatment (originally `DishDetailActions`'
 * export dialog): a labeled Select listing every Version, current one
 * suffixed "(current)". Presentational only — `versions` must already be
 * loaded; see `DishVersionPicker` below for the on-demand-fetching wrapper
 * used by the Send/Publish/grocery-list/meal-plan flows.
 */
export function VersionPickerField({
  id,
  versions,
  currentVersionId,
  value,
  onChangeAction,
  disabled,
  placeholder,
  className,
}: {
  id?: string;
  versions: VersionOption[];
  currentVersionId?: string | null;
  value: string | undefined;
  onChangeAction: (versionId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>Version</FieldLabel>
      <Select
        value={value}
        onValueChange={onChangeAction}
        disabled={disabled || versions.length === 0}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder ?? "Select a Version"} />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {versionLabel(v.majorVersion, v.minorVersion)}
              {v.id === currentVersionId ? " (current)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * The richer Version-picker treatment established on the Recipe Version/
 * Version History pages (`VersionSelector`): prev/next controls stepping
 * sequentially through every saved Version, plus a Select that jumps to the
 * latest minor of a chosen major line. `VersionSelector` itself navigates
 * via routing to that page's own URL; this is the same interaction
 * generalized to a plain value/callback picker for contexts with no
 * corresponding route (Send, Publish, Cooking Setup). `versions` must
 * already be ordered ascending by (majorVersion, minorVersion) — every
 * caller here sources it from `listDishVersionYieldOptions`, which
 * guarantees this.
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
  const activeIndex = versions.findIndex((v) => v.id === value);
  const active = activeIndex >= 0 ? versions[activeIndex] : undefined;
  const previous = activeIndex > 0 ? versions[activeIndex - 1] : null;
  const next =
    activeIndex >= 0 && activeIndex < versions.length - 1
      ? versions[activeIndex + 1]
      : null;

  const latestPerMajor = new Map<number, VersionOption>();
  for (const version of versions) {
    latestPerMajor.set(version.majorVersion, version);
  }
  const majorLines = [...latestPerMajor.values()].sort(
    (a, b) => a.majorVersion - b.majorVersion,
  );

  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>Version</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={disabled || !previous}
          onClick={() => previous && onChangeAction(previous.id)}
          aria-label={
            previous
              ? `Previous version, ${versionLabel(previous.majorVersion, previous.minorVersion)}`
              : "No previous version"
          }
        >
          <ChevronLeft aria-hidden="true" />
        </Button>

        <Select
          value={active ? String(active.majorVersion) : undefined}
          onValueChange={(majorValue) => {
            const target = latestPerMajor.get(Number(majorValue));
            if (target) onChangeAction(target.id);
          }}
          disabled={disabled || versions.length === 0}
        >
          <SelectTrigger
            id={id}
            aria-label="Jump to a major version line"
            className="w-40"
          >
            <SelectValue placeholder="Select a Version" />
          </SelectTrigger>
          <SelectContent>
            {majorLines.map((version) => (
              <SelectItem
                key={version.majorVersion}
                value={String(version.majorVersion)}
              >
                {versionLabel(version.majorVersion, version.minorVersion)}
                {version.id === currentVersionId ? " (current)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={disabled || !next}
          onClick={() => next && onChangeAction(next.id)}
          aria-label={
            next
              ? `Next version, ${versionLabel(next.majorVersion, next.minorVersion)}`
              : "No next version"
          }
        >
          <ChevronRight aria-hidden="true" />
        </Button>

        {active && (
          <span className="text-muted-foreground text-sm">
            {versionLabel(active.majorVersion, active.minorVersion)}
            {active.id === currentVersionId ? " (current)" : ""}
          </span>
        )}
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
 * and renders `VersionPickerField` against it — used wherever a picker
 * appears per selected item rather than backed by page-loaded data. Defaults
 * `value` to the current Version once loaded, if the caller hasn't already
 * picked one.
 */
export function DishVersionPicker({
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
      <VersionPickerField
        id={id}
        versions={[]}
        value={undefined}
        onChangeAction={() => {}}
        disabled
        placeholder={
          state.status === "error" ? "Couldn't load versions" : "Loading…"
        }
        className={className}
      />
    );
  }

  return (
    <VersionPickerField
      id={id}
      versions={state.versions}
      currentVersionId={state.currentVersionId}
      value={value ?? state.currentVersionId ?? undefined}
      onChangeAction={onChangeAction}
      className={className}
    />
  );
}

/**
 * Same on-demand fetch as `DishVersionPicker`, rendering the richer
 * `RichVersionPickerField` treatment instead — used by Send and Publish
 * (`/share`), which reuse the Recipe Version/Version History experience's
 * picker rather than the plain dropdown.
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
