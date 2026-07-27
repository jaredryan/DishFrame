import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  FALLBACK_GROCERY_CATEGORY_NAME,
  FAVORITE_TAG_DISPLAY_NAME,
  ORDINARY_DEFAULT_GROCERY_CATEGORIES,
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
 * simultaneous sign-ins, a retry from the (app) shell layout) already
 * created the same row, which is exactly the idempotent outcome this
 * function wants.
 *
 * Deliberately NOT bundled into one shared `$transaction` across
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

async function ensureFavoriteTag(userId: string) {
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
}

async function ensureOwnerTaster(userId: string) {
  // No @@unique on (ownerId, isOwner) in the Prisma schema — it's a partial
  // unique index (one_owner_taster_per_user, PRISMA_SCHEMA_PROPOSAL.md §4)
  // rather than an ordinary column-level constraint Prisma can target with
  // `upsert`. Check-then-create is safe here because a concurrent duplicate
  // insert fails on that index and is swallowed below.
  const existingOwnerTaster = await prisma.taster.findFirst({
    where: { ownerId: userId, isOwner: true },
    select: { id: true },
  });
  if (existingOwnerTaster) return;

  await ignoringConcurrentDuplicate(() =>
    prisma.taster.create({
      data: {
        ownerId: userId,
        name: OWNER_TASTER_DISPLAY_NAME,
        // Always the first Taster created for a new account, so position 0
        // is correct here without needing an aggregate query (unlike
        // createTaster in tasters/service.ts, which runs against an
        // already-populated list).
        position: 0,
        isOwner: true,
      },
    }),
  );
}

async function ensureFallbackGroceryCategory(userId: string) {
  // Same check-then-create reasoning as ensureOwnerTaster: isFallback's
  // uniqueness is a raw-SQL partial unique index
  // (one_fallback_category_per_user), not a Prisma-representable
  // column-level constraint.
  const existingFallback = await prisma.groceryCategory.findFirst({
    where: { ownerId: userId, isFallback: true },
    select: { id: true },
  });
  if (existingFallback) return;

  const highestPosition = await prisma.groceryCategory.aggregate({
    where: { ownerId: userId },
    _max: { position: true },
  });

  // Upsert-by-name (rather than a plain create) so a partially-initialized
  // account that already has an ordinary, non-fallback "Other" category
  // (e.g., from an interrupted run before this flag existed) gets repaired
  // in place instead of gaining a second "Other" row.
  await ignoringConcurrentDuplicate(() =>
    prisma.groceryCategory.upsert({
      where: {
        ownerId_normalizedName: {
          ownerId: userId,
          normalizedName: normalizeName(FALLBACK_GROCERY_CATEGORY_NAME),
        },
      },
      update: { isFallback: true },
      create: {
        ownerId: userId,
        normalizedName: normalizeName(FALLBACK_GROCERY_CATEGORY_NAME),
        displayName: FALLBACK_GROCERY_CATEGORY_NAME,
        position: (highestPosition._max.position ?? -1) + 1,
        isFallback: true,
      },
    }),
  );
}

/**
 * Idempotent, recoverable new-account setup (BUILD_PLAN.md Slice 2 +
 * follow-up). Runs from Better Auth's `user.create.after` hook on sign-up
 * AND from the (app) shell layout on every request until
 * `UserPreference.defaultsInitializedAt` is set — recovery does not depend
 * solely on the one-shot hook, so a crash partway through a prior run (or a
 * user created before some of this initialization existed) gets repaired
 * the next time the account is used.
 *
 * Two kinds of state, repaired differently:
 * - Protected singletons (Favorite tag, owner Taster, fallback Grocery
 *   Category) are checked and repaired on *every* call, regardless of the
 *   completion marker — these must always exist.
 * - Ordinary one-time seed data (starter Grocery Categories, starter Flavor
 *   Profiles) is created only the *first* time, gated on
 *   `defaultsInitializedAt` being unset — a user who later deletes or
 *   renames one of these must never have it silently recreated.
 *
 * `defaultsInitializedAt` is set only after every required step for that
 * run succeeds; if any step throws, it stays null and the next call
 * (hook retry or app-shell entry) retries the whole thing.
 */
export async function initializeNewUser(userId: string): Promise<void> {
  const preference = await prisma.userPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  await ensureFavoriteTag(userId);
  await ensureOwnerTaster(userId);

  const isFirstRun = !preference.defaultsInitializedAt;

  if (isFirstRun) {
    for (const displayName of ORDINARY_DEFAULT_GROCERY_CATEGORIES) {
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
            position: ORDINARY_DEFAULT_GROCERY_CATEGORIES.indexOf(displayName),
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
  }

  // Runs after the ordinary categories above so a first-run fallback
  // category lands after them positionally; also repairs a missing
  // fallback on any later call regardless of isFirstRun.
  await ensureFallbackGroceryCategory(userId);

  if (isFirstRun) {
    await prisma.userPreference.update({
      where: { userId },
      data: { defaultsInitializedAt: new Date() },
    });
  }
}
