import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as groceryService from "@/lib/grocery/service";
import { NotFoundError, ConflictError } from "@/lib/errors";
import {
  DEFAULT_GROCERY_CATEGORIES,
  FALLBACK_GROCERY_CATEGORY_NAME,
} from "@/lib/account/defaults";

describe("grocery category service", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("seeds the default categories (incl. the fallback) for a new user", async () => {
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

  it("rejects a reorder that omits a currently owned category", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const before = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    // Omits the last category entirely.
    const partialIds = before.slice(0, -1).map((c) => c.id);

    await expect(
      groceryService.reorderGroceryCategories(userId, partialIds),
    ).rejects.toThrow(ConflictError);

    // Nothing was silently partially applied — positions are unchanged.
    const after = await prisma.groceryCategory.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    expect(after.map((c) => ({ id: c.id, position: c.position }))).toEqual(
      before.map((c) => ({ id: c.id, position: c.position })),
    );
  });

  it("rejects a reorder with an id owned by another user", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;
    await initializeNewUser(owner.id);
    await initializeNewUser(intruder.id);

    const ownerCategories = await prisma.groceryCategory.findMany({
      where: { ownerId: owner.id },
    });
    const intruderCategory = await prisma.groceryCategory.findFirstOrThrow({
      where: { ownerId: intruder.id },
    });

    await expect(
      groceryService.reorderGroceryCategories(owner.id, [
        intruderCategory.id,
        ...ownerCategories.slice(1).map((c) => c.id),
      ]),
    ).rejects.toThrow(ConflictError);

    await deleteTestUser(intruder.id);
  });

  describe("fallback category invariants", () => {
    it("has exactly one fallback per owner after initialization", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const fallbacks = await prisma.groceryCategory.findMany({
        where: { ownerId: userId, isFallback: true },
      });
      expect(fallbacks).toHaveLength(1);
      expect(fallbacks[0].displayName).toBe(FALLBACK_GROCERY_CATEGORY_NAME);
    });

    it("rejects a direct database insert of a second fallback category (partial unique index)", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      await expect(
        prisma.groceryCategory.create({
          data: {
            ownerId: userId,
            normalizedName: "duplicate fallback",
            displayName: "Duplicate Fallback",
            position: 99,
            isFallback: true,
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects deleting the fallback category", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const fallback = await prisma.groceryCategory.findFirstOrThrow({
        where: { ownerId: userId, isFallback: true },
      });

      await expect(
        groceryService.deleteGroceryCategory(userId, fallback.id),
      ).rejects.toThrow(ConflictError);

      expect(
        await prisma.groceryCategory.findUnique({
          where: { id: fallback.id },
        }),
      ).not.toBeNull();
    });

    it("allows renaming and reordering the fallback category, and it remains the fallback", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const fallback = await prisma.groceryCategory.findFirstOrThrow({
        where: { ownerId: userId, isFallback: true },
      });

      const renamed = await groceryService.renameGroceryCategory(
        userId,
        fallback.id,
        "Miscellaneous",
      );
      expect(renamed.displayName).toBe("Miscellaneous");
      expect(renamed.isFallback).toBe(true);

      const categories = await prisma.groceryCategory.findMany({
        where: { ownerId: userId },
        orderBy: { position: "asc" },
      });
      const reversedIds = [...categories].reverse().map((c) => c.id);
      await groceryService.reorderGroceryCategories(userId, reversedIds);

      const stillFallback = await prisma.groceryCategory.findUniqueOrThrow({
        where: { id: fallback.id },
      });
      expect(stillFallback.isFallback).toBe(true);
      expect(stillFallback.displayName).toBe("Miscellaneous");
    });

    it("deleting an ordinary category moves its GroceryListItems to the fallback and removes category-memory rows", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const fallback = await prisma.groceryCategory.findFirstOrThrow({
        where: { ownerId: userId, isFallback: true },
      });
      const spices = await groceryService.createGroceryCategory(
        userId,
        "Spices",
      );

      const list = await prisma.groceryList.create({
        data: { ownerId: userId, title: "Test list", plannedDate: new Date() },
      });
      const item = await prisma.groceryListItem.create({
        data: {
          groceryListId: list.id,
          categoryId: spices.id,
          name: "Cumin",
          position: 0,
        },
      });
      const memory = await prisma.ingredientCategoryMemory.create({
        data: {
          ownerId: userId,
          normalizedIngredientName: "cumin",
          groceryCategoryId: spices.id,
        },
      });

      await groceryService.deleteGroceryCategory(userId, spices.id);

      const reloadedItem = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(reloadedItem.categoryId).toBe(fallback.id);

      expect(
        await prisma.ingredientCategoryMemory.findUnique({
          where: { id: memory.id },
        }),
      ).toBeNull();
    });

    it("one user cannot mutate another user's fallback category", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;
      await initializeNewUser(owner.id);

      const fallback = await prisma.groceryCategory.findFirstOrThrow({
        where: { ownerId: owner.id, isFallback: true },
      });

      await expect(
        groceryService.renameGroceryCategory(
          intruder.id,
          fallback.id,
          "Hacked",
        ),
      ).rejects.toThrow(NotFoundError);
      await expect(
        groceryService.deleteGroceryCategory(intruder.id, fallback.id),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });
});
