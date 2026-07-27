import { describe, it, expect } from "vitest";
import {
  wouldCreatePartCycle,
  PartNestingDepthExceededError,
  type PartLinkEdge,
} from "@/lib/cycles/reachability";

/**
 * A constructed in-memory graph, keyed by dishVersionId → its own live
 * PartLink targets — lets the BFS be tested without Prisma/a real database,
 * per ARCHITECTURE_PROPOSAL.md §O.
 */
function graphFetcher(
  edges: Record<string, PartLinkEdge[]>,
): (versionId: string) => Promise<PartLinkEdge[]> {
  return async (versionId) => edges[versionId] ?? [];
}

describe("wouldCreatePartCycle", () => {
  it("rejects direct self-reference (Part A contains Part A)", async () => {
    const fetch = graphFetcher({});
    const hasCycle = await wouldCreatePartCycle(fetch, "part-a", [
      { targetDishId: "part-a", targetDishVersionId: "part-a-v1" },
    ]);
    expect(hasCycle).toBe(true);
  });

  it("rejects an indirect cycle (Part A contains Part B contains Part A)", async () => {
    // Part B's already-persisted V1 links back to Part A's V1.
    const fetch = graphFetcher({
      "part-b-v1": [
        { targetDishId: "part-a", targetDishVersionId: "part-a-v1" },
      ],
    });
    const hasCycle = await wouldCreatePartCycle(fetch, "part-a", [
      { targetDishId: "part-b", targetDishVersionId: "part-b-v1" },
    ]);
    expect(hasCycle).toBe(true);
  });

  it("allows a legitimate, non-cyclic nested composition", async () => {
    // Part A -> Part B -> Part C, no path back to A.
    const fetch = graphFetcher({
      "part-b-v1": [
        { targetDishId: "part-c", targetDishVersionId: "part-c-v1" },
      ],
      "part-c-v1": [],
    });
    const hasCycle = await wouldCreatePartCycle(fetch, "part-a", [
      { targetDishId: "part-b", targetDishVersionId: "part-b-v1" },
    ]);
    expect(hasCycle).toBe(false);
  });

  it("allows the same Part appearing twice via two distinct versions in one item", async () => {
    // Not a cycle at all — just reusing the same Part at two different
    // versions inside one container, e.g. an old and a new instance.
    const fetch = graphFetcher({
      "part-b-v1": [],
      "part-b-v2": [],
    });
    const hasCycle = await wouldCreatePartCycle(fetch, "recipe-x", [
      { targetDishId: "part-b", targetDishVersionId: "part-b-v1" },
      { targetDishId: "part-b", targetDishVersionId: "part-b-v2" },
    ]);
    expect(hasCycle).toBe(false);
  });

  it("does not flag a subject as reachable merely because an unrelated Part's own independent link points at it (distinct-version, not-actually-a-cycle case, Arch §O)", async () => {
    // Part Z links to some version of the subject Part A — but that link
    // belongs to Z's own, unrelated graph, not to any of the *proposed*
    // targets being validated for Part A's own new save. The walk only
    // ever looks outward from the proposed targets, so Z's link (which
    // nothing here points to) must never make this a false positive.
    const fetch = graphFetcher({
      "part-b-v1": [],
      "part-z-v1": [
        { targetDishId: "part-a", targetDishVersionId: "part-a-v1" },
      ],
    });
    const hasCycle = await wouldCreatePartCycle(fetch, "part-a", [
      { targetDishId: "part-b", targetDishVersionId: "part-b-v1" },
    ]);
    expect(hasCycle).toBe(false);
  });

  it("detects a deeper indirect cycle (A -> B -> C -> A)", async () => {
    const fetch = graphFetcher({
      "part-b-v1": [
        { targetDishId: "part-c", targetDishVersionId: "part-c-v1" },
      ],
      "part-c-v1": [
        { targetDishId: "part-a", targetDishVersionId: "part-a-v1" },
      ],
    });
    const hasCycle = await wouldCreatePartCycle(fetch, "part-a", [
      { targetDishId: "part-b", targetDishVersionId: "part-b-v1" },
    ]);
    expect(hasCycle).toBe(true);
  });

  it("throws once the walk exceeds the depth guard rather than looping forever (§G.6)", async () => {
    // A long, strictly-acyclic chain of 60 distinct Parts — legitimate by
    // construction (each links only to the next), but deeper than the
    // safety-valve cap, so the guard should fire rather than the walk
    // silently completing or hanging.
    const edges: Record<string, PartLinkEdge[]> = {};
    const depth = 60;
    for (let i = 0; i < depth; i++) {
      edges[`part-${i}-v1`] = [
        {
          targetDishId: `part-${i + 1}`,
          targetDishVersionId: `part-${i + 1}-v1`,
        },
      ];
    }
    const fetch = graphFetcher(edges);
    await expect(
      wouldCreatePartCycle(fetch, "part-unrelated", [
        { targetDishId: "part-0", targetDishVersionId: "part-0-v1" },
      ]),
    ).rejects.toThrow(PartNestingDepthExceededError);
  });
});
