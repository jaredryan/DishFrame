"use client";

import * as React from "react";
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

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      versions: VersionOption[];
      currentVersionId: string | null;
    };

/**
 * Fetches a Recipe/Part's Version list on demand (`listDishVersionOptions`)
 * and renders `VersionPickerField` against it — used wherever a picker
 * appears per selected item rather than backed by page-loaded data (Send,
 * Publish, Make-grocery-list, Add/Edit-meal). Defaults `value` to the
 * current Version once loaded, if the caller hasn't already picked one.
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
