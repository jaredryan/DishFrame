"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { readAndClearMultiSourceSetupSelection } from "@/lib/cooking/multi-source-setup-handoff";
import {
  getMultiSourceSetupData,
  type MultiSourceSetupSourceDto,
} from "@/lib/cooking/actions";
import { getMultiSourceSetupDataOffline } from "@/lib/cooking/offline-multi-source-setup";
import { MultiSourceCookingSetup } from "@/components/domain/cooking/multi-source-cooking-setup";
import type { ConsolidatedSetupUnit } from "@/lib/cooking/setup-units";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      sources: MultiSourceSetupSourceDto[];
      units: ConsolidatedSetupUnit[];
      cancelHref: string;
    };

/**
 * Multi-source Cooking Setup's own route (owner spec, 2026-09-17) —
 * reached only from the generic Start Cooking picker's Step 2, never a
 * direct link (there is no stable URL for an arbitrary source combination).
 * Client-rendered: the selection lives in `sessionStorage`
 * (`multi-source-setup-handoff.ts`), not route params, so this page reads
 * it once on mount and re-derives everything else server-side via
 * `getMultiSourceSetupData` — never trusting the stored selection's content
 * beyond which dishId/dishVersionId pairs to look up, same rule
 * `buildCookableUnits` already enforces for the single-source Setup page.
 * Refreshing or opening this URL directly finds nothing stored and redirects
 * back to `/cook` (no Cooking Session exists yet regardless).
 */
export default function MultiSourceCookingSetupPage() {
  const router = useRouter();
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    const selection = readAndClearMultiSourceSetupSelection();
    if (!selection) {
      router.replace("/cook");
      return;
    }
    const cancelHref = selection.from === "home" ? "/home" : "/cook";
    let cancelled = false;
    // Offline: read each selected source's own replicated Dish snapshot
    // instead of the Server Action (docs/OFFLINE_IMPLEMENTATION_PLAN.md §5)
    // — this route must work without a connection the same as reaching it
    // from the generic picker already does.
    const load =
      typeof navigator !== "undefined" && navigator.onLine === false
        ? getMultiSourceSetupDataOffline(selection.sources.map((s) => s.dishId))
        : getMultiSourceSetupData({ sources: selection.sources });
    load.then((result) => {
      if (cancelled) return;
      if (result.status === "success") {
        setState({
          status: "ready",
          sources: result.sources,
          units: result.units,
          cancelHref,
        });
      } else {
        setState({ status: "error", message: result.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-muted-foreground text-sm">Loading Cooking setup…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p role="alert" className="text-destructive-text text-sm">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8">
      <MultiSourceCookingSetup
        sources={state.sources}
        units={state.units}
        cancelHref={state.cancelHref}
      />
    </div>
  );
}
