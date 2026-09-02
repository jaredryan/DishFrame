import { describe, it, expect } from "vitest";
import { ValidationError } from "@/lib/errors";
import {
  serializeShareGraph,
  deserializeShareGraph,
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
