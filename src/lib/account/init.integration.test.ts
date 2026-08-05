import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import {
  DEFAULT_GROCERY_CATEGORIES,
  FALLBACK_GROCERY_CATEGORY_NAME,
  STARTER_FLAVOR_PROFILES,
} from "@/lib/account/defaults";
import * as dishService from "@/lib/dishes/service";
import { sendDirectShareCollection } from "@/lib/sharing/collections";
import type { DishContentInput } from "@/lib/dishes/schema";

function minimalRecipeContent(title: string): DishContentInput {
  return {
    title,
    stage: "IDEA",
    cuisine: null,
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      {
        name: null,
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            name: "Salt",
            quantity: null,
            quantityEnd: null,
            isApproximate: false,
            unit: null,
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [],
        partLinks: [],
      },
    ],
    partLinks: [],
  };
}

describe("initializeNewUser", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
    vi.restoreAllMocks();
  });

  it("seeds preferences, the Favorite tag, the owner Taster, default categories (incl. the fallback), and starter Flavor profiles", async () => {
    const user = await createTestUser();
    userId = user.id;

    await initializeNewUser(userId);

    const preference = await prisma.userPreference.findUnique({
      where: { userId },
    });
    expect(preference).not.toBeNull();
    expect(preference?.defaultsInitializedAt).not.toBeNull();

    const favoriteTags = await prisma.tag.findMany({
      where: { ownerId: userId, isFavorite: true },
    });
    expect(favoriteTags).toHaveLength(1);
    expect(favoriteTags[0].displayName).toBe("Favorite");

    const ownerTasters = await prisma.taster.findMany({
      where: { ownerId: userId, isOwner: true },
    });
    expect(ownerTasters).toHaveLength(1);
    expect(ownerTasters[0].name).toBe("You");

    const categories = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    expect(categories).toHaveLength(DEFAULT_GROCERY_CATEGORIES.length);
    expect(categories.map((c) => c.displayName)).toEqual([
      ...DEFAULT_GROCERY_CATEGORIES,
    ]);

    const fallbacks = categories.filter((c) => c.isFallback);
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0].displayName).toBe(FALLBACK_GROCERY_CATEGORY_NAME);

    const flavorProfiles = await prisma.flavorProfileValue.findMany({
      where: { ownerId: userId },
    });
    expect(flavorProfiles).toHaveLength(STARTER_FLAVOR_PROFILES.length);
  });

  it("is idempotent — running it twice creates no duplicates", async () => {
    const user = await createTestUser();
    userId = user.id;

    await initializeNewUser(userId);
    await initializeNewUser(userId);
    await initializeNewUser(userId);

    const preferences = await prisma.userPreference.findMany({
      where: { userId },
    });
    expect(preferences).toHaveLength(1);

    const favoriteTags = await prisma.tag.findMany({
      where: { ownerId: userId, isFavorite: true },
    });
    expect(favoriteTags).toHaveLength(1);

    const ownerTasters = await prisma.taster.findMany({
      where: { ownerId: userId, isOwner: true },
    });
    expect(ownerTasters).toHaveLength(1);

    const categories = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
    });
    expect(categories).toHaveLength(DEFAULT_GROCERY_CATEGORIES.length);
    expect(categories.filter((c) => c.isFallback)).toHaveLength(1);

    const flavorProfiles = await prisma.flavorProfileValue.findMany({
      where: { ownerId: userId },
    });
    expect(flavorProfiles).toHaveLength(STARTER_FLAVOR_PROFILES.length);
  });

  it("running it concurrently still leaves exactly one owner Taster and one fallback category (database-enforced)", async () => {
    const user = await createTestUser();
    userId = user.id;

    await Promise.all([
      initializeNewUser(userId),
      initializeNewUser(userId),
      initializeNewUser(userId),
    ]);

    const ownerTasters = await prisma.taster.findMany({
      where: { ownerId: userId, isOwner: true },
    });
    expect(ownerTasters).toHaveLength(1);

    const fallbacks = await prisma.groceryCategory.findMany({
      where: { ownerId: userId, isFallback: true },
    });
    expect(fallbacks).toHaveLength(1);

    const preferences = await prisma.userPreference.findMany({
      where: { userId },
    });
    expect(preferences).toHaveLength(1);
    expect(preferences[0].defaultsInitializedAt).not.toBeNull();
  });

  it("leaves defaultsInitializedAt unset when a step fails partway through", async () => {
    const user = await createTestUser();
    userId = user.id;

    const spy = vi
      .spyOn(prisma.taster, "findFirst")
      .mockRejectedValueOnce(new Error("simulated failure"));

    await expect(initializeNewUser(userId)).rejects.toThrow(
      "simulated failure",
    );
    spy.mockRestore();

    const preference = await prisma.userPreference.findUnique({
      where: { userId },
    });
    // The preference row itself is created (an earlier, unconditional step),
    // but the completion marker must not be set since a later step threw.
    expect(preference).not.toBeNull();
    expect(preference?.defaultsInitializedAt).toBeNull();

    // Ordinary one-time seed data gated on defaultsInitializedAt must not
    // have been created yet either, since the failure happened before that
    // step ran.
    const categories = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
    });
    expect(categories).toHaveLength(0);
  });

  it("retries and fills in missing data on the next call after a partial failure, then sets the marker", async () => {
    const user = await createTestUser();
    userId = user.id;

    const spy = vi
      .spyOn(prisma.groceryCategory, "aggregate")
      .mockRejectedValueOnce(new Error("simulated failure"));

    await expect(initializeNewUser(userId)).rejects.toThrow(
      "simulated failure",
    );
    spy.mockRestore();

    // The first call got all the way through the ordinary one-time seed
    // step (it runs before ensureFallbackGroceryCategory) before failing
    // inside that function's position lookup — so the ordinary categories
    // exist, but the fallback and the completion marker do not yet.
    const afterFailure = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
    });
    expect(afterFailure).toHaveLength(DEFAULT_GROCERY_CATEGORIES.length - 1);
    expect(afterFailure.some((c) => c.isFallback)).toBe(false);
    expect(
      (await prisma.userPreference.findUniqueOrThrow({ where: { userId } }))
        .defaultsInitializedAt,
    ).toBeNull();

    await initializeNewUser(userId);

    const preference = await prisma.userPreference.findUniqueOrThrow({
      where: { userId },
    });
    expect(preference.defaultsInitializedAt).not.toBeNull();

    const categories = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
    });
    expect(categories).toHaveLength(DEFAULT_GROCERY_CATEGORIES.length);
    expect(categories.filter((c) => c.isFallback)).toHaveLength(1);
  });

  it("does not recreate an ordinary default a user intentionally deleted after completion", async () => {
    const user = await createTestUser();
    userId = user.id;

    await initializeNewUser(userId);

    const spices = await prisma.groceryCategory.findFirstOrThrow({
      where: { ownerId: userId, normalizedName: "bakery" },
    });
    await prisma.groceryCategory.delete({ where: { id: spices.id } });

    // Re-running (e.g., a repeat app-shell-entry retry, or a second sign-in
    // hook invocation) must not resurrect the intentionally deleted category
    // now that defaultsInitializedAt is already set.
    await initializeNewUser(userId);

    const bakery = await prisma.groceryCategory.findFirst({
      where: { ownerId: userId, normalizedName: "bakery" },
    });
    expect(bakery).toBeNull();

    // Protected singletons are still repaired regardless.
    const fallbacks = await prisma.groceryCategory.findMany({
      where: { ownerId: userId, isFallback: true },
    });
    expect(fallbacks).toHaveLength(1);
  });

  it("Slice 22: claims a pending direct-share collection addressed to this account's verified email as part of ordinary initialization", async () => {
    const sender = await createTestUser();
    const claimEmail = `init-claim-${Date.now()}@example.invalid`;
    const dishId = await dishService.createDish(
      sender.id,
      "RECIPE",
      minimalRecipeContent("Init Claim Target"),
    );
    const { collectionId } = await sendDirectShareCollection(sender.id, {
      recipientEmail: claimEmail,
      dishIds: [dishId],
      note: null,
    });

    const user = await createTestUser({ email: claimEmail });
    userId = user.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    await initializeNewUser(user.id);

    const collection = await prisma.directShareCollection.findUniqueOrThrow({
      where: { id: collectionId },
    });
    expect(collection.recipientId).toBe(user.id);

    await deleteTestUser(sender.id);
  });

  it("deleting the account cascades preferences, tags, tasters, and grocery categories", async () => {
    const user = await createTestUser();
    const id = user.id;
    await initializeNewUser(id);

    await deleteTestUser(id);

    expect(
      await prisma.userPreference.findUnique({ where: { userId: id } }),
    ).toBeNull();
    expect(await prisma.tag.findMany({ where: { ownerId: id } })).toHaveLength(
      0,
    );
    expect(
      await prisma.taster.findMany({ where: { ownerId: id } }),
    ).toHaveLength(0);
    expect(
      await prisma.groceryCategory.findMany({ where: { ownerId: id } }),
    ).toHaveLength(0);
    expect(
      await prisma.flavorProfileValue.findMany({ where: { ownerId: id } }),
    ).toHaveLength(0);
  });
});
