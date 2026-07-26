import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import {
  DEFAULT_GROCERY_CATEGORIES,
  STARTER_FLAVOR_PROFILES,
} from "@/lib/account/defaults";

describe("initializeNewUser", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("seeds preferences, the Favorite tag, the owner Taster, default categories, and starter Flavor profiles", async () => {
    const user = await createTestUser();
    userId = user.id;

    await initializeNewUser(userId);

    const preference = await prisma.userPreference.findUnique({
      where: { userId },
    });
    expect(preference).not.toBeNull();

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
    });
    expect(categories).toHaveLength(DEFAULT_GROCERY_CATEGORIES.length);

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

    const flavorProfiles = await prisma.flavorProfileValue.findMany({
      where: { ownerId: userId },
    });
    expect(flavorProfiles).toHaveLength(STARTER_FLAVOR_PROFILES.length);
  });

  it("running it concurrently still leaves exactly one owner Taster (database-enforced)", async () => {
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
