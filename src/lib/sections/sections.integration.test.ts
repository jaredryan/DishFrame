import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import * as sectionsService from "@/lib/sections/service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { DishContentInput } from "@/lib/dishes/schema";
import { scaleIngredientQuantity } from "@/lib/units/scaling";
import { scaledIngredientDisplay } from "@/lib/dishes/scaled-display";

/**
 * Slice 6 post-gate (Build Plan Review Gate 3): attach validation, detach
 * content resolution (including multiplier scaling), target-validity
 * checks, and nested-tree resolution. "Create Part"/"Convert Section to
 * Part" are UI-only flows now (see `sections/service.ts`'s own module doc
 * comment) — persisted via the ordinary `dishService.createDish("PART",
 * ...)`, already covered by `dishes.integration.test.ts`, with no
 * remaining service-level "create and link" primitive to test here.
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
            {
              targetDishId: partBId,
              targetDishVersionId: partBVersionId,
              position: 0,
              multiplier: 1,
            },
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

  describe("assertValidPartLinkTargets", () => {
    it("rejects a target Dish that is a Recipe, not a Part", async () => {
      const user = await createTestUser();
      userId = user.id;
      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        partContent("Some Recipe"),
      );
      const versionId = await currentVersionId(recipeId);

      await expect(
        sectionsService.assertValidPartLinkTargets(prisma, userId, [
          { targetDishId: recipeId, targetDishVersionId: versionId },
        ]),
      ).rejects.toThrow(/cannot be used as a linked Part/);
    });

    it("rejects a targetDishVersionId that belongs to a different Dish", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partAId = await dishService.createDish(
        userId,
        "PART",
        partContent("Part A"),
      );
      const partBId = await dishService.createDish(
        userId,
        "PART",
        partContent("Part B"),
      );
      const partBVersionId = await currentVersionId(partBId);

      await expect(
        sectionsService.assertValidPartLinkTargets(prisma, userId, [
          { targetDishId: partAId, targetDishVersionId: partBVersionId },
        ]),
      ).rejects.toThrow(/does not belong to that Part/);
    });

    it("rejects a target the caller does not own", async () => {
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
        sectionsService.assertValidPartLinkTargets(prisma, userId, [
          { targetDishId: otherPartId, targetDishVersionId: otherVersionId },
        ]),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("resolvePartVersionForDetach — multiplier scaling", () => {
    function partContentWithIngredient(
      title: string,
      ingredientName: string,
      quantity: number,
    ): DishContentInput {
      return {
        ...partContent(title),
        sections: [
          {
            name: null,
            guidanceNote: null,
            position: 0,
            ingredients: [
              {
                name: ingredientName,
                quantity,
                quantityEnd: null,
                isApproximate: false,
                unit: "cup",
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
      };
    }

    it("scales the detached ingredient's quantity by a multiplier other than 1, via the shared scaling utility", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await dishService.createDish(
        userId,
        "PART",
        partContentWithIngredient("Broth Base", "Broth", 2),
      );
      const versionId = await currentVersionId(partDishId);

      const detached = await sectionsService.resolvePartVersionForDetach(
        userId,
        versionId,
        1.5,
      );

      const expected = scaleIngredientQuantity(
        {
          quantity: 2,
          quantityEnd: null,
          isApproximate: false,
          displayText: null,
        },
        1.5,
      );
      expect(detached.sections[0].ingredients[0].quantity).toBe(
        expected.quantity,
      );
    });

    it("leaves the quantity unchanged when the multiplier is 1 (the default, a no-op)", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await dishService.createDish(
        userId,
        "PART",
        partContentWithIngredient("Broth Base", "Broth", 2),
      );
      const versionId = await currentVersionId(partDishId);

      const detached = await sectionsService.resolvePartVersionForDetach(
        userId,
        versionId,
      );

      expect(detached.sections[0].ingredients[0].quantity).toBe(2);
    });
  });

  describe("resolvePartLinkTree", () => {
    it("resolves a nested Part one level deep, with correct titles and content at each level", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partBId = await dishService.createDish(
        userId,
        "PART",
        partContent("Rice"),
      );
      const partBVersionId = await currentVersionId(partBId);

      const partAId = await dishService.createDish(
        userId,
        "PART",
        partContent("Bowl"),
      );
      const partAV1 = await currentVersionId(partAId);
      await dishService.editDish(
        userId,
        partAId,
        partAV1,
        {
          ...partContent("Bowl"),
          partLinks: [
            {
              targetDishId: partBId,
              targetDishVersionId: partBVersionId,
              position: 0,
              multiplier: 2,
            },
          ],
        },
        "MINOR",
        "PART",
      );
      const partACurrentVersionId = await currentVersionId(partAId);

      const tree = await sectionsService.resolvePartLinkTree(userId, {
        targetDishId: partAId,
        targetDishVersionId: partACurrentVersionId,
        multiplier: 1,
      });

      expect(tree).not.toBeNull();
      expect(tree!.title).toBe("Bowl");
      expect(tree!.partLinks).toHaveLength(1);
      expect(tree!.partLinks[0].title).toBe("Rice");
      expect(tree!.partLinks[0].multiplier).toBe(2);
      expect(tree!.partLinks[0].sections[0].ingredients[0].name).toBe("Salt");
    });

    it("resolves to null for a missing/deleted target rather than throwing", async () => {
      const user = await createTestUser();
      userId = user.id;

      const tree = await sectionsService.resolvePartLinkTree(userId, {
        targetDishId: "does-not-exist",
        targetDishVersionId: "does-not-exist-either",
        multiplier: 1,
      });

      expect(tree).toBeNull();
    });

    // ARCHITECTURE_PROPOSAL.md §G.6 / `resolvePartLinkTreeInner`'s own doc
    // comment: `MAX_PART_LINK_TREE_DEPTH` (currently 12) is defense-in-depth
    // against a rendering pass ever infinite-looping, since a genuine cycle
    // is already rejected at write time (`assertNoPartCycle`) and can't be
    // constructed here. A real, non-cyclic 12-hop chain is built instead —
    // long enough to push the innermost link past the cap — and the walk is
    // asserted to stop short of the chain's real length, proving the guard
    // (not just a naturally-terminating chain) is what stopped it.
    it("stops resolving at the maximum nesting depth rather than walking the whole chain", async () => {
      const user = await createTestUser();
      userId = user.id;

      const CHAIN_LENGTH = 13;
      const partIds: string[] = [];
      const partVersionIds: string[] = [];
      for (let i = 0; i < CHAIN_LENGTH; i++) {
        const id = await dishService.createDish(
          userId,
          "PART",
          partContent(`Layer ${i}`),
        );
        partIds.push(id);
        partVersionIds.push(await currentVersionId(id));
      }
      // Link deepest-first so every attach targets an already-existing,
      // already-valid Version.
      for (let i = CHAIN_LENGTH - 2; i >= 0; i--) {
        await dishService.editDish(
          userId,
          partIds[i],
          partVersionIds[i],
          {
            ...partContent(`Layer ${i}`),
            partLinks: [
              {
                targetDishId: partIds[i + 1],
                targetDishVersionId: partVersionIds[i + 1],
                position: 0,
                multiplier: 1,
              },
            ],
          },
          "MINOR",
          "PART",
        );
        partVersionIds[i] = await currentVersionId(partIds[i]);
      }

      const tree = await sectionsService.resolvePartLinkTree(userId, {
        targetDishId: partIds[0],
        targetDishVersionId: partVersionIds[0],
        multiplier: 1,
      });

      let node = tree;
      let depth = 0;
      while (node && node.partLinks.length > 0) {
        node = node.partLinks[0];
        depth++;
      }
      // A full, uncapped walk of this real chain would reach depth
      // CHAIN_LENGTH - 1 (12) — the guard must stop it strictly short of
      // that.
      expect(depth).toBeLessThan(CHAIN_LENGTH - 1);
    });
  });

  // Slice 6 correction pass, §H: closing a discovered gap — a historical
  // Version may still carry a MATERIALIZED PartLink (its target Part
  // deleted while historically referenced), but no query path anywhere
  // resolved one for display until this pass. Also verifies the preserved
  // decision that the multiplier is never baked into the stored snapshot —
  // it composes with the snapshot's raw quantity at display time, same as a
  // LIVE occurrence.
  describe("resolveMaterializedPartLinkTreesForVersion", () => {
    it("resolves a materialized historical usage with its stored multiplier intact, composing to the correct effective quantity", async () => {
      const user = await createTestUser();
      userId = user.id;

      const partId = await dishService.createDish(userId, "PART", {
        ...partContent("Nuoc Cham"),
        sections: [
          {
            name: null,
            guidanceNote: null,
            position: 0,
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
            instructions: [],
            partLinks: [],
          },
        ],
      });
      const partVersionId = await currentVersionId(partId);

      const containerId = await dishService.createDish(
        userId,
        "RECIPE",
        partContent("Bowl"),
      );
      const containerV1 = await currentVersionId(containerId);
      await dishService.editDish(
        userId,
        containerId,
        containerV1,
        {
          ...partContent("Bowl"),
          partLinks: [
            {
              targetDishId: partId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 3,
            },
          ],
        },
        "MINOR",
      );
      const historicalVersionId = await currentVersionId(containerId);

      // Resolve the CURRENT usage (DETACH), leaving the Version just created
      // above as a HISTORICAL usage still referencing the Part live.
      const historicalPartLink = await prisma.partLink.findFirstOrThrow({
        where: { containerVersionId: historicalVersionId },
      });
      await dishService.resolvePartUsageOccurrence(
        userId,
        partId,
        containerId,
        historicalPartLink.lineageId,
        "DETACH",
        "MINOR",
      );

      // Delete the Part — the historical link above is now the only
      // survivor, converted in place to a MATERIALIZED snapshot.
      await dishService.deleteDish(userId, partId, "PART");

      const materialized =
        await sectionsService.resolveMaterializedPartLinkTreesForVersion(
          userId,
          historicalVersionId,
        );

      expect(materialized.topLevel).toHaveLength(1);
      const { position, tree } = materialized.topLevel[0];
      expect(position).toBe(0);
      expect(tree.kind).toBe("MATERIALIZED");
      expect(tree.targetDishId).toBeNull();
      expect(tree.targetDishVersionId).toBeNull();
      expect(tree.title).toBe("Nuoc Cham");
      expect(tree.versionLabel).toBe("V1.0");
      expect(tree.multiplier).toBe(3);

      // The stored snapshot itself is never scaled — raw authored quantity.
      const ingredient = tree.sections[0].ingredients[0];
      expect(ingredient.name).toBe("Fish sauce");
      expect(ingredient.quantity).toBe(2);

      // Effective display quantity composes multiplier × whole-item scale
      // at render time, same formula as a LIVE occurrence
      // (`part-link-tree-view.tsx`'s `effectiveScale`) — never baked in.
      const wholeItemScale = 1;
      const effectiveScale = wholeItemScale * tree.multiplier;
      const display = scaledIngredientDisplay(ingredient, effectiveScale, null);
      expect(display.line).toContain("6");
    });
  });

  describe("mergeLiveAndMaterializedTrees", () => {
    it("orders a materialized tree by its stored position among LIVE siblings", () => {
      const liveTree = {
        kind: "LIVE" as const,
        targetDishId: "part-live",
        targetDishVersionId: "part-live-v1",
        multiplier: 1,
        // Unused here — this test's own ordering comes from the
        // `{position, tree}` wrapper, not this tree's own `position`
        // field.
        position: 0,
        title: "Live Part",
        versionLabel: "V1.0",
        sections: [],
        partLinks: [],
      };
      const materializedTree = {
        kind: "MATERIALIZED" as const,
        targetDishId: null,
        targetDishVersionId: null,
        multiplier: 1,
        position: 0,
        title: "Deleted Part",
        versionLabel: "V1.0",
        sections: [],
        partLinks: [],
      };

      const merged = sectionsService.mergeLiveAndMaterializedTrees(
        [
          {
            targetDishId: "part-live",
            targetDishVersionId: "part-live-v1",
            position: 1,
            multiplier: 1,
          },
        ],
        [liveTree],
        [{ position: 0, tree: materializedTree }],
      );

      expect(merged.map((entry) => entry.tree.title)).toEqual([
        "Deleted Part",
        "Live Part",
      ]);
      // Position is preserved (not discarded) — callers merge it back
      // against Sections via `orderSectionsAndTopLevelPartLinks`.
      expect(merged.map((entry) => entry.position)).toEqual([0, 1]);
    });
  });
});
