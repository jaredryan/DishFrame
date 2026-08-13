"use client";

import * as React from "react";
import { toggleChecklistItem } from "@/lib/cooking/actions";

/**
 * Cooking-mode checkbox interactions must never wait on a network round
 * trip to become visible (item 10 of the desktop redesign): a click flips
 * local state instantly via `overrides`, and `toggleChecklistItem` fires in
 * the background — not debounced, since a full page refresh (§29.4) can
 * arrive at any point after a click with no hook to flush a delayed save
 * first, so the request has to be in flight from the first tick. Overrides
 * deliberately survive a successful save (rather than being cleared) so the
 * UI never flickers back to stale server data while waiting for the next
 * incidental `router.refresh()` — they're reconciled away once the server's
 * own value catches up.
 */
export function useChecklistState(
  sessionId: string,
  units: { checklistItems: { id: string; checkedAt: string | null }[] }[],
  onError: (message: string) => void,
) {
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});
  // Items with a save currently in flight — kept out of the reconciliation
  // effect below so it doesn't clear an override before the server value
  // catches up. Doubles as the "a persist loop is already running for this
  // item" flag below.
  const pending = React.useRef<Record<string, true>>({});
  // The in-flight save promises themselves, so `flush()` can await them.
  const pendingSaves = React.useRef<Set<Promise<void>>>(new Set());
  // Latest checked value the user actually wants for each item, updated
  // synchronously on every click.
  const desired = React.useRef<Record<string, boolean>>({});

  React.useEffect(() => {
    setOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const unit of units) {
        for (const item of unit.checklistItems) {
          if (
            item.id in next &&
            !(item.id in pending.current) &&
            next[item.id] === (item.checkedAt != null)
          ) {
            delete next[item.id];
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [units]);

  function isChecked(item: { id: string; checkedAt: string | null }): boolean {
    return overrides[item.id] ?? item.checkedAt != null;
  }

  function clearOverride(itemId: string) {
    setOverrides((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  // Runs (and, while a newer click arrives mid-flight, re-runs) the save for
  // one item, never more than one request in flight at a time. Requests for
  // the same item can complete out of order over the network, so without
  // this a stale response could land after a fresher one and leave the
  // server's value behind the user's actual last click; serializing here
  // guarantees the last write always reflects `desired`, whichever value
  // that was when the last iteration started.
  function runPersistLoop(itemId: string): Promise<void> {
    const inFlight = pendingSaves.current;
    const loopPromise = (async () => {
      for (;;) {
        const checked = desired.current[itemId];
        const result = await toggleChecklistItem({
          sessionId,
          itemId,
          checked,
        });
        if (result.status === "error") {
          clearOverride(itemId);
          onError(result.message);
          return;
        }
        if (desired.current[itemId] === checked) return;
      }
    })().finally(() => {
      delete pending.current[itemId];
      delete desired.current[itemId];
      inFlight.delete(loopPromise);
    });
    inFlight.add(loopPromise);
    return loopPromise;
  }

  function requestPersist(itemId: string, checked: boolean) {
    desired.current[itemId] = checked;
    if (!pending.current[itemId]) {
      pending.current[itemId] = true;
      void runPersistLoop(itemId);
    }
  }

  function toggle(itemId: string, checked: boolean) {
    setOverrides((prev) => ({ ...prev, [itemId]: checked }));
    requestPersist(itemId, checked);
  }

  function toggleAll(itemIds: string[], checked: boolean) {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const id of itemIds) next[id] = checked;
      return next;
    });
    for (const itemId of itemIds) requestPersist(itemId, checked);
  }

  /**
   * Awaits every save currently in flight. Callers that transition the
   * session out of IN_PROGRESS (ending it) must await this first — the
   * server rejects a checklist toggle once the session is no longer
   * active, so a save still in flight when the session ends could
   * otherwise lose a race against it and be silently dropped.
   */
  async function flush(): Promise<void> {
    await Promise.all(pendingSaves.current);
  }

  return { isChecked, toggle, toggleAll, flush };
}
