import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ValidationError } from "@/lib/errors";
import {
  wouldCreatePartCycle,
  type PartLinkEdge,
} from "@/lib/cycles/reachability";

/**
 * ARCHITECTURE_PROPOSAL.md §G.4: the authoritative check, re-run inside the
 * version-creation transaction immediately before commit — closes the race
 * window between attach-time validation and save. Only meaningful when the
 * item being saved is itself a Part (`kind = PART`): a PartLink's target
 * must always be `kind = PART` (§D.6), so a Recipe can never appear inside
 * anyone's reachable set and never needs this check for itself.
 */
export async function assertNoPartCycle(
  client: Prisma.TransactionClient | typeof prisma,
  subjectDishId: string,
  proposedTargets: PartLinkEdge[],
): Promise<void> {
  if (proposedTargets.length === 0) return;

  const fetchLiveLinks = async (
    dishVersionId: string,
  ): Promise<PartLinkEdge[]> => {
    const rows = await client.partLink.findMany({
      where: { containerVersionId: dishVersionId, linkState: "LIVE" },
      select: { targetDishId: true, targetDishVersionId: true },
    });
    return rows.filter(
      (row): row is PartLinkEdge =>
        row.targetDishId !== null && row.targetDishVersionId !== null,
    );
  };

  const hasCycle = await wouldCreatePartCycle(
    fetchLiveLinks,
    subjectDishId,
    proposedTargets,
  );

  if (hasCycle) {
    throw new ValidationError(
      "This would create a Part that contains itself, directly or indirectly. Choose a different Part or Version.",
    );
  }
}
