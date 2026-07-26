import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import { restoreDishSchema, type DishContentInput } from "@/lib/dishes/schema";
import { NotFoundError, ConflictError } from "@/lib/errors";

function content(overrides: Partial<DishContentInput> = {}): DishContentInput {
  return {
    title: "Ginger Soy Bowl",
    stage: "IDEA",
    cuisine: null,
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    sections: [
      {
        name: null,
        guidanceNote: null,
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
      },
    ],
    ...overrides,
  };
}

describe("dishes service", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  describe("createDish", () => {
    it("creates V1.0, sets Dish.currentVersionId, and mints lineageIds for every row", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });

      expect(dish.currentVersionId).not.toBeNull();
      expect(dish.currentVersion?.majorVersion).toBe(1);
      expect(dish.currentVersion?.minorVersion).toBe(0);
      expect(dish.currentTitle).toBe("Ginger Soy Bowl");

      const section = dish.currentVersion!.sections[0];
      expect(section.lineageId).toBeTruthy();
      expect(section.ingredients[0].lineageId).toBeTruthy();
    });

    it("rejects a Dish with no meaningful ingredient or instruction", async () => {
      const user = await createTestUser();
      userId = user.id;

      await expect(
        dishService.createDish(
          userId,
          "RECIPE",
          content({
            sections: [
              {
                name: null,
                guidanceNote: null,
                ingredients: [],
                instructions: [],
              },
            ],
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe("editDish", () => {
    it("bumps the minor version within the current major line and leaves sourceVersionId null", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
      });

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        content({ title: "Ginger Soy Bowl (updated)" }),
      );

      const updated = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
        include: { currentVersion: true },
      });

      expect(updated.currentVersion?.majorVersion).toBe(1);
      expect(updated.currentVersion?.minorVersion).toBe(1);
      expect(updated.currentVersion?.title).toBe("Ginger Soy Bowl (updated)");
      expect(updated.currentVersionId).not.toBe(dish.currentVersionId);
    });

    it("carries an existing row's lineageId forward and mints a fresh one for a newly-added row", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const originalSection = dish.currentVersion!.sections[0];
      const originalIngredient = originalSection.ingredients[0];

      await dishService.editDish(userId, dishId, dish.currentVersionId!, {
        ...content(),
        sections: [
          {
            lineageId: originalSection.lineageId,
            name: null,
            guidanceNote: null,
            ingredients: [
              {
                lineageId: originalIngredient.lineageId,
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
              {
                name: "Pepper",
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
          },
        ],
      });

      const updated = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const newIngredients = updated.currentVersion!.sections[0].ingredients;
      const salt = newIngredients.find((i) => i.name === "Salt")!;
      const pepper = newIngredients.find((i) => i.name === "Pepper")!;

      expect(salt.lineageId).toBe(originalIngredient.lineageId);
      expect(pepper.lineageId).not.toBe(originalIngredient.lineageId);
      expect(pepper.lineageId).toBeTruthy();
    });

    it("throws ConflictError when baseVersionId is stale", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
      });
      const staleVersionId = dish.currentVersionId!;

      // First edit moves currentVersionId forward...
      await dishService.editDish(userId, dishId, staleVersionId, content());

      // ...so retrying with the now-stale id must conflict.
      await expect(
        dishService.editDish(userId, dishId, staleVersionId, content()),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects cross-user edits with NotFoundError", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;

      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
      });

      await expect(
        dishService.editDish(
          intruder.id,
          dishId,
          dish.currentVersionId!,
          content(),
        ),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });

  describe("archive / restore", () => {
    it("archives without creating a new Version, then restores to a chosen Stage", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const before = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
      });

      await dishService.archiveDish(userId, dishId);
      const archived = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
      });
      expect(archived.stage).toBe("ARCHIVED");
      expect(archived.archivedAt).not.toBeNull();
      expect(archived.currentVersionId).toBe(before.currentVersionId);

      await dishService.restoreDish(userId, dishId, "ACTIVE");
      const restored = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
      });
      expect(restored.stage).toBe("ACTIVE");
      expect(restored.archivedAt).toBeNull();
      expect(restored.currentVersionId).toBe(before.currentVersionId);
    });

    it("rejects restoring to ARCHIVED at the schema layer, before it reaches the service", () => {
      const result = restoreDishSchema.safeParse({
        dishId: "some-id",
        stage: "ARCHIVED",
      });
      expect(result.success).toBe(false);
    });

    it("rejects cross-user archive/restore with NotFoundError", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;

      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );

      await expect(
        dishService.archiveDish(intruder.id, dishId),
      ).rejects.toThrow(NotFoundError);
      await expect(
        dishService.restoreDish(intruder.id, dishId, "ACTIVE"),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });

  describe("duplicateDish", () => {
    it("creates an independent Dish + V1.0 with fresh lineageIds and source snapshot fields", async () => {
      const user = await createTestUser();
      userId = user.id;

      const sourceId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ stage: "PROVEN" }),
      );
      const source = await prisma.dish.findUniqueOrThrow({
        where: { id: sourceId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });

      const copyId = await dishService.duplicateDish(
        userId,
        sourceId,
        undefined,
      );
      expect(copyId).not.toBe(sourceId);

      const copy = await prisma.dish.findUniqueOrThrow({
        where: { id: copyId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });

      expect(copy.currentTitle).toBe("Copy of Ginger Soy Bowl");
      expect(copy.stage).toBe("PROVEN");
      expect(copy.sourceKind).toBe("DUPLICATE");
      expect(copy.sourceDishId).toBe(sourceId);
      expect(copy.sourceDishVersionLabel).toBe("V1.0");
      expect(copy.sourceTitle).toBe("Ginger Soy Bowl");
      expect(copy.currentVersion?.majorVersion).toBe(1);
      expect(copy.currentVersion?.minorVersion).toBe(0);

      const sourceIngredient =
        source.currentVersion!.sections[0].ingredients[0];
      const copyIngredient = copy.currentVersion!.sections[0].ingredients[0];
      expect(copyIngredient.lineageId).not.toBe(sourceIngredient.lineageId);
    });

    it("rejects cross-user duplication with NotFoundError", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;

      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );

      await expect(
        dishService.duplicateDish(intruder.id, dishId, undefined),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });

  describe("deleteDish", () => {
    it("cascades the delete to Sections, Ingredients, and Instructions", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
      });
      const versionId = dish.currentVersionId!;

      await dishService.deleteDish(userId, dishId);

      expect(
        await prisma.dish.findUnique({ where: { id: dishId } }),
      ).toBeNull();
      expect(
        await prisma.section.findMany({ where: { dishVersionId: versionId } }),
      ).toHaveLength(0);
      expect(
        await prisma.ingredient.findMany({
          where: { dishVersionId: versionId },
        }),
      ).toHaveLength(0);
    });

    it("revokes ShareLinks and cancels PENDING DirectShares referencing the Dish before deleting it", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());

      const shareLink = await prisma.shareLink.create({
        data: {
          ownerId: userId,
          mode: "CURRENT",
          tokenId: randomUUID(),
          currentDishId: dishId,
          dishTitleSnapshot: "Ginger Soy Bowl",
        },
      });
      const directShare = await prisma.directShare.create({
        data: {
          senderId: userId,
          recipientLookup: "someone@example.invalid",
          dishId,
          dishVersionId: (
            await prisma.dish.findUniqueOrThrow({ where: { id: dishId } })
          ).currentVersionId,
          dishTitleSnapshot: "Ginger Soy Bowl",
          status: "PENDING",
        },
      });

      await dishService.deleteDish(userId, dishId);

      const reloadedShareLink = await prisma.shareLink.findUniqueOrThrow({
        where: { id: shareLink.id },
      });
      expect(reloadedShareLink.revokedAt).not.toBeNull();

      const reloadedDirectShare = await prisma.directShare.findUniqueOrThrow({
        where: { id: directShare.id },
      });
      expect(reloadedDirectShare.status).toBe("CANCELED");
    });

    it("rejects cross-user deletion with NotFoundError", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;

      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );

      await expect(dishService.deleteDish(intruder.id, dishId)).rejects.toThrow(
        NotFoundError,
      );

      await deleteTestUser(intruder.id);
    });
  });
});
