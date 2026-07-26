import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as tagService from "@/lib/tags/service";
import { ConflictError } from "@/lib/errors";

describe("tag service", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("seeds exactly one protected Favorite tag per user", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const favorites = await prisma.tag.findMany({
      where: { ownerId: userId, isFavorite: true },
    });
    expect(favorites).toHaveLength(1);
  });

  it("cannot rename the Favorite tag", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const favorite = await prisma.tag.findFirstOrThrow({
      where: { ownerId: userId, isFavorite: true },
    });

    await expect(
      tagService.renameTag(userId, favorite.id, "Not Favorite"),
    ).rejects.toThrow(ConflictError);
  });

  it("cannot delete the Favorite tag", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const favorite = await prisma.tag.findFirstOrThrow({
      where: { ownerId: userId, isFavorite: true },
    });

    await expect(tagService.deleteTag(userId, favorite.id)).rejects.toThrow(
      ConflictError,
    );
    expect(
      await prisma.tag.findUnique({ where: { id: favorite.id } }),
    ).not.toBeNull();
  });

  it("rejects a direct database insert of a second Favorite tag (partial unique index)", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    await expect(
      prisma.tag.create({
        data: {
          ownerId: userId,
          normalizedName: "another favorite",
          displayName: "Another Favorite",
          isFavorite: true,
        },
      }),
    ).rejects.toThrow();
  });

  it("creating a tag with a name differing only by case/whitespace returns the existing tag", async () => {
    const user = await createTestUser();
    userId = user.id;

    const first = await tagService.createTag(userId, "Weeknight");
    const second = await tagService.createTag(userId, "  weeknight  ");

    expect(second.id).toBe(first.id);
    expect(
      await prisma.tag.count({
        where: { ownerId: userId, normalizedName: "weeknight" },
      }),
    ).toBe(1);
  });

  it("renaming a tag to an existing tag's name merges them", async () => {
    const user = await createTestUser();
    userId = user.id;

    const chicken = await tagService.createTag(userId, "Chicken");
    const poultry = await tagService.createTag(userId, "Poultry");

    // Reuses the schema's own Dish/DishVersion minimum-viable rows purely as
    // a merge target — Slice 3's editor doesn't exist yet, so this test
    // constructs the smallest possible tagged Dish directly.
    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "RECIPE" },
    });
    await prisma.dishTag.create({
      data: { dishId: dish.id, tagId: poultry.id },
    });

    const merged = await tagService.renameTag(userId, poultry.id, "Chicken");
    expect(merged.id).toBe(chicken.id);

    expect(
      await prisma.tag.findUnique({ where: { id: poultry.id } }),
    ).toBeNull();
    const links = await prisma.dishTag.findMany({ where: { dishId: dish.id } });
    expect(links.map((l) => l.tagId)).toEqual([chicken.id]);
  });
});
