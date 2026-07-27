/**
 * ARCHITECTURE_PROPOSAL.md §G.3/§G.6: cycle prevention validated at the
 * level of stable Part (Dish) identity, not DishVersion — a version graph
 * can never literally loop (every PartLink targets an already-persisted,
 * immutable DishVersion, §G.2), but PRODUCT_SPEC.md §67.3 rejects
 * self-composition at the Part-identity level regardless of which distinct
 * versions are involved.
 *
 * Framework-agnostic on purpose (ARCHITECTURE_PROPOSAL.md §K.4/§O): the BFS
 * itself takes a plain `fetchLiveLinks` callback so it can be unit-tested
 * against a constructed in-memory graph, with a separate thin Prisma-backed
 * wrapper below for real callers.
 */

export type PartLinkEdge = {
  targetDishId: string;
  targetDishVersionId: string;
};

// Safety valve against a latent bug or data-corruption edge case (§G.6) —
// not a product-facing nesting-depth restriction. No legitimate recipe
// composition approaches this.
export const MAX_PART_NESTING_DEPTH = 50;

export class PartNestingDepthExceededError extends Error {
  constructor() {
    super("Part nesting exceeded the maximum supported depth.");
    this.name = "PartNestingDepthExceededError";
  }
}

/**
 * BFS over the already-persisted, already-acyclic-by-construction PartLink
 * graph (§G.2), seeded with a proposed (not-yet-saved) set of target links.
 * Returns true if `subjectDishId` (the stable Part whose new content is
 * being validated) is reachable from any proposed target — i.e. saving
 * would make that Part transitively contain itself.
 *
 * A proposed target's own `targetDishId` is reachable at hop 0 (attaching
 * directly to a Part means containing it, with zero further hops) —
 * covers direct self-reference. Indirect cycles are caught by continuing
 * the walk through each visited version's own live links.
 *
 * The "distinct versions, not actually a cycle" case (Arch §O): this walk
 * only ever looks *outward* from the proposed targets' own already-saved
 * links. A different Part's independent, unrelated link that happens to
 * point at some version of the subject Part does not itself make the
 * subject Part reachable from the *proposed* targets, and is therefore
 * never treated as a cycle — the check only rejects a save when the
 * subject Part's own new links would create a real path back to itself.
 */
export async function wouldCreatePartCycle(
  fetchLiveLinks: (dishVersionId: string) => Promise<PartLinkEdge[]>,
  subjectDishId: string,
  proposedTargets: PartLinkEdge[],
  depthLimit: number = MAX_PART_NESTING_DEPTH,
): Promise<boolean> {
  const reachable = new Set<string>();
  const visitedVersionIds = new Set<string>();
  let frontier: string[] = [];

  for (const target of proposedTargets) {
    reachable.add(target.targetDishId);
    frontier.push(target.targetDishVersionId);
  }
  if (reachable.has(subjectDishId)) return true;

  let depth = 0;
  while (frontier.length > 0) {
    if (depth >= depthLimit) throw new PartNestingDepthExceededError();

    const nextFrontier: string[] = [];
    for (const versionId of frontier) {
      if (visitedVersionIds.has(versionId)) continue;
      visitedVersionIds.add(versionId);

      const links = await fetchLiveLinks(versionId);
      for (const link of links) {
        if (link.targetDishId === subjectDishId) return true;
        reachable.add(link.targetDishId);
        nextFrontier.push(link.targetDishVersionId);
      }
    }
    frontier = nextFrontier;
    depth++;
  }

  return false;
}
