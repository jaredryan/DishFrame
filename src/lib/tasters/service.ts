import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ConflictError } from "@/lib/errors";
import { getOwnedTasterOrThrow } from "@/lib/tasters/queries";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) — take
 * an explicit `ownerId` rather than reading the session themselves, so they
 * are unit/integration-testable without a Next.js request context and
 * reusable from Server Actions or future Route Handlers alike.
 */

export async function createTaster(ownerId: string, name: string) {
  // isOwner is never settable here — the built-in owner Taster is seeded
  // exactly once by src/lib/account/init.ts (PRODUCT_SPEC.md §34.2).
  const highestPosition = await prisma.taster.aggregate({
    where: { ownerId },
    _max: { position: true },
  });
  return prisma.taster.create({
    data: {
      ownerId,
      name,
      position: (highestPosition._max.position ?? -1) + 1,
    },
  });
}

export async function renameTaster(ownerId: string, id: string, name: string) {
  await getOwnedTasterOrThrow(ownerId, id);
  return prisma.taster.update({ where: { id }, data: { name } });
}

export async function archiveTaster(ownerId: string, id: string) {
  const taster = await getOwnedTasterOrThrow(ownerId, id);
  // PRODUCT_SPEC.md §34.2/§34.5 — the built-in "You" Taster must remain
  // ordinarily selectable; archiving it would defeat that guarantee.
  if (taster.isOwner) {
    throw new ConflictError("The built-in Taster can't be archived.");
  }
  return prisma.taster.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
}

export async function restoreTaster(ownerId: string, id: string) {
  await getOwnedTasterOrThrow(ownerId, id);
  return prisma.taster.update({ where: { id }, data: { archivedAt: null } });
}

export async function deleteTaster(ownerId: string, id: string) {
  const taster = await getOwnedTasterOrThrow(ownerId, id);
  // PRODUCT_SPEC.md §34.2 — one owner Taster per account is a standing
  // product invariant (also enforced at the database level by the
  // one_owner_taster_per_user partial unique index), not just a UI nicety.
  if (taster.isOwner) {
    throw new ConflictError("The built-in Taster can't be deleted.");
  }
  // Cascades Rating rows for this Taster (schema onDelete: Cascade) — rating
  // summaries simply reflect fewer rows on next read (§36.1/§I).
  return prisma.taster.delete({ where: { id } });
}

/**
 * Drag-and-drop reordering (same pattern as
 * `groceryService.reorderGroceryCategories`) — position is independent of
 * `isOwner`/`archivedAt`, so the built-in owner Taster is freely
 * reorderable just like the fallback Grocery Category is; only its
 * archive/delete actions are protected, not its position.
 *
 * Slice 3 closeout audit: `orderedIds` must represent the caller's
 * *complete* owned Taster set — exactly once each, nothing missing,
 * nothing foreign. There is no partial/archive-filtered reorderable view
 * today (the Settings list always renders every owned Taster, archived
 * included, in one reorderable list), so "complete" means every row this
 * owner has. A caller submitting a partial set would otherwise leave the
 * omitted rows at their old `position` values, which can now collide with
 * newly assigned ones and corrupt ordering for everyone.
 */
export async function reorderTasters(ownerId: string, orderedIds: string[]) {
  const owned = await prisma.taster.findMany({
    where: { ownerId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((taster) => taster.id));
  const submittedIds = new Set(orderedIds);

  const isExactlyTheOwnedSet =
    orderedIds.length === submittedIds.size && // no duplicate ids submitted
    submittedIds.size === ownedIds.size && // nothing omitted, nothing extra
    orderedIds.every((id) => ownedIds.has(id)); // no foreign/nonexistent ids

  if (!isExactlyTheOwnedSet) {
    throw new ConflictError(
      "The submitted order does not match your current Tasters.",
    );
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.taster.update({ where: { id }, data: { position: index } }),
    ),
  );
}
