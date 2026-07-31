import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as flavorProfileService from "@/lib/flavor-profiles/service";
import { NotFoundError, ConflictError } from "@/lib/errors";

describe("flavor profile service", () => {
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

    const first = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Smoky",
    );
    const second = await flavorProfileService.createFlavorProfileValue(
      userId,
      "  smoky ",
    );
    expect(second.id).toBe(first.id);

    const count = await prisma.flavorProfileValue.count({
      where: { ownerId: userId, normalizedName: "smoky" },
    });
    expect(count).toBe(1);
  });

  it("assigns new values an increasing position, in creation order", async () => {
    const user = await createTestUser();
    userId = user.id;

    const sweet = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Sweet",
    );
    const tangy = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Tangy",
    );
    expect(tangy.position).toBe(sweet.position + 1);
  });

  it("renaming to a new, unused name simply renames in place", async () => {
    const user = await createTestUser();
    userId = user.id;

    const value = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Zesty",
    );
    const renamed = await flavorProfileService.renameFlavorProfileValue(
      userId,
      value.id,
      "Zingy",
    );
    expect(renamed.id).toBe(value.id);
    expect(renamed.displayName).toBe("Zingy");
  });

  it("renaming to an existing value merges every Dish onto the destination and removes the source", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const source = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Hot",
    );
    const destination = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Spicy",
    );

    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "RECIPE", currentTitle: "Curry" },
    });
    await prisma.dishFlavorProfile.create({
      data: { dishId: dish.id, flavorProfileValueId: source.id },
    });

    const result = await flavorProfileService.renameFlavorProfileValue(
      userId,
      source.id,
      "Spicy",
    );
    expect(result.id).toBe(destination.id);

    expect(
      await prisma.flavorProfileValue.findUnique({ where: { id: source.id } }),
    ).toBeNull();
    const link = await prisma.dishFlavorProfile.findUnique({
      where: {
        dishId_flavorProfileValueId: {
          dishId: dish.id,
          flavorProfileValueId: destination.id,
        },
      },
    });
    expect(link).not.toBeNull();
  });

  it("deleting a value removes it from every Dish without deleting those Dishes", async () => {
    const user = await createTestUser();
    userId = user.id;

    const value = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Umami",
    );
    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "PART", currentTitle: "Miso Paste" },
    });
    await prisma.dishFlavorProfile.create({
      data: { dishId: dish.id, flavorProfileValueId: value.id },
    });

    await flavorProfileService.deleteFlavorProfileValue(userId, value.id);

    expect(
      await prisma.flavorProfileValue.findUnique({ where: { id: value.id } }),
    ).toBeNull();
    expect(
      await prisma.dish.findUnique({ where: { id: dish.id } }),
    ).not.toBeNull();
  });

  it("scopes Flavor profiles to their owner — another user cannot rename or delete them", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;

    const value = await flavorProfileService.createFlavorProfileValue(
      owner.id,
      "Rich",
    );

    await expect(
      flavorProfileService.renameFlavorProfileValue(
        intruder.id,
        value.id,
        "Hacked",
      ),
    ).rejects.toThrow(NotFoundError);
    await expect(
      flavorProfileService.deleteFlavorProfileValue(intruder.id, value.id),
    ).rejects.toThrow(NotFoundError);

    await deleteTestUser(intruder.id);
  });

  it("reorders values and persists the new positions", async () => {
    const user = await createTestUser();
    userId = user.id;

    const a = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Fresh",
    );
    const b = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Rich",
    );

    await flavorProfileService.reorderFlavorProfileValues(userId, [b.id, a.id]);

    const reloaded = await prisma.flavorProfileValue.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    expect(reloaded.map((v) => v.id)).toEqual([b.id, a.id]);
  });

  it("rejects a reorder that omits a currently owned value or includes a foreign one", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;

    const a = await flavorProfileService.createFlavorProfileValue(
      owner.id,
      "Fresh",
    );
    await flavorProfileService.createFlavorProfileValue(owner.id, "Rich");
    const foreign = await flavorProfileService.createFlavorProfileValue(
      intruder.id,
      "Foreign",
    );

    await expect(
      flavorProfileService.reorderFlavorProfileValues(owner.id, [a.id]),
    ).rejects.toThrow(ConflictError);
    await expect(
      flavorProfileService.reorderFlavorProfileValues(owner.id, [
        a.id,
        foreign.id,
      ]),
    ).rejects.toThrow(ConflictError);

    await deleteTestUser(intruder.id);
  });
});
