import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as cuisineService from "@/lib/cuisines/service";
import { NotFoundError, ConflictError } from "@/lib/errors";

// PRODUCT_SPEC.md §46 (owner decision, 2026-09-02): Cuisine is a normalized,
// user-owned classification — same shape/behavior as Flavor profile — a
// Recipe/Part may carry zero, one, or several via DishCuisine.
describe("cuisine service", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("is idempotent by identity — creating an already-existing name returns the same row", async () => {
    const user = await createTestUser();
    userId = user.id;

    const first = await cuisineService.createCuisine(userId, "Vietnamese");
    const second = await cuisineService.createCuisine(userId, "  vietnamese ");
    expect(second.id).toBe(first.id);

    const count = await prisma.cuisine.count({
      where: { ownerId: userId, normalizedName: "vietnamese" },
    });
    expect(count).toBe(1);
  });

  it("assigns new Cuisines an increasing position, in creation order", async () => {
    const user = await createTestUser();
    userId = user.id;

    const thai = await cuisineService.createCuisine(userId, "Thai");
    const korean = await cuisineService.createCuisine(userId, "Korean");
    expect(korean.position).toBe(thai.position + 1);
  });

  it("renaming to a new, unused name simply renames in place", async () => {
    const user = await createTestUser();
    userId = user.id;

    const cuisine = await cuisineService.createCuisine(userId, "Tex-Mex");
    const renamed = await cuisineService.renameCuisine(
      userId,
      cuisine.id,
      "Tex Mex",
    );
    expect(renamed.id).toBe(cuisine.id);
    expect(renamed.displayName).toBe("Tex Mex");
  });

  it("renaming to an existing Cuisine merges every Dish onto the destination and removes the source", async () => {
    const user = await createTestUser();
    userId = user.id;

    const source = await cuisineService.createCuisine(userId, "Korean");
    const destination = await cuisineService.createCuisine(
      userId,
      "Korean-American",
    );

    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "RECIPE", currentTitle: "Bulgogi" },
    });
    await prisma.dishCuisine.create({
      data: { dishId: dish.id, cuisineId: source.id },
    });

    const result = await cuisineService.renameCuisine(
      userId,
      source.id,
      "Korean-American",
    );
    expect(result.id).toBe(destination.id);

    expect(
      await prisma.cuisine.findUnique({ where: { id: source.id } }),
    ).toBeNull();
    const link = await prisma.dishCuisine.findUnique({
      where: {
        dishId_cuisineId: { dishId: dish.id, cuisineId: destination.id },
      },
    });
    expect(link).not.toBeNull();
  });

  it("deleting a Cuisine removes it from every Dish without deleting those Dishes", async () => {
    const user = await createTestUser();
    userId = user.id;

    const cuisine = await cuisineService.createCuisine(userId, "Fusion");
    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "PART", currentTitle: "Kimchi Slaw" },
    });
    await prisma.dishCuisine.create({
      data: { dishId: dish.id, cuisineId: cuisine.id },
    });

    await cuisineService.deleteCuisine(userId, cuisine.id);

    expect(
      await prisma.cuisine.findUnique({ where: { id: cuisine.id } }),
    ).toBeNull();
    expect(
      await prisma.dish.findUnique({ where: { id: dish.id } }),
    ).not.toBeNull();
  });

  it("allows a Dish to carry several Cuisines at once", async () => {
    const user = await createTestUser();
    userId = user.id;

    const nikkei = await cuisineService.createCuisine(userId, "Nikkei");
    const peruvian = await cuisineService.createCuisine(userId, "Peruvian");
    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "RECIPE", currentTitle: "Tiradito" },
    });
    await prisma.dishCuisine.createMany({
      data: [
        { dishId: dish.id, cuisineId: nikkei.id },
        { dishId: dish.id, cuisineId: peruvian.id },
      ],
    });

    const links = await prisma.dishCuisine.findMany({
      where: { dishId: dish.id },
    });
    expect(links.map((l) => l.cuisineId).sort()).toEqual(
      [nikkei.id, peruvian.id].sort(),
    );
  });

  it("scopes Cuisines to their owner — another user cannot rename or delete them", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;

    const cuisine = await cuisineService.createCuisine(owner.id, "Cuban");

    await expect(
      cuisineService.renameCuisine(intruder.id, cuisine.id, "Hacked"),
    ).rejects.toThrow(NotFoundError);
    await expect(
      cuisineService.deleteCuisine(intruder.id, cuisine.id),
    ).rejects.toThrow(NotFoundError);

    await deleteTestUser(intruder.id);
  });

  it("reorders Cuisines and persists the new positions", async () => {
    const user = await createTestUser();
    userId = user.id;

    const a = await cuisineService.createCuisine(userId, "Mediterranean");
    const b = await cuisineService.createCuisine(userId, "Cuban");

    await cuisineService.reorderCuisines(userId, [b.id, a.id]);

    const reloaded = await prisma.cuisine.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    expect(reloaded.map((c) => c.id)).toEqual([b.id, a.id]);
  });

  it("rejects a reorder that omits a currently owned Cuisine or includes a foreign one", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;

    const a = await cuisineService.createCuisine(owner.id, "Mediterranean");
    await cuisineService.createCuisine(owner.id, "Cuban");
    const foreign = await cuisineService.createCuisine(intruder.id, "Foreign");

    await expect(
      cuisineService.reorderCuisines(owner.id, [a.id]),
    ).rejects.toThrow(ConflictError);
    await expect(
      cuisineService.reorderCuisines(owner.id, [a.id, foreign.id]),
    ).rejects.toThrow(ConflictError);

    await deleteTestUser(intruder.id);
  });
});
