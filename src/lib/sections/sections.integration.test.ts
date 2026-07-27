import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import * as sectionsService from "@/lib/sections/service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Slice 6 pre-gate scope (Build Plan Review Gate 3): attach validation,
 * detach content resolution, and "create a Part from local content"
 * (§69). Propagation and deletion materialization are not implemented or
 * tested here — they're held for the gate.
 */

function partContent(title: string): DishContentInput {
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

function recipeContentWithMarinadeSection(): DishContentInput {
  return {
    title: "Lemongrass Chicken",
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
        name: "Marinade",
        guidanceNote: null,
        ingredients: [
          {
            name: "Fish sauce",
            quantity: 2,
            quantityEnd: null,
            isApproximate: false,
            unit: "tbsp",
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [{ text: "Whisk the marinade together." }],
        partLinks: [],
      },
    ],
    partLinks: [],
  };
}

async function currentVersionId(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  if (!dish.currentVersionId) throw new Error("Expected a current Version.");
  return dish.currentVersionId;
}

describe("sections service", () => {
  let userId: string | undefined;
  let otherUserId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
    if (otherUserId) {
      await deleteTestUser(otherUserId);
      otherUserId = undefined;
    }
  });

  describe("validatePartAttachment", () => {
    it("resolves the target Part's current Version by default (§68.1)", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await dishService.createDish(
        userId,
        "PART",
        partContent("Nuoc Cham"),
      );
      const versionId = await currentVersionId(partDishId);

      const result = await sectionsService.validatePartAttachment(
        userId,
        { dishId: null, kind: "RECIPE" },
        partDishId,
        undefined,
      );

      expect(result.targetDish.id).toBe(partDishId);
      expect(result.targetDish.currentTitle).toBe("Nuoc Cham");
      expect(result.targetVersion.id).toBe(versionId);
    });

    it("allows deliberately choosing a historical Version (§68.1)", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await dishService.createDish(
        userId,
        "PART",
        partContent("Nuoc Cham"),
      );
      const v1Id = await currentVersionId(partDishId);
      await dishService.editDish(
        userId,
        partDishId,
        v1Id,
        partContent("Nuoc Cham"),
        "MAJOR",
        "PART",
      );

      const result = await sectionsService.validatePartAttachment(
        userId,
        { dishId: null, kind: "RECIPE" },
        partDishId,
        v1Id,
      );
      expect(result.targetVersion.id).toBe(v1Id);
    });

    it("rejects a Part attaching to itself directly (§67.3)", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await dishService.createDish(
        userId,
        "PART",
        partContent("Toasted Almonds"),
      );

      await expect(
        sectionsService.validatePartAttachment(
          userId,
          { dishId: partDishId, kind: "PART" },
          partDishId,
          undefined,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects an indirect cycle (Part A already contains Part B; attaching A into B is rejected, §67.3)", async () => {
      const user = await createTestUser();
      userId = user.id;

      const partBId = await dishService.createDish(
        userId,
        "PART",
        partContent("Part B"),
      );
      const partAId = await dishService.createDish(
        userId,
        "PART",
        partContent("Part A"),
      );
      const partBVersionId = await currentVersionId(partBId);

      // Part A now contains Part B (a real, saved PartLink).
      const partAV1 = await currentVersionId(partAId);
      await dishService.editDish(
        userId,
        partAId,
        partAV1,
        {
          ...partContent("Part A"),
          partLinks: [
            { targetDishId: partBId, targetDishVersionId: partBVersionId },
          ],
        },
        "MINOR",
        "PART",
      );

      // Attaching Part A into Part B would make B contain A contain B.
      await expect(
        sectionsService.validatePartAttachment(
          userId,
          { dishId: partBId, kind: "PART" },
          partAId,
          undefined,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a Part the caller does not own", async () => {
      const user = await createTestUser();
      userId = user.id;
      const other = await createTestUser();
      otherUserId = other.id;

      const otherPartId = await dishService.createDish(
        otherUserId,
        "PART",
        partContent("Someone else's Part"),
      );

      await expect(
        sectionsService.validatePartAttachment(
          userId,
          { dishId: null, kind: "RECIPE" },
          otherPartId,
          undefined,
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("resolvePartVersionForDetach", () => {
    it("returns the target Version's own content with lineage stripped (§70.1)", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await dishService.createDish(
        userId,
        "PART",
        partContent("White Rice"),
      );
      const versionId = await currentVersionId(partDishId);

      const content = await sectionsService.resolvePartVersionForDetach(
        userId,
        versionId,
      );

      expect(content.sections).toHaveLength(1);
      expect(content.sections[0].ingredients).toHaveLength(1);
      expect(content.sections[0].ingredients[0].name).toBe("Salt");
      expect(content.sections[0].lineageId).toBeUndefined();
      expect(content.sections[0].ingredients[0].lineageId).toBeUndefined();
    });

    it("rejects a Version the caller does not own", async () => {
      const user = await createTestUser();
      userId = user.id;
      const other = await createTestUser();
      otherUserId = other.id;

      const otherPartId = await dishService.createDish(
        otherUserId,
        "PART",
        partContent("Someone else's Part"),
      );
      const otherVersionId = await currentVersionId(otherPartId);

      await expect(
        sectionsService.resolvePartVersionForDetach(userId, otherVersionId),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("promoteLocalContentToPart (§69.2 — create and link)", () => {
    it("creates a new Part from the Section, replaces it with a top-level link, and preserves the prior Version unchanged", async () => {
      const user = await createTestUser();
      userId = user.id;
      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        recipeContentWithMarinadeSection(),
      );
      const v1Id = await currentVersionId(recipeId);
      const v1 = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: v1Id },
        include: { sections: true },
      });
      const marinadeLineageId = v1.sections[0].lineageId;

      const result = await sectionsService.promoteLocalContentToPart(
        userId,
        recipeId,
        "RECIPE",
        v1Id,
        marinadeLineageId,
        "Marinade",
      );

      const newPart = await prisma.dish.findUniqueOrThrow({
        where: { id: result.newPartDishId },
      });
      expect(newPart.kind).toBe("PART");
      expect(newPart.currentTitle).toBe("Marinade");

      const recipe = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
        include: {
          currentVersion: {
            include: { sections: true, partLinks: true },
          },
        },
      });
      // The prior Version (V1.0) still exists, untouched, with its Section
      // intact — §69.2's "preserve the prior Recipe Version unchanged."
      const priorVersion = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: v1Id },
        include: { sections: true },
      });
      expect(priorVersion.sections).toHaveLength(1);

      // The new current Version has no local Sections left (the only
      // Section was extracted) and one live top-level link to the new Part.
      expect(recipe.currentVersion?.sections).toHaveLength(0);
      expect(recipe.currentVersion?.partLinks).toHaveLength(1);
      expect(recipe.currentVersion?.partLinks[0].targetDishId).toBe(
        result.newPartDishId,
      );
      expect(recipe.currentVersion?.majorVersion).toBe(1);
      expect(recipe.currentVersion?.minorVersion).toBe(1);
    });

    it("rejects a Section with no meaningful content", async () => {
      const user = await createTestUser();
      userId = user.id;
      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        recipeContentWithMarinadeSection(),
      );
      const v1Id = await currentVersionId(recipeId);

      await expect(
        sectionsService.promoteLocalContentToPart(
          userId,
          recipeId,
          "RECIPE",
          v1Id,
          "not-a-real-section-lineage-id",
          "Marinade",
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects a container the caller does not own", async () => {
      const user = await createTestUser();
      userId = user.id;
      const other = await createTestUser();
      otherUserId = other.id;

      const otherRecipeId = await dishService.createDish(
        otherUserId,
        "RECIPE",
        recipeContentWithMarinadeSection(),
      );
      const otherV1Id = await currentVersionId(otherRecipeId);
      const otherV1 = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: otherV1Id },
        include: { sections: true },
      });

      await expect(
        sectionsService.promoteLocalContentToPart(
          userId,
          otherRecipeId,
          "RECIPE",
          otherV1Id,
          otherV1.sections[0].lineageId,
          "Marinade",
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("saveContentAsNewPart (§69.3 — save a copy)", () => {
    it("creates a new Part and leaves the source Recipe's Version history untouched", async () => {
      const user = await createTestUser();
      userId = user.id;
      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        recipeContentWithMarinadeSection(),
      );
      const v1Id = await currentVersionId(recipeId);
      const v1 = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: v1Id },
        include: { sections: true },
      });

      const versionCountBefore = await prisma.dishVersion.count({
        where: { dishId: recipeId },
      });

      const result = await sectionsService.saveContentAsNewPart(
        userId,
        recipeId,
        "RECIPE",
        v1Id,
        v1.sections[0].lineageId,
        "Marinade",
      );

      const newPart = await prisma.dish.findUniqueOrThrow({
        where: { id: result.newPartDishId },
      });
      expect(newPart.kind).toBe("PART");
      expect(newPart.currentTitle).toBe("Marinade");

      const versionCountAfter = await prisma.dishVersion.count({
        where: { dishId: recipeId },
      });
      expect(versionCountAfter).toBe(versionCountBefore);

      const recipe = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
      });
      expect(recipe.currentVersionId).toBe(v1Id);
    });
  });
});
