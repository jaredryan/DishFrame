import type { CookableUnit, CookableChecklistRaw } from "@/lib/cooking/queries";

/**
 * Multi-source shared-Part consolidation (owner's multi-source Cooking
 * Sessions spec, 2026-09-17 — "a core requirement"). Framework-agnostic,
 * same convention as `queries.ts`/`checklist-render.ts`: pure functions over
 * each source's own already-resolved `buildCookableUnits` output, callable
 * from both the Setup-time preview (before any session exists) and
 * session-creation itself, so the two never compute the merge differently.
 *
 * Match rule: two units consolidate only when both are PART-kind and
 * reference the exact same Part identity + exact same Part Version
 * (`targetDishId`/`targetDishVersionId`) — never a Section (unique to its
 * own Recipe by construction) and never two different Versions of the same
 * Part. Because every contributing source's copy of that unit was built
 * from the literal same Version, its authored content (ingredient
 * identities, instructions, output unit) is guaranteed identical across
 * contributors — only each source's own scale (and, for a nested Part, its
 * own authored PartLink multiplier, already baked into that source's own
 * `checklist[].quantity` by `buildCookableUnits`) differs. Aggregating is
 * therefore a per-ingredient weighted sum, never a content merge.
 */

export type ConsolidationSourceInput = {
  cookableUnits: CookableUnit[];
  /** This source's own configured scale (Setup Step 2 / Cooking Setup's
   * per-source scale field) — the weight applied to every one of this
   * source's own contributed quantities before summing. */
  scaleFactor: number | null;
};

export type ConsolidatedContribution = {
  sourceIndex: number;
  /** This contribution's own local `CookableUnit.unitKey`, scoped to its
   * own source's Version — never the merged unit's identity (see
   * `CookingSessionUnitContribution.sourceUnitKey`'s own doc comment). */
  sourceUnitKey: string;
  /** This source's own effective weight (its own scaleFactor; 1 when unset). */
  weight: number;
  /** This source's own unmerged copy — carries this source's own
   * `partViaTitleSnapshot`/`partPathSnapshot`/`estimatedDurationMinutes`/
   * `outputQuantity`, needed for per-source attribution and for the
   * duration-based suggested order. */
  unit: CookableUnit;
  /** This contribution's own share of the merged unit's aggregate output
   * (e.g. "2 cups" of a merged unit's "3 cups total") — null when the Part
   * has no authored yield to allocate. */
  contributionQuantity: number | null;
  contributionUnit: string | null;
};

export type ConsolidatedUnit = {
  /** Stable across a re-run of this same source set — `part:{dishId}:{versionId}`
   * for a consolidated/consolidatable Part, otherwise unique to one
   * source's own copy (a Section, or a Part whose target no longer
   * resolves). Never persisted directly; it's what groups contributions. */
  mergeKey: string;
  kind: "SECTION" | "PART";
  /** Representative content for the merged unit — for a single-contribution
   * unit this *is* that source's own unit, unchanged; for a genuinely
   * consolidated unit (contributions.length > 1), `checklist`/`outputQuantity`
   * are the aggregated (summed) values and every other field (label,
   * targetDishId, etc.) is taken from the first contributor, which is safe
   * exactly because that content is identical across every contributor by
   * the match rule above. */
  unit: CookableUnit;
  contributions: ConsolidatedContribution[];
};

function mergeKeyFor(sourceIndex: number, unit: CookableUnit): string {
  if (unit.kind === "PART" && unit.targetDishId && unit.targetDishVersionId) {
    return `part:${unit.targetDishId}:${unit.targetDishVersionId}`;
  }
  // Sections never consolidate (unique to their own Recipe); neither does a
  // Part whose target link somehow didn't resolve to an id pair (defensive
  // — buildCookableUnits already only ever emits a PART unit when it did).
  return `unique:${sourceIndex}:${unit.unitKey}`;
}

function aggregateChecklist(
  contributions: Array<{ unit: CookableUnit; weight: number }>,
): CookableChecklistRaw[] {
  const template = contributions[0].unit.checklist;
  return template.map((templateRaw) => {
    if (templateRaw.kind === "INSTRUCTION" || templateRaw.quantity == null) {
      // Instructions and free-text/quantity-less ingredient rows are
      // identical across every contributor (same authored Version) —
      // nothing to sum.
      return templateRaw;
    }
    let quantity = 0;
    let quantityEnd = templateRaw.quantityEnd == null ? null : 0;
    for (const { unit, weight } of contributions) {
      const raw =
        unit.checklist.find(
          (r) => r.sourceLineageId === templateRaw.sourceLineageId,
        ) ?? templateRaw;
      if (raw.kind === "INGREDIENT" && raw.quantity != null) {
        quantity += raw.quantity * weight;
        if (quantityEnd != null && raw.quantityEnd != null) {
          quantityEnd += raw.quantityEnd * weight;
        }
      }
    }
    return { ...templateRaw, quantity, quantityEnd };
  });
}

/** `unit.outputQuantity` is the Part's own *raw* authored yield — identical
 * across every contributor referencing the same Part+Version, deliberately
 * unscaled by that contributor's own PartLink multiplier (see
 * `CookableUnit.linkMultiplier`'s own doc comment). The checklist ingredient
 * quantities this same function's sibling (`aggregateChecklist`) sums *are*
 * already multiplier-scaled, so this must apply `linkMultiplier` itself to
 * land on the same basis — otherwise the merged unit's own "N total" output
 * would silently disagree with its own aggregated checklist quantities. */
function contributionOutputQuantity(
  unit: CookableUnit,
  weight: number,
): number {
  return (unit.outputQuantity ?? 0) * unit.linkMultiplier * weight;
}

/**
 * Live per-source rescale (owner completion-pass spec, 2026-09-18) —
 * re-aggregates one already-consolidated unit's checklist/output from a
 * fresh set of contributions (each re-derived from its own source's
 * current content, weighted by that source's *current* scale — the
 * rescaled source's new value, every other contributor's existing one).
 * Exactly the same math `consolidateSources` already applies when first
 * building a merged unit — exposed separately so a targeted single-unit
 * recompute (`service.ts`'s `updateSourceScale`) doesn't need to re-run
 * the full cross-source grouping pass just to reach it. Never call this
 * for a single-contribution (ordinary) unit — its `baseQuantity` is
 * deliberately never source-scaled; see `CookableUnit.linkMultiplier`'s
 * own doc comment.
 */
export function recomputeContributionAggregate(
  contributions: Array<{ unit: CookableUnit; weight: number }>,
): { checklist: CookableChecklistRaw[]; outputQuantity: number | null } {
  return {
    checklist: aggregateChecklist(contributions),
    outputQuantity: sumOutputQuantity(contributions),
  };
}

function sumOutputQuantity(
  contributions: Array<{ unit: CookableUnit; weight: number }>,
): number | null {
  if (contributions[0].unit.outputQuantity == null) return null;
  return contributions.reduce(
    (sum, { unit, weight }) => sum + contributionOutputQuantity(unit, weight),
    0,
  );
}

/**
 * Merges every selected source's own `buildCookableUnits` output into one
 * combined set of cookable units, consolidating exact-same-Part-and-Version
 * occurrences across sources (recursively — a nested Part reached through
 * two different top-level sources consolidates exactly like a top-level
 * one, since `buildCookableUnits` already flattens nesting into independent
 * `CookableUnit` entries before this function ever sees them). Never
 * double-counts: each contributing source's own weighted quantity is summed
 * exactly once per ingredient, regardless of how deep that source's own
 * copy was nested.
 */
export function consolidateSources(
  sources: ConsolidationSourceInput[],
): ConsolidatedUnit[] {
  const groups = new Map<
    string,
    Array<{ sourceIndex: number; weight: number; unit: CookableUnit }>
  >();
  const order: string[] = [];

  sources.forEach((source, sourceIndex) => {
    const weight = source.scaleFactor ?? 1;
    for (const unit of source.cookableUnits) {
      const key = mergeKeyFor(sourceIndex, unit);
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push({ sourceIndex, weight, unit });
    }
  });

  return order.map((key) => {
    const raw = groups.get(key)!;
    const first = raw[0].unit;
    const isConsolidated = raw.length > 1;

    const unit: CookableUnit = isConsolidated
      ? {
          ...first,
          checklist: aggregateChecklist(raw),
          outputQuantity: sumOutputQuantity(raw),
        }
      : first;

    const contributions: ConsolidatedContribution[] = raw.map((entry) => {
      const contributionQuantity =
        entry.unit.outputQuantity == null
          ? null
          : contributionOutputQuantity(entry.unit, entry.weight);
      return {
        sourceIndex: entry.sourceIndex,
        sourceUnitKey: entry.unit.unitKey,
        weight: entry.weight,
        unit: entry.unit,
        contributionQuantity,
        contributionUnit: entry.unit.outputUnit,
      };
    });

    return { mergeKey: key, kind: first.kind, unit, contributions };
  });
}

/**
 * §23.5's duration-based suggested order, generalized across the whole
 * combined set (owner spec: "Apply the existing duration-based ordering
 * logic across the entire combined set rather than independently per
 * Recipe"). Tie-break falls back to (source position, that source's own
 * authored order) rather than a single cross-source `authoredIndex` — the
 * two sources' own authored positions aren't comparable to each other, so
 * the fallback groups by the order the user selected sources in Step 1,
 * then by each source's own authored order within it.
 */
export function suggestConsolidatedOrder(
  units: ConsolidatedUnit[],
): ConsolidatedUnit[] {
  return [...units].sort((a, b) => {
    const aDuration = a.unit.estimatedDurationMinutes;
    const bDuration = b.unit.estimatedDurationMinutes;
    if (aDuration != null && bDuration != null && aDuration !== bDuration) {
      return bDuration - aDuration;
    }
    if (aDuration != null && bDuration == null) return -1;
    if (aDuration == null && bDuration != null) return 1;

    const aFirst = a.contributions[0];
    const bFirst = b.contributions[0];
    if (aFirst.sourceIndex !== bFirst.sourceIndex) {
      return aFirst.sourceIndex - bFirst.sourceIndex;
    }
    return aFirst.unit.authoredIndex - bFirst.unit.authoredIndex;
  });
}
