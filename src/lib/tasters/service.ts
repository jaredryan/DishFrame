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
  return prisma.taster.create({ data: { ownerId, name } });
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
