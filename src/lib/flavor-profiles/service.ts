import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ConflictError } from "@/lib/errors";
import { normalizeName } from "@/lib/account/defaults";
import { getOwnedFlavorProfileValueOrThrow } from "@/lib/flavor-profiles/queries";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4), same
 * shape as src/lib/tasters/service.ts and src/lib/tags/service.ts.
 * PRODUCT_SPEC.md §79.3: create/rename/reorder/delete only — unlike Tasters,
 * Flavor profiles have no archive state.
 */

export async function createFlavorProfileValue(ownerId: string, name: string) {
  const normalizedName = normalizeName(name);
  return prisma.flavorProfileValue.upsert({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
    update: {},
    create: {
      ownerId,
      normalizedName,
      displayName: name,
      position:
        ((
          await prisma.flavorProfileValue.aggregate({
            where: { ownerId },
            _max: { position: true },
          })
        )._max.position ?? -1) + 1,
    },
  });
}

/**
 * Same identity-collision handling as `tags/service.ts`'s `renameTag`
 * (§45.6's merge-on-rename) — §79.3 doesn't separately spell out a merge
 * rule for Flavor profiles, but the underlying uniqueness constraint
 * (`ownerId, normalizedName`) is the same shape, so a rename that collides
 * with an existing value merges into it rather than throwing a raw
 * constraint violation.
 */
export async function renameFlavorProfileValue(
  ownerId: string,
  id: string,
  name: string,
) {
  const source = await getOwnedFlavorProfileValueOrThrow(ownerId, id);
  const normalizedName = normalizeName(name);
  if (normalizedName === source.normalizedName) {
    return prisma.flavorProfileValue.update({
      where: { id },
      data: { displayName: name },
    });
  }

  const destination = await prisma.flavorProfileValue.findUnique({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
  });

  if (!destination) {
    return prisma.flavorProfileValue.update({
      where: { id },
      data: { displayName: name, normalizedName },
    });
  }

  return prisma.$transaction(async (tx) => {
    const sourceLinks = await tx.dishFlavorProfile.findMany({
      where: { flavorProfileValueId: id },
    });
    if (sourceLinks.length > 0) {
      await tx.dishFlavorProfile.createMany({
        data: sourceLinks.map((link) => ({
          dishId: link.dishId,
          flavorProfileValueId: destination.id,
        })),
        skipDuplicates: true,
      });
      await tx.dishFlavorProfile.deleteMany({
        where: { flavorProfileValueId: id },
      });
    }
    await tx.flavorProfileValue.delete({ where: { id } });
    return destination;
  });
}

export async function deleteFlavorProfileValue(ownerId: string, id: string) {
  await getOwnedFlavorProfileValueOrThrow(ownerId, id);
  // Cascades DishFlavorProfile rows (schema onDelete: Cascade) — removes the
  // value from every Recipe/Part without deleting those items.
  return prisma.flavorProfileValue.delete({ where: { id } });
}

/** Same pattern as `tasters/service.ts`'s `reorderTasters` — the submitted
 * order must represent the caller's complete owned set. */
export async function reorderFlavorProfileValues(
  ownerId: string,
  orderedIds: string[],
) {
  const owned = await prisma.flavorProfileValue.findMany({
    where: { ownerId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((value) => value.id));
  const submittedIds = new Set(orderedIds);

  const isExactlyTheOwnedSet =
    orderedIds.length === submittedIds.size &&
    submittedIds.size === ownedIds.size &&
    orderedIds.every((id) => ownedIds.has(id));

  if (!isExactlyTheOwnedSet) {
    throw new ConflictError(
      "The submitted order does not match your current Flavor profiles.",
    );
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.flavorProfileValue.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
}
