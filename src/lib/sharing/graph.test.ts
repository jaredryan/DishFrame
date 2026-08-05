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
    dishCuisine: null,
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
});
