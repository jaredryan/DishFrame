import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_GROCERY_CATEGORIES,
  FAVORITE_TAG_DISPLAY_NAME,
  OWNER_TASTER_DISPLAY_NAME,
  STARTER_FLAVOR_PROFILES,
  normalizeName,
} from "@/lib/account/defaults";

const P2002_UNIQUE_CONSTRAINT = "P2002";

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === P2002_UNIQUE_CONSTRAINT
  );
}

/**
 * Runs `fn`, treating a unique-constraint violation as success rather than
 * an error — a concurrent caller (a retried hook invocation, two near-
 * simultaneous sign-ins) already created the same row, which is exactly the
 * idempotent outcome this function wants.
 *
 * Deliberately NOT bundled into one shared `$transaction` across all of
 * `initializeNewUser`'s steps: Postgres aborts an entire transaction on the
 * first constraint violation, so catching a JS error from one step inside a
 * shared transaction would still poison every later statement in that same
 * transaction (they'd fail with "current transaction is aborted"). Each
 * step below is independently idempotent, so there is no cross-step
 * invariant that actually requires shared atomicity — running each as its
 * own statement is what makes the try/catch below actually work under real
 * concurrency, not just sequential re-runs.
 */
async function ignoringConcurrentDuplicate(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
  }
}

/**
 * Idempotent new-account setup (BUILD_PLAN.md Slice 2), run once per user
 * from the Better Auth `user.create.after` hook (src/lib/auth/auth.ts).
 * Safe to call more than once, including concurrently — every step either
 * upserts on a real unique constraint or checks-then-creates, and any
 * unique-constraint race is swallowed as an already-idempotent outcome, so
 * a retried hook invocation or a defensive re-run never creates duplicate
 * preferences, Favorite tags, owner Tasters, or default
 * categories/Flavor-profile values.
 */
export async function initializeNewUser(userId: string): Promise<void> {
  await ignoringConcurrentDuplicate(() =>
    prisma.userPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    }),
  );

  await ignoringConcurrentDuplicate(() =>
    prisma.tag.upsert({
      where: {
        ownerId_normalizedName: {
          ownerId: userId,
          normalizedName: normalizeName(FAVORITE_TAG_DISPLAY_NAME),
        },
      },
      update: {},
      create: {
        ownerId: userId,
        normalizedName: normalizeName(FAVORITE_TAG_DISPLAY_NAME),
        displayName: FAVORITE_TAG_DISPLAY_NAME,
        isFavorite: true,
      },
    }),
  );

  for (const displayName of DEFAULT_GROCERY_CATEGORIES) {
    await ignoringConcurrentDuplicate(() =>
      prisma.groceryCategory.upsert({
        where: {
          ownerId_normalizedName: {
            ownerId: userId,
            normalizedName: normalizeName(displayName),
          },
        },
        update: {},
        create: {
          ownerId: userId,
          normalizedName: normalizeName(displayName),
          displayName,
          position: DEFAULT_GROCERY_CATEGORIES.indexOf(displayName),
        },
      }),
    );
  }

  for (const displayName of STARTER_FLAVOR_PROFILES) {
    await ignoringConcurrentDuplicate(() =>
      prisma.flavorProfileValue.upsert({
        where: {
          ownerId_normalizedName: {
            ownerId: userId,
            normalizedName: normalizeName(displayName),
          },
        },
        update: {},
        create: {
          ownerId: userId,
          normalizedName: normalizeName(displayName),
          displayName,
          position: STARTER_FLAVOR_PROFILES.indexOf(displayName),
        },
      }),
    );
  }

  // No @@unique on (ownerId, isOwner) in the Prisma schema — it's a partial
  // unique index (one_owner_taster_per_user, PRISMA_SCHEMA_PROPOSAL.md §4)
  // rather than an ordinary column-level constraint Prisma can target with
  // `upsert`. Check-then-create is safe here because a concurrent duplicate
  // insert fails on that index and is swallowed above.
  const existingOwnerTaster = await prisma.taster.findFirst({
    where: { ownerId: userId, isOwner: true },
    select: { id: true },
  });
  if (!existingOwnerTaster) {
    await ignoringConcurrentDuplicate(() =>
      prisma.taster.create({
        data: {
          ownerId: userId,
          name: OWNER_TASTER_DISPLAY_NAME,
          isOwner: true,
        },
      }),
    );
  }
}
