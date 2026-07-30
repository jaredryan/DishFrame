import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { initializeNewUser as InitializeNewUser } from "@/lib/account/init";

export const SEED_TITLE_PREFIX = "[QA] ";
export const SEED_TAG_NAME = "qa-seed";

/**
 * Better Auth's implicit-account-linking check (oauth2/link-account.mjs)
 * requires the EXISTING local user row's emailVerified to already be true
 * before it will attach a new Google account to it — otherwise sign-in
 * fails with "account not linked". Seeding a user with emailVerified:
 * false would make the whole "sign in and see the seeded records"
 * requirement silently impossible. Verified directly against the
 * installed better-auth package, not assumed.
 */
export async function resolveSeedOwner(
  initializeNewUser: typeof InitializeNewUser,
  email: string,
  name: string,
): Promise<{ id: string; email: string }> {
  const normalizedEmail = email.toLowerCase();
  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: { name, emailVerified: true },
    create: {
      id: randomUUID(),
      email: normalizedEmail,
      name,
      emailVerified: true,
    },
  });

  // Idempotent (src/lib/account/init.ts docstring) — safe to call on every
  // seed run, repairs anything missing without duplicating protected
  // singletons (Favorite tag, owner Taster, fallback Grocery Category).
  await initializeNewUser(user.id);

  return { id: user.id, email: user.email };
}

export async function ensureSeedTag(ownerId: string): Promise<string> {
  const normalizedName = SEED_TAG_NAME.toLowerCase();
  const tag = await prisma.tag.upsert({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
    update: {},
    create: {
      ownerId,
      normalizedName,
      displayName: SEED_TAG_NAME,
      isFavorite: false,
    },
  });
  return tag.id;
}

export async function attachSeedTag(
  dishId: string,
  tagId: string,
): Promise<void> {
  await prisma.dishTag.upsert({
    where: { dishId_tagId: { dishId, tagId } },
    update: {},
    create: { dishId, tagId },
  });
}

/**
 * Scoped by BOTH ownerId and the "[QA] " title marker (not just ownerId)
 * per the task's own "marked with the QA seed convention" requirement —
 * if the owner ever creates non-QA content under this same dedicated
 * account, it survives a reseed. Cascades (schema.prisma's onDelete:
 * Cascade on Dish.owner) take DishVersion/Section/Ingredient/
 * Instruction/PartLink-as-container with it; the `qa-seed` Tag row
 * itself is untouched (only its DishTag join rows cascade away), so it
 * doesn't need re-creating every run.
 *
 * Deletes RECIPE-kind rows first — a Recipe is never a PartLink *target*
 * (schema invariant: only PART-kind Dishes can be targeted), so all
 * Recipes can always be deleted in one batch with no ordering concerns.
 * PART-kind rows can reference EACH OTHER (e.g. this fixture set's Sauce
 * nests Seasoning), and `PartLink`'s FK to its target Version is
 * `onDelete: Restrict` (schema.prisma §D.6, guarding against silently
 * orphaning a live link) — a single unordered `deleteMany` across all
 * Parts throws `PartLink_targetDishId_targetDishVersionId_fkey` the
 * moment it tries to delete a Part something else still points at
 * (confirmed directly). Parts are therefore deleted in dependency-safe
 * passes instead: each pass deletes every remaining QA Part with no
 * surviving LIVE PartLink still targeting it, repeating until none
 * remain. Bounded loop — this fixture set's Part graph is small, shallow,
 * and acyclic (the domain layer's own cycle check guarantees no cycles
 * are ever seeded), so this always converges in a handful of passes.
 */
export async function wipeExistingFixtures(
  ownerId: string,
): Promise<{ deletedDishCount: number }> {
  const titleFilter = { startsWith: SEED_TITLE_PREFIX };
  const recipes = await prisma.dish.deleteMany({
    where: { ownerId, currentTitle: titleFilter, kind: "RECIPE" },
  });

  let deletedPartCount = 0;
  for (let pass = 0; pass < 20; pass++) {
    const remainingParts = await prisma.dish.findMany({
      where: { ownerId, currentTitle: titleFilter, kind: "PART" },
      select: { id: true },
    });
    if (remainingParts.length === 0) break;

    const remainingIds = remainingParts.map((part) => part.id);
    const stillTargeted = await prisma.partLink.findMany({
      where: { linkState: "LIVE", targetDishId: { in: remainingIds } },
      select: { targetDishId: true },
      distinct: ["targetDishId"],
    });
    const targetedIds = new Set(
      stillTargeted.map((link) => link.targetDishId!),
    );
    const deletableIds = remainingIds.filter((id) => !targetedIds.has(id));

    if (deletableIds.length === 0) {
      throw new Error(
        "[qa-seed] Could not find a safe delete order for QA Part fixtures — possible cycle among them.",
      );
    }

    const result = await prisma.dish.deleteMany({
      where: { id: { in: deletableIds } },
    });
    deletedPartCount += result.count;
  }

  return { deletedDishCount: recipes.count + deletedPartCount };
}
