import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as groceryService from "@/lib/grocery/service";
import { NotFoundError } from "@/lib/errors";
import { DEFAULT_GROCERY_CATEGORIES } from "@/lib/account/defaults";

describe("grocery category service", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("seeds the default categories for a new user", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const categories = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    expect(categories.map((c) => c.displayName)).toEqual([
      ...DEFAULT_GROCERY_CATEGORIES,
    ]);
  });

  it("scopes categories to their owner — another user cannot see or mutate them", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;

    const category = await groceryService.createGroceryCategory(
      owner.id,
      "Spices",
    );

    await expect(
      groceryService.renameGroceryCategory(intruder.id, category.id, "Hacked"),
    ).rejects.toThrow(NotFoundError);
    await expect(
      groceryService.deleteGroceryCategory(intruder.id, category.id),
    ).rejects.toThrow(NotFoundError);

    await deleteTestUser(intruder.id);
  });

  it("deleting a category reassigns its items to the uncategorized (Other) bucket rather than orphaning them", async () => {
    const user = await createTestUser();
    userId = user.id;

    const category = await groceryService.createGroceryCategory(
      userId,
      "Spices",
    );

    const list = await prisma.groceryList.create({
      data: { ownerId: userId, title: "Test list" },
    });
    const item = await prisma.groceryListItem.create({
      data: {
        groceryListId: list.id,
        categoryId: category.id,
        name: "Cumin",
        position: 0,
      },
    });

    await groceryService.deleteGroceryCategory(userId, category.id);

    const reloaded = await prisma.groceryListItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(reloaded.categoryId).toBeNull();
  });

  it("reorders categories and persists the new positions", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const categories = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    const reversedIds = [...categories].reverse().map((c) => c.id);

    await groceryService.reorderGroceryCategories(userId, reversedIds);

    const reloaded = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    expect(reloaded.map((c) => c.id)).toEqual(reversedIds);
  });
});
