import * as React from "react";

/**
 * Frontend interaction-architecture audit (2026-08-28): several list/manager
 * components shared one `useTransition` pending flag across multiple
 * independent controls (a create form plus per-row rename/delete, or
 * several per-row actions) — wiring the shared Button `loading` prop to
 * that flag directly would spin whichever unrelated control happens to
 * read it, not the one the user actually clicked. Tracks which action is
 * actually running (a caller-defined key, e.g. `"delete"` or
 * `` `delete-${id}` ``) so only that action's own button shows loading,
 * while every control still disables via `isPending` to keep duplicate
 * submission blocked.
 */
export function usePendingAction<T extends string>() {
  const [pendingAction, setPendingAction] = React.useState<T | null>(null);
  const [, startTransition] = React.useTransition();

  function run(action: T, task: () => Promise<void>) {
    setPendingAction(action);
    startTransition(async () => {
      try {
        await task();
      } finally {
        setPendingAction(null);
      }
    });
  }

  return { pendingAction, isPending: pendingAction !== null, run };
}
