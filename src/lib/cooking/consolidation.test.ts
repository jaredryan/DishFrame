import { describe, it, expect } from "vitest";
import {
  consolidateSources,
  suggestConsolidatedOrder,
} from "@/lib/cooking/consolidation";
import type { CookableUnit } from "@/lib/cooking/queries";

/**
 * Multi-source shared-Part consolidation (owner spec, 2026-09-17) — pure
 * unit coverage for the core requirement: exact-same-Part-and-Version
 * merges across sources with a weighted-sum aggregate and no double
 * counting; a Section, or the same Part at a different Version, never
 * merges. No database — every input is a hand-built `CookableUnit[]`, the
 * exact shape `buildCookableUnits` produces per source.
 */

function section(label: string, quantity: number): CookableUnit {
  return {
    unitKey: `section:${label}`,
    kind: "SECTION",
    label,
    sourceDishTitle: label,
    sourceDishVersionLabel: "V1.0",
    sourceSectionLineageId: `section-lineage-${label}`,
    sourcePartLinkLineageId: null,
    estimatedDurationMinutes: null,
    authoredIndex: 0,
    checklist: [
      {
        kind: "INGREDIENT",
        sourceLineageId: `ing-${label}`,
        name: "Rice",
        quantity,
        quantityEnd: null,
        isApproximate: false,
        unit: "cups",
        freeText: null,
        preparationNote: null,
      },
    ],
    outputQuantity: null,
    outputUnit: null,
    targetDishId: null,
    targetDishVersionId: null,
    partRelation: null,
    partViaTitleSnapshot: null,
    partPathSnapshot: null,
    linkMultiplier: 1,
  };
}

/** `rawIngredientQuantity`/`rawOutputQuantity` are the Part's own *authored*
 * (unscaled) values — identical across every contributor referencing the
 * same Part+Version, exactly like real `buildCookableUnits` output.
 * `linkMultiplier` is this one contributor's own authored PartLink
 * multiplier — `checklist[].quantity` is pre-scaled by it here (matching
 * `buildPartUnitTree`'s own `scaleRaw`), while `outputQuantity` is left raw
 * (matching `CookableUnit.linkMultiplier`'s own doc comment). */
function partUnit({
  lineageId,
  targetDishId,
  targetDishVersionId,
  rawIngredientQuantity,
  rawOutputQuantity,
  linkMultiplier = 1,
  authoredIndex = 0,
}: {
  lineageId: string;
  targetDishId: string;
  targetDishVersionId: string;
  rawIngredientQuantity: number;
  rawOutputQuantity: number | null;
  linkMultiplier?: number;
  authoredIndex?: number;
}): CookableUnit {
  return {
    unitKey: `part:${lineageId}`,
    kind: "PART",
    label: "Roasted Carrots",
    sourceDishTitle: "Roasted Carrots",
    sourceDishVersionLabel: "V2.0",
    sourceSectionLineageId: null,
    sourcePartLinkLineageId: lineageId,
    estimatedDurationMinutes: 20,
    authoredIndex,
    checklist: [
      {
        kind: "INGREDIENT",
        sourceLineageId: "carrots-ingredient",
        name: "Carrots",
        quantity: rawIngredientQuantity * linkMultiplier,
        quantityEnd: null,
        isApproximate: false,
        unit: "cups",
        freeText: null,
        preparationNote: null,
      },
      {
        kind: "INSTRUCTION",
        sourceLineageId: "carrots-step-1",
        text: "Roast.",
      },
    ],
    outputQuantity: rawOutputQuantity,
    outputUnit: "cups",
    targetDishId,
    targetDishVersionId,
    partRelation: "DIRECT",
    partViaTitleSnapshot: null,
    partPathSnapshot: `Container → Roasted Carrots`,
    linkMultiplier,
  };
}

describe("consolidateSources", () => {
  it("keeps a single-source unit unmerged, unchanged from its own source copy", () => {
    const [unit] = consolidateSources([
      { cookableUnits: [section("Prep", 2)], scaleFactor: null },
    ]);
    expect(unit.contributions).toHaveLength(1);
    expect(unit.unit.checklist[0]).toMatchObject({ quantity: 2 });
  });

  it("merges the exact same Part + exact same Version across two sources into one unit", () => {
    const carrotsA = partUnit({
      lineageId: "chicken-bowl-carrots",
      targetDishId: "part-carrots",
      targetDishVersionId: "part-carrots-v2",
      rawIngredientQuantity: 2,
      rawOutputQuantity: 2,
    });
    const carrotsB = partUnit({
      lineageId: "beef-bowl-carrots",
      targetDishId: "part-carrots",
      targetDishVersionId: "part-carrots-v2",
      rawIngredientQuantity: 2,
      rawOutputQuantity: 2,
      linkMultiplier: 0.5,
    });

    const result = consolidateSources([
      { cookableUnits: [carrotsA], scaleFactor: null },
      { cookableUnits: [carrotsB], scaleFactor: null },
    ]);

    expect(result).toHaveLength(1);
    const [merged] = result;
    expect(merged.mergeKey).toBe("part:part-carrots:part-carrots-v2");
    expect(merged.contributions).toHaveLength(2);
  });

  it("aggregate quantity equals the sum of each source's own (link-multiplier- and scale-weighted) contribution — never double-counted", () => {
    // The exact spec example: Chicken Bowl uses a full batch (multiplier 1),
    // Beef Bowl uses half a batch (multiplier 0.5) of the *same* Part+Version
    // — its own raw authored yield/ingredient quantities are identical for
    // both (2 cups authored carrots, 2 cups authored yield); only each
    // source's own link multiplier and session/source scale differ.
    const carrotsA = partUnit({
      lineageId: "chicken-bowl-carrots",
      targetDishId: "part-carrots",
      targetDishVersionId: "part-carrots-v2",
      rawIngredientQuantity: 2,
      rawOutputQuantity: 2,
      linkMultiplier: 1,
    });
    const carrotsB = partUnit({
      lineageId: "beef-bowl-carrots",
      targetDishId: "part-carrots",
      targetDishVersionId: "part-carrots-v2",
      rawIngredientQuantity: 2,
      rawOutputQuantity: 2,
      linkMultiplier: 0.5,
    });

    const [merged] = consolidateSources([
      { cookableUnits: [carrotsA], scaleFactor: 1.5 }, // Chicken Bowl scaled 1.5x
      { cookableUnits: [carrotsB], scaleFactor: 2 }, // Beef Bowl scaled 2x
    ]);

    // Chicken Bowl: 2 cups authored * 1 (link) * 1.5 (source scale) = 3.
    // Beef Bowl: 2 cups authored * 0.5 (link) * 2 (source scale) = 2.
    // Aggregate: 3 + 2 = 5 — never 2 + 1 = 3 (ignoring scale), never
    // double-counted, and never derived from the raw un-weighted yield.
    const carrotsChecklist = merged.unit.checklist.find(
      (c) => c.kind === "INGREDIENT",
    );
    expect(carrotsChecklist).toMatchObject({ quantity: 5 });
    expect(merged.unit.outputQuantity).toBe(5);

    // Per-source allocation is retained: each contribution keeps its own
    // weighted share, summing back to the same aggregate.
    const [contribA, contribB] = merged.contributions;
    expect(contribA.contributionQuantity).toBe(3);
    expect(contribB.contributionQuantity).toBe(2);
    expect(
      contribA.contributionQuantity! + contribB.contributionQuantity!,
    ).toBe(5);
  });

  it("never merges the same Part at two different Versions", () => {
    const v1 = partUnit({
      lineageId: "chicken-bowl-carrots",
      targetDishId: "part-carrots",
      targetDishVersionId: "part-carrots-v1",
      rawIngredientQuantity: 2,
      rawOutputQuantity: 2,
    });
    const v2 = partUnit({
      lineageId: "beef-bowl-carrots",
      targetDishId: "part-carrots",
      targetDishVersionId: "part-carrots-v2",
      rawIngredientQuantity: 2,
      rawOutputQuantity: 2,
    });

    const result = consolidateSources([
      { cookableUnits: [v1], scaleFactor: null },
      { cookableUnits: [v2], scaleFactor: null },
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((u) => u.contributions.length === 1)).toBe(true);
  });

  it("never merges Section units even when authored identically across sources", () => {
    const result = consolidateSources([
      { cookableUnits: [section("Prep", 2)], scaleFactor: null },
      { cookableUnits: [section("Prep", 2)], scaleFactor: null },
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((u) => u.contributions.length === 1)).toBe(true);
  });

  it("does not double-count a Part reached through independent nested occurrences from two sources", () => {
    // Simulates two different top-level sources each independently nesting
    // the same shared Part at any depth — buildCookableUnits has already
    // flattened each into its own top-level CookableUnit by the time this
    // function sees them, so this is the same merge as the top-level case,
    // exercised through nested-looking lineage ids.
    const nestedA = partUnit({
      lineageId: "chicken-bowl-sauce-nested-carrots",
      targetDishId: "part-carrots",
      targetDishVersionId: "part-carrots-v2",
      rawIngredientQuantity: 2,
      rawOutputQuantity: 2,
      linkMultiplier: 0.25,
    });
    const nestedB = partUnit({
      lineageId: "beef-bowl-sauce-nested-carrots",
      targetDishId: "part-carrots",
      targetDishVersionId: "part-carrots-v2",
      rawIngredientQuantity: 2,
      rawOutputQuantity: 2,
      linkMultiplier: 0.25,
    });

    const [merged] = consolidateSources([
      { cookableUnits: [nestedA], scaleFactor: null },
      { cookableUnits: [nestedB], scaleFactor: null },
    ]);

    expect(merged.contributions).toHaveLength(2);
    expect(merged.unit.outputQuantity).toBe(1); // 0.5 + 0.5, not 0.5 or 2
  });
});

describe("suggestConsolidatedOrder", () => {
  it("sorts by estimated duration across the whole combined set, not per source", () => {
    const quickSection = section("Quick prep", 1); // no duration
    const longPart = partUnit({
      lineageId: "long-part",
      targetDishId: "part-x",
      targetDishVersionId: "part-x-v1",
      rawIngredientQuantity: 1,
      rawOutputQuantity: 1,
    }); // estimatedDurationMinutes: 20

    const merged = consolidateSources([
      { cookableUnits: [quickSection], scaleFactor: null },
      { cookableUnits: [longPart], scaleFactor: null },
    ]);
    const ordered = suggestConsolidatedOrder(merged);
    expect(ordered[0].unit.label).toBe("Roasted Carrots"); // has a duration
    expect(ordered[1].unit.label).toBe("Quick prep"); // no duration, sorts after
  });

  it("falls back to (source position, that source's own authored order) when durations tie", () => {
    const a = section("A", 1);
    const b = section("B", 1);
    const merged = consolidateSources([
      { cookableUnits: [b], scaleFactor: null }, // source 0
      { cookableUnits: [a], scaleFactor: null }, // source 1
    ]);
    const ordered = suggestConsolidatedOrder(merged);
    expect(ordered.map((u) => u.unit.label)).toEqual(["B", "A"]);
  });
});
