import { describe, it, expect } from "vitest";
import { ValidationError } from "@/lib/errors";
import {
  serializeShareGraph,
  deserializeShareGraph,
  computeShareGraphEffectiveNutrition,
  type ShareGraph,
  type ShareGraphNode,
} from "@/lib/sharing/graph";

/**
 * Hardening pass: `DirectShare.frozenGraph` is persisted business data, not
 * a value this process just produced — `deserializeShareGraph` must reject
 * malformed or unsupported snapshots rather than crash deeper inside
 * `buildPublicShareContent`/`createIndependentCopyFromGraph`.
 */
describe("deserializeShareGraph", () => {
  const node: ShareGraphNode = {
    dishId: "dish-1",
    dishKind: "RECIPE",
    dishCuisines: ["Japanese"],
    dishTitle: "Ramen",
    versionId: "v1",
    majorVersion: 1,
    minorVersion: 0,
    description: null,
    imageAssetId: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    nutritionBasis: null,
    nutritionBasisQuantity: null,
    nutritionBasisUnit: null,
    moreNutrients: null,
    nutritionSourceProvider: null,
    nutritionSourceId: null,
    nutritionSourceName: null,
    sections: [],
    topLevelPartLinks: [],
  };

  it("round-trips a serialized graph", () => {
    const serialized = serializeShareGraph({
      nodes: new Map([["v1", node]]),
      order: ["v1"],
      rootVersionId: "v1",
    });
    const graph = deserializeShareGraph(serialized);
    expect(graph.rootVersionId).toBe("v1");
    expect(graph.nodes.get("v1")).toEqual(node);
  });

  it("rejects a snapshot with an unsupported formatVersion", () => {
    const serialized = serializeShareGraph({
      nodes: new Map([["v1", node]]),
      order: ["v1"],
      rootVersionId: "v1",
    });
    expect(() =>
      deserializeShareGraph({ ...serialized, formatVersion: 999 }),
    ).toThrow(ValidationError);
  });

  it("rejects structurally malformed JSON (e.g. nodes not an array)", () => {
    const serialized = serializeShareGraph({
      nodes: new Map([["v1", node]]),
      order: ["v1"],
      rootVersionId: "v1",
    });
    expect(() =>
      deserializeShareGraph({ ...serialized, nodes: "not-an-array" }),
    ).toThrow(ValidationError);
    expect(() => deserializeShareGraph(null)).toThrow(ValidationError);
    expect(() =>
      deserializeShareGraph({ ...serialized, rootVersionId: "missing-node" }),
    ).toThrow(ValidationError);
  });

  // Cuisine redesign (PRODUCT_SPEC.md §46, owner decision 2026-09-02): a
  // format-1 snapshot (every `DirectShare.frozenGraph`/`ShareLink` blob
  // written before this pass) still has each node's old singular
  // `dishCuisine: string | null` rather than `dishCuisines: string[]` —
  // `deserializeShareGraph` must still accept it and migrate the field on
  // read, so an already-sent FIXED_SNAPSHOT share keeps working.
  it("migrates a format-1 snapshot's singular dishCuisine into dishCuisines on read", () => {
    const { dishCuisines: _omit, ...nodeWithoutCuisines } = node;
    void _omit;
    const format1Node = { ...nodeWithoutCuisines, dishCuisine: "Japanese" };
    const format1Serialized = {
      formatVersion: 1,
      nodes: [["v1", format1Node]],
      order: ["v1"],
      rootVersionId: "v1",
    };

    const graph = deserializeShareGraph(format1Serialized);
    expect(graph.nodes.get("v1")).toEqual(node);
  });

  it("migrates a format-1 node with a null dishCuisine into an empty dishCuisines array", () => {
    const { dishCuisines: _omit, ...nodeWithoutCuisines } = node;
    void _omit;
    const format1Node = { ...nodeWithoutCuisines, dishCuisine: null };
    const format1Serialized = {
      formatVersion: 1,
      nodes: [["v1", format1Node]],
      order: ["v1"],
      rootVersionId: "v1",
    };

    const graph = deserializeShareGraph(format1Serialized);
    expect(graph.nodes.get("v1")?.dishCuisines).toEqual([]);
  });
});

/**
 * Composable nutrition (owner decision, 2026-09-17, PRODUCT_SPEC.md §54.5):
 * print and public share both compute effective nutrition from an
 * already-fully-resolved `ShareGraph` — this proves the same `calculate.ts`
 * engine composes correctly over that shape, including a nested Part
 * resolved from the exact Version the graph's PartLink pins (never a
 * different/current Version, since `ShareGraph` nodes are keyed by the
 * specific `versionId` `buildShareGraph` actually walked).
 */
describe("computeShareGraphEffectiveNutrition", () => {
  function baseNode(overrides: Partial<ShareGraphNode> = {}): ShareGraphNode {
    return {
      dishId: "dish-1",
      dishKind: "RECIPE",
      dishCuisines: [],
      dishTitle: "Test",
      versionId: "v1",
      majorVersion: 1,
      minorVersion: 0,
      description: null,
      imageAssetId: null,
      yieldQuantity: null,
      yieldUnit: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      difficulty: null,
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      nutritionBasis: null,
      nutritionBasisQuantity: null,
      nutritionBasisUnit: null,
      moreNutrients: null,
      nutritionSourceProvider: null,
      nutritionSourceId: null,
      nutritionSourceName: null,
      sections: [],
      topLevelPartLinks: [],
      ...overrides,
    };
  }

  it("sums ingredient nutrition across Sections", () => {
    const graph: ShareGraph = {
      rootVersionId: "v1",
      order: ["v1"],
      nodes: new Map([
        [
          "v1",
          baseNode({
            sections: [
              {
                lineageId: "s1",
                name: null,
                guidanceNote: null,
                position: 0,
                partLinks: [],
                nutritionOverride: null,
                ingredients: [
                  {
                    name: "Chicken",
                    quantity: 6,
                    quantityEnd: null,
                    isApproximate: false,
                    unit: "oz",
                    displayText: null,
                    preparationNote: null,
                    isOptional: false,
                    substitute: null,
                    nutrition: {
                      calories: 280,
                      protein: 53,
                      carbs: 0,
                      fat: 6,
                      moreNutrients: null,
                    },
                  },
                ],
                instructions: [],
              },
            ],
          }),
        ],
      ]),
    };

    const result = computeShareGraphEffectiveNutrition(graph, "v1");
    expect(result.state).toBe("COMPLETE");
    expect(result.totals.calories).toBe(280);
  });

  it("resolves a nested LIVE Part contribution from the exact pinned Version, scaled by multiplier", () => {
    const partNode = baseNode({
      dishId: "part-1",
      dishKind: "PART",
      versionId: "part-v1",
      calories: 100,
      protein: 5,
      carbs: 0,
      fat: 0,
    });
    const rootNode = baseNode({
      versionId: "root-v1",
      sections: [
        {
          lineageId: "s1",
          name: null,
          guidanceNote: null,
          position: 0,
          nutritionOverride: null,
          ingredients: [],
          instructions: [],
          partLinks: [
            {
              kind: "LIVE",
              targetDishId: "part-1",
              targetDishVersionId: "part-v1",
              position: 0,
              multiplier: 2,
            },
          ],
        },
      ],
    });
    const graph: ShareGraph = {
      rootVersionId: "root-v1",
      order: ["part-v1", "root-v1"],
      nodes: new Map([
        ["part-v1", partNode],
        ["root-v1", rootNode],
      ]),
    };

    const result = computeShareGraphEffectiveNutrition(graph, "root-v1");
    // The Part's own whole-Dish override (100 cal, itself OVERRIDE at the
    // Part's own level) contributes as one scaled, known value (x2 = 200)
    // into the root's calculated total — the root itself has no override
    // of its own, so it's COMPLETE (a fully-known calculated sum), not
    // OVERRIDE (a child's override never promotes its own parent's state).
    expect(result.state).toBe("COMPLETE");
    expect(result.totals.calories).toBe(200);
  });

  it("is NONE when nothing anywhere has nutrition data", () => {
    const graph: ShareGraph = {
      rootVersionId: "v1",
      order: ["v1"],
      nodes: new Map([["v1", baseNode()]]),
    };
    const result = computeShareGraphEffectiveNutrition(graph, "v1");
    expect(result.state).toBe("NONE");
  });
});
