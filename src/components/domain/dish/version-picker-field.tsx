"use client";

import * as React from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  VersionPicker,
  type VersionOption,
} from "@/components/domain/dish/version-picker";
import { listDishVersionOptions } from "@/lib/dishes/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

export type { VersionOption };

/**
 * `VersionPicker` wrapped with a `Field`/label — the labeled-field treatment
 * used everywhere a picker appears inline in a form (Cooking Setup, Send,
 * Publish, grocery-list flows, meal-plan Add/Edit meal). `versions` must
 * already be ordered ascending by (majorVersion, minorVersion).
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
      <VersionPicker
        id={id}
        versions={versions}
        currentVersionId={currentVersionId}
        value={value}
        onChangeAction={onChangeAction}
        disabled={disabled}
      />
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
