import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import {
  restoreDishSchema,
  dishContentSchema,
  type DishContentInput,
  type SectionInput,
} from "@/lib/dishes/schema";
import { NotFoundError, ValidationError } from "@/lib/errors";

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

function blankIngredient(name: string) {
  return {
    name,
    quantity: null,
    quantityEnd: null,
    isApproximate: false,
    unit: null,
    displayText: null,
    preparationNote: null,
    isOptional: false,
    substitute: null,
  };
}

async function loadDishWithVersion(dishId: string) {
  return prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    include: {
      currentVersion: {
        include: { sections: { include: { ingredients: true } } },
      },
    },
  });
}

async function versionCount(dishId: string) {
  return prisma.dishVersion.count({ where: { dishId } });
}

// Rebuilds the single default Section/Ingredient with their real, already-
// persisted lineageIds — mirroring what `dishToFormValues` sends for
// content the user left untouched. `content()`'s own default ingredient
// deliberately has no lineageId (it simulates a brand-new row), which is
// wrong for a "nothing about the cooking content changed" edit: without
// the real lineageId, `diffVersionContent` correctly (and unavoidably)
// reads it as a newly-added ingredient rather than an unchanged one.
function unchangedSections(
  dish: Awaited<ReturnType<typeof loadDishWithVersion>>,
): SectionInput[] {
  const section = dish.currentVersion!.sections[0];
  const ingredient = section.ingredients[0];
  return [
    {
      lineageId: section.lineageId,
      name: null,
      guidanceNote: null,
      ingredients: [
        { lineageId: ingredient.lineageId, ...blankIngredient("Salt") },
      ],
      instructions: [],
    },
  ];
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

      const dish = await loadDishWithVersion(dishId);

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

  // Gate 2 correction (docs/SLICE_3.md): editDish's settled Version
  // classification — stable-only/no-op create no Version, non-cooking
  // Version-owned changes auto-bump a minor Version, and any Ingredient/
  // Instruction change requires an explicit minor/major choice.
  describe("editDish — Version classification", () => {
    it("creates no Version for a cuisine-only change", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const before = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        before.currentVersionId!,
        content({ cuisine: "Japanese", sections: unchangedSections(before) }),
        undefined,
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.cuisine).toBe("Japanese");
      expect(after.currentVersionId).toBe(before.currentVersionId);
      expect(await versionCount(dishId)).toBe(1);
    });

    it("creates no Version for a Stage-only change", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const before = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        before.currentVersionId!,
        content({ stage: "ACTIVE", sections: unchangedSections(before) }),
        undefined,
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.stage).toBe("ACTIVE");
      expect(after.currentVersionId).toBe(before.currentVersionId);
      expect(await versionCount(dishId)).toBe(1);
    });

    it("creates no Version for a true no-op save", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const before = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        before.currentVersionId!,
        content({ sections: unchangedSections(before) }),
        undefined,
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersionId).toBe(before.currentVersionId);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
      expect(await versionCount(dishId)).toBe(1);
    });

    it("creates exactly one minor Version for a non-cooking Version-owned change (title)", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const before = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        before.currentVersionId!,
        content({
          title: "Ginger Soy Bowl (updated)",
          sections: unchangedSections(before),
        }),
        undefined,
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersion?.majorVersion).toBe(1);
      expect(after.currentVersion?.minorVersion).toBe(1);
      expect(after.currentVersion?.title).toBe("Ginger Soy Bowl (updated)");
      expect(after.currentVersionId).not.toBe(before.currentVersionId);
      expect(await versionCount(dishId)).toBe(2);
      // Slice 4 correction pass §2: an ordinary sequential minor refinement
      // (from the line's own current latest minor) leaves sourceVersionId
      // unset — the relationship is already implied by consecutive
      // numbering, unlike a non-sequential branch (see below).
      expect(after.currentVersion?.sourceVersionId).toBeNull();
    });

    it("carries an existing row's lineageId forward and mints a fresh one for a newly-added row, saved as minor", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const originalSection = dish.currentVersion!.sections[0];
      const originalIngredient = originalSection.ingredients[0];

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        {
          ...content(),
          sections: [
            {
              lineageId: originalSection.lineageId,
              name: null,
              guidanceNote: null,
              ingredients: [
                {
                  lineageId: originalIngredient.lineageId,
                  ...blankIngredient("Salt"),
                },
                blankIngredient("Pepper"),
              ],
              instructions: [],
            },
          ],
        },
        "MINOR",
      );

      const updated = await loadDishWithVersion(dishId);
      expect(updated.currentVersion?.majorVersion).toBe(1);
      expect(updated.currentVersion?.minorVersion).toBe(1);

      const newIngredients = updated.currentVersion!.sections[0].ingredients;
      const salt = newIngredients.find((i) => i.name === "Salt")!;
      const pepper = newIngredients.find((i) => i.name === "Pepper")!;

      expect(salt.lineageId).toBe(originalIngredient.lineageId);
      expect(pepper.lineageId).not.toBe(originalIngredient.lineageId);
      expect(pepper.lineageId).toBeTruthy();
    });

    it("saving an Instruction change as major increments the major number and resets minor to zero", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const originalSection = dish.currentVersion!.sections[0];
      const originalIngredient = originalSection.ingredients[0];

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        {
          ...content(),
          sections: [
            {
              lineageId: originalSection.lineageId,
              name: null,
              guidanceNote: null,
              ingredients: [
                {
                  lineageId: originalIngredient.lineageId,
                  ...blankIngredient("Salt"),
                },
              ],
              instructions: [{ text: "Whisk everything together." }],
            },
          ],
        },
        "MAJOR",
      );

      const updated = await loadDishWithVersion(dishId);
      expect(updated.currentVersion?.majorVersion).toBe(2);
      expect(updated.currentVersion?.minorVersion).toBe(0);
      // Slice 4 correction pass §4: an ordinary major bump from what was
      // already the current line seeds source → result wording ending in
      // "Revision".
      expect(updated.currentVersion?.versionNote).toBe("V1.0 → V2.0: Revision");
    });

    it("requires an explicit minor/major choice for add, remove, and reorder Ingredient changes", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              ingredients: [blankIngredient("Salt"), blankIngredient("Pepper")],
              instructions: [],
            },
          ],
        }),
      );
      const dish = await loadDishWithVersion(dishId);
      const section = dish.currentVersion!.sections[0];
      const salt = section.ingredients.find((i) => i.name === "Salt")!;
      const pepper = section.ingredients.find((i) => i.name === "Pepper")!;

      function sectionsWith(ingredients: SectionInput["ingredients"]) {
        return [
          {
            lineageId: section.lineageId,
            name: null,
            guidanceNote: null,
            ingredients,
            instructions: [],
          },
        ];
      }

      // Add a third ingredient.
      await expect(
        dishService.editDish(
          userId!,
          dishId,
          dish.currentVersionId!,
          {
            ...content(),
            sections: sectionsWith([
              { lineageId: salt.lineageId, ...blankIngredient("Salt") },
              { lineageId: pepper.lineageId, ...blankIngredient("Pepper") },
              blankIngredient("Garlic"),
            ]),
          },
          undefined,
        ),
      ).rejects.toThrow(ValidationError);

      // Remove the second ingredient.
      await expect(
        dishService.editDish(
          userId!,
          dishId,
          dish.currentVersionId!,
          {
            ...content(),
            sections: sectionsWith([
              { lineageId: salt.lineageId, ...blankIngredient("Salt") },
            ]),
          },
          undefined,
        ),
      ).rejects.toThrow(ValidationError);

      // Reorder the two ingredients (same rows, swapped position).
      await expect(
        dishService.editDish(
          userId!,
          dishId,
          dish.currentVersionId!,
          {
            ...content(),
            sections: sectionsWith([
              { lineageId: pepper.lineageId, ...blankIngredient("Pepper") },
              { lineageId: salt.lineageId, ...blankIngredient("Salt") },
            ]),
          },
          undefined,
        ),
      ).rejects.toThrow(ValidationError);

      // No Version should have been created by any of the rejected attempts.
      expect(await versionCount(dishId)).toBe(1);
    });

    it("updates stable metadata and Version-owned content together in one save", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const before = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        before.currentVersionId!,
        content({
          cuisine: "Thai",
          title: "Ginger Soy Bowl (v2)",
          sections: unchangedSections(before),
        }),
        undefined,
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.cuisine).toBe("Thai");
      expect(after.currentVersion?.title).toBe("Ginger Soy Bowl (v2)");
      expect(after.currentVersion?.minorVersion).toBe(1);
      expect(await versionCount(dishId)).toBe(2);
    });

    it("leaves the previous Version's content unchanged after a new Version is created", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const before = await loadDishWithVersion(dishId);
      const originalVersionId = before.currentVersionId!;

      await dishService.editDish(
        userId,
        dishId,
        originalVersionId,
        content({
          title: "Ginger Soy Bowl (updated)",
          sections: unchangedSections(before),
        }),
        undefined,
      );

      const originalVersion = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: originalVersionId },
      });
      expect(originalVersion.title).toBe("Ginger Soy Bowl");
    });

    // Slice 4 correction pass §1: a superseded (non-latest) Version is not
    // "stale" merely because a later Version now exists — it remains a
    // valid, selectable editing base. This replaces the old rule that
    // rejected any base but a major line's latest minor.
    it("allows editing from a superseded Version rather than rejecting it as stale, and records its true source", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const v1Id = dish.currentVersionId!;

      // Advances to V1.1 — v1Id (V1.0) is now superseded within its line.
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({ title: "First edit", sections: unchangedSections(dish) }),
        undefined,
      );

      // Branching from the superseded V1.0 still succeeds, and allocates
      // the line's next overall minor — MAX(minorVersion) + 1 = 2 — never
      // `v1Id.minorVersion + 1`, which would collide with V1.1.
      const newDishId = await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({
          title: "Branched from V1.0",
          sections: unchangedSections(dish),
        }),
        undefined,
      );
      expect(newDishId).toBe(dishId);

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersion?.majorVersion).toBe(1);
      expect(after.currentVersion?.minorVersion).toBe(2);
      expect(after.currentVersion?.title).toBe("Branched from V1.0");
      // Non-sequential minor branch (the base wasn't the latest minor in
      // its line at save time) — its true source is recorded structurally.
      expect(after.currentVersion?.sourceVersionId).toBe(v1Id);
      // Major 1 is still the Dish's only/highest major line, so the branch
      // becomes current, same as any other minor bump on the highest line.
      expect(after.currentVersionId).toBe(after.currentVersion!.id);
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
      const dish = await loadDishWithVersion(dishId);

      await expect(
        dishService.editDish(
          intruder.id,
          dishId,
          dish.currentVersionId!,
          content(),
          undefined,
        ),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });

  // Slice 4 (docs/BUILD_PLAN.md): editing from a specifically-selected
  // historical Version, rather than always assuming the current Version.
  // PRODUCT_SPEC.md §13.4/§13.5/§13.7.
  describe("editDish — historical major lines (Slice 4)", () => {
    async function createTwoMajorLines(userId: string) {
      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const v1 = await loadDishWithVersion(dishId);
      const v1Id = v1.currentVersionId!;

      // A cooking-content change with an explicit MAJOR choice creates V2.0
      // and moves it to current.
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({
          title: "Ginger Soy Bowl (remix)",
          sections: [
            {
              name: null,
              guidanceNote: null,
              ingredients: [blankIngredient("Ginger")],
              instructions: [],
            },
          ],
        }),
        "MAJOR",
      );
      const v2 = await loadDishWithVersion(dishId);
      return { dishId, v1Id, v2Id: v2.currentVersionId! };
    }

    it("a MINOR save from a historical major line stays historical and does not move Dish.currentVersionId", async () => {
      const user = await createTestUser();
      userId = user.id;
      const { dishId, v1Id, v2Id } = await createTwoMajorLines(userId);

      const historicalBase = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: v1Id },
        include: { sections: { include: { ingredients: true } } },
      });

      const newDishId = await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({
          sections: [
            {
              lineageId: historicalBase.sections[0].lineageId,
              name: null,
              guidanceNote: null,
              ingredients: [
                {
                  lineageId:
                    historicalBase.sections[0].ingredients[0].lineageId,
                  ...blankIngredient("Kosher salt"),
                },
              ],
              instructions: [],
            },
          ],
        }),
        "MINOR",
      );
      expect(newDishId).toBe(dishId);

      const after = await loadDishWithVersion(dishId);
      // Dish.currentVersionId is still the V2.0 line, untouched.
      expect(after.currentVersionId).toBe(v2Id);

      const historicalLineVersions = await prisma.dishVersion.findMany({
        where: { dishId, majorVersion: 1 },
        orderBy: { minorVersion: "asc" },
      });
      expect(historicalLineVersions.map((v) => v.minorVersion)).toEqual([0, 1]);
      expect(historicalLineVersions[1].sourceVersionId).toBeNull();
    });

    it("an automatic (non-cooking) minor bump from a historical major line also stays historical", async () => {
      const user = await createTestUser();
      userId = user.id;
      const { dishId, v1Id, v2Id } = await createTwoMajorLines(userId);

      const historicalBase = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: v1Id },
        include: { sections: { include: { ingredients: true } } },
      });

      // Title-only change (no versionChoice needed — this is the bucket-two
      // "automatic small update" path, PRODUCT_SPEC.md §13.2a) against the
      // unchanged, real-lineageId content of the historical line.
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({
          title: "Ginger Soy Bowl (annotated)",
          sections: [
            {
              lineageId: historicalBase.sections[0].lineageId,
              name: null,
              guidanceNote: null,
              ingredients: [
                {
                  lineageId:
                    historicalBase.sections[0].ingredients[0].lineageId,
                  ...blankIngredient("Salt"),
                },
              ],
              instructions: [],
            },
          ],
        }),
        undefined,
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersionId).toBe(v2Id);

      const historicalLineVersions = await prisma.dishVersion.findMany({
        where: { dishId, majorVersion: 1 },
        orderBy: { minorVersion: "asc" },
      });
      expect(historicalLineVersions.map((v) => v.minorVersion)).toEqual([0, 1]);
      expect(historicalLineVersions[1].title).toBe(
        "Ginger Soy Bowl (annotated)",
      );
    });

    it("a MAJOR save from a historical major line creates the next-overall major, sets sourceVersionId, and moves current", async () => {
      const user = await createTestUser();
      userId = user.id;
      const { dishId, v1Id } = await createTwoMajorLines(userId);

      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({ title: "Revived direction" }),
        "MAJOR",
      );

      const after = await loadDishWithVersion(dishId);
      // Highest existing major was 2 — the revived major must be 3, not 2
      // (v1's own major + 1), since "current" always advances from the
      // Dish's global highest major (Arch §F.5), not the edited line's own.
      expect(after.currentVersion?.majorVersion).toBe(3);
      expect(after.currentVersion?.minorVersion).toBe(0);
      expect(after.currentVersion?.sourceVersionId).toBe(v1Id);
      // Slice 4 correction pass §4: a major created from a historical
      // direction seeds source → result wording ending in "Revival".
      expect(after.currentVersion?.versionNote).toBe("V1.0 → V3.0: Revival");
      expect(after.currentVersionId).toBe(after.currentVersion!.id);
    });

    // Slice 4 correction pass §1/§2/§7: repeatedly branching from the same
    // historical base never collides — each save allocates the line's next
    // overall minor fresh, and a base that's no longer the latest in its
    // own line has its true source recorded rather than being rejected.
    it("allows repeated branching from the same historical Version, always allocating the line's next minor and recording provenance", async () => {
      const user = await createTestUser();
      userId = user.id;
      const { dishId, v1Id, v2Id } = await createTwoMajorLines(userId);

      // Branch #1 from v1Id (V1.0) — at this point V1.0 is still the
      // latest minor in its line, so this is an ordinary sequential
      // refinement: sourceVersionId stays unset.
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({ title: "V1 refined once" }),
        "MINOR",
      );
      const afterFirst = await prisma.dishVersion.findMany({
        where: { dishId, majorVersion: 1 },
        orderBy: { minorVersion: "asc" },
      });
      expect(afterFirst.map((v) => v.minorVersion)).toEqual([0, 1]);
      expect(afterFirst[1].sourceVersionId).toBeNull();

      // Branch #2, again from v1Id (V1.0) — V1.1 now exists, so this is a
      // non-sequential branch: it still succeeds, allocates V1.2 rather
      // than colliding with V1.1, and records its true source.
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({ title: "V1 branched again" }),
        "MINOR",
      );
      const afterSecond = await prisma.dishVersion.findMany({
        where: { dishId, majorVersion: 1 },
        orderBy: { minorVersion: "asc" },
      });
      expect(afterSecond.map((v) => v.minorVersion)).toEqual([0, 1, 2]);
      expect(afterSecond[2].sourceVersionId).toBe(v1Id);
      expect(afterSecond[2].title).toBe("V1 branched again");

      // Neither branch touched the current V2.0 line.
      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersionId).toBe(v2Id);
    });

    // Slice 4 correction pass §7: same reliable "fire genuinely concurrent
    // operations, assert the database-enforced invariant" pattern already
    // used by src/lib/account/init.integration.test.ts, rather than a
    // timing-fragile test that depends on forcing a specific interleaving.
    // Whether or not this particular run actually triggers a real
    // allocation conflict, the invariant — unique, gap-free version
    // numbers, no raw database error surfaced, the unrelated current line
    // untouched — must hold either way.
    it("concurrent minor branches from the same historical base still leave unique, gap-free version numbers", async () => {
      const user = await createTestUser();
      userId = user.id;
      const { dishId, v1Id, v2Id } = await createTwoMajorLines(userId);

      await Promise.all([
        dishService.editDish(
          userId,
          dishId,
          v1Id,
          content({ title: "Branch A" }),
          "MINOR",
        ),
        dishService.editDish(
          userId,
          dishId,
          v1Id,
          content({ title: "Branch B" }),
          "MINOR",
        ),
        dishService.editDish(
          userId,
          dishId,
          v1Id,
          content({ title: "Branch C" }),
          "MINOR",
        ),
      ]);

      const majorOneVersions = await prisma.dishVersion.findMany({
        where: { dishId, majorVersion: 1 },
        orderBy: { minorVersion: "asc" },
      });
      // V1.0 plus the three concurrent branches — unique, gap-free minors.
      expect(majorOneVersions.map((v) => v.minorVersion)).toEqual([0, 1, 2, 3]);

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersionId).toBe(v2Id);
    });
  });

  describe("promoteHistoricalVersion (Slice 4)", () => {
    it("copies a historical Version's content verbatim into a new current major, carrying lineage forward", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const v1 = await loadDishWithVersion(dishId);
      const v1Id = v1.currentVersionId!;
      const originalIngredientLineageId =
        v1.currentVersion!.sections[0].ingredients[0].lineageId;

      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({ title: "A different direction" }),
        "MAJOR",
      );
      // Stage change, independent of Version content — promote must not
      // touch it (PRODUCT_SPEC.md §13.9).
      await dishService.updateDishStage(userId, dishId, "ACTIVE");

      const newDishId = await dishService.promoteHistoricalVersion(
        userId,
        dishId,
        v1Id,
      );
      expect(newDishId).toBe(dishId);

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersion?.majorVersion).toBe(3);
      expect(after.currentVersion?.minorVersion).toBe(0);
      expect(after.currentVersion?.title).toBe("Ginger Soy Bowl");
      expect(after.currentVersion?.sourceVersionId).toBe(v1Id);
      // Slice 4 correction pass §4: promoting a historical direction seeds
      // source → result wording ending in "Revival", same as a major
      // created directly from a historical base.
      expect(after.currentVersion?.versionNote).toBe("V1.0 → V3.0: Revival");
      expect(after.currentTitle).toBe("Ginger Soy Bowl");
      // Stage is unaffected by promotion.
      expect(after.stage).toBe("ACTIVE");

      const promotedIngredient =
        after.currentVersion!.sections[0].ingredients[0];
      expect(promotedIngredient.lineageId).toBe(originalIngredientLineageId);
    });

    it("rejects cross-user promotion with NotFoundError", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;

      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const dish = await loadDishWithVersion(dishId);

      await expect(
        dishService.promoteHistoricalVersion(
          intruder.id,
          dishId,
          dish.currentVersionId!,
        ),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });

  describe("updateVersionNote (Slice 4)", () => {
    it("updates the note without creating a Version", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const versionId = dish.currentVersionId!;

      await dishService.updateVersionNote(
        userId,
        dishId,
        versionId,
        "Tried it with rice vinegar instead.",
      );

      const version = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: versionId },
      });
      expect(version.versionNote).toBe("Tried it with rice vinegar instead.");
      expect(await versionCount(dishId)).toBe(1);
    });

    // Slice 4 correction pass §4: a note left as only the generated
    // relationship stamp with nothing after the colon reads as visually
    // unfinished — the colon is dropped when saved.
    it("strips the trailing colon from a note left as only the generated relationship prefix", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const versionId = dish.currentVersionId!;

      await dishService.updateVersionNote(
        userId,
        dishId,
        versionId,
        "V1.0 → V2.0:",
      );

      const version = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: versionId },
      });
      expect(version.versionNote).toBe("V1.0 → V2.0");
    });

    it("does not strip a colon that is part of ordinary authored prose", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const versionId = dish.currentVersionId!;

      await dishService.updateVersionNote(
        userId,
        dishId,
        versionId,
        "Note: tried a substitution here.",
      );

      const version = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: versionId },
      });
      expect(version.versionNote).toBe("Note: tried a substitution here.");
    });

    it("clears the note back to null with blank input", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const versionId = dish.currentVersionId!;

      await dishService.updateVersionNote(userId, dishId, versionId, "A note");
      await dishService.updateVersionNote(userId, dishId, versionId, "   ");

      const version = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: versionId },
      });
      expect(version.versionNote).toBeNull();
    });

    it("rejects cross-user note edits with NotFoundError", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;

      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const dish = await loadDishWithVersion(dishId);

      await expect(
        dishService.updateVersionNote(
          intruder.id,
          dishId,
          dish.currentVersionId!,
          "Not yours",
        ),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });

    it("rejects a versionId that belongs to a different Dish", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishAId = await dishService.createDish(userId, "RECIPE", content());
      const dishBId = await dishService.createDish(userId, "RECIPE", content());
      const dishA = await loadDishWithVersion(dishAId);

      await expect(
        dishService.updateVersionNote(
          userId,
          dishBId,
          dishA.currentVersionId!,
          "Wrong dish",
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // Task 3 (docs/SLICE_3.md Gate 2 section): proves the approved Ingredient
  // entry values survive server validation, creation, an edit, and a
  // reload. Fraction/mixed-number *text parsing* is a client-side concern
  // covered separately in number-field.test.ts — this suite proves the
  // resulting decimal values (and every other supported field) persist.
  describe("Ingredient field persistence", () => {
    it("a fully-populated Ingredient (range, approximate, unit, prep note, optional) survives creation, edit, and reload", async () => {
      const user = await createTestUser();
      userId = user.id;

      const payload = content({
        sections: [
          {
            name: null,
            guidanceNote: null,
            ingredients: [
              {
                name: "Broth",
                quantity: 1.5, // "1 1/2" parsed client-side
                quantityEnd: 2, // range: "1 1/2–2 cups"
                isApproximate: true,
                unit: "cup",
                displayText: null,
                preparationNote: "warmed",
                isOptional: true,
                substitute: null,
              },
            ],
            instructions: [],
          },
        ],
      });

      // Server validation: the payload must parse before it ever reaches
      // the service (mirrors what the Server Action does).
      const validated = dishContentSchema.parse(payload);

      const dishId = await dishService.createDish(user.id, "RECIPE", validated);

      const created = await loadDishWithVersion(dishId);
      const createdIngredient =
        created.currentVersion!.sections[0].ingredients[0];
      expect(createdIngredient.name).toBe("Broth");
      expect(createdIngredient.quantity?.toNumber()).toBe(1.5);
      expect(createdIngredient.quantityEnd?.toNumber()).toBe(2);
      expect(createdIngredient.isApproximate).toBe(true);
      expect(createdIngredient.unit).toBe("cup");
      expect(createdIngredient.preparationNote).toBe("warmed");
      expect(createdIngredient.isOptional).toBe(true);

      await dishService.editDish(
        user.id,
        dishId,
        created.currentVersionId!,
        {
          ...content(),
          sections: [
            {
              lineageId: created.currentVersion!.sections[0].lineageId,
              name: null,
              guidanceNote: null,
              ingredients: [
                {
                  lineageId: createdIngredient.lineageId,
                  name: "Broth",
                  quantity: 1.5,
                  quantityEnd: 2,
                  isApproximate: true,
                  unit: "cup",
                  displayText: null,
                  preparationNote: "warmed, low-sodium",
                  isOptional: false,
                  substitute: null,
                },
              ],
              instructions: [],
            },
          ],
        },
        "MINOR",
      );

      const reloaded = await loadDishWithVersion(dishId);
      const reloadedIngredient =
        reloaded.currentVersion!.sections[0].ingredients[0];
      expect(reloadedIngredient.preparationNote).toBe("warmed, low-sodium");
      expect(reloadedIngredient.isOptional).toBe(false);
      expect(reloadedIngredient.quantity?.toNumber()).toBe(1.5);
      expect(reloadedIngredient.quantityEnd?.toNumber()).toBe(2);
    });

    it("a free-text-only Ingredient (no numeric quantity) survives creation and reload", async () => {
      const user = await createTestUser();
      userId = user.id;

      const payload = content({
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
                displayText: "to taste",
                preparationNote: null,
                isOptional: false,
                substitute: null,
              },
            ],
            instructions: [],
          },
        ],
      });
      const validated = dishContentSchema.parse(payload);

      const dishId = await dishService.createDish(user.id, "RECIPE", validated);

      const created = await loadDishWithVersion(dishId);
      const ingredient = created.currentVersion!.sections[0].ingredients[0];
      expect(ingredient.quantity).toBeNull();
      expect(ingredient.displayText).toBe("to taste");
    });
  });

  // Gate 2 remediation (docs/GATE_2_REMEDIATION.md): a completely unused
  // "Add substitute" click used to be submitted as `{ name: "", ... }` and
  // fail `dishContentSchema.parse()` outright, breaking Recipe/Part
  // creation. `substituteInputSchema`'s `z.preprocess` step now strips a
  // fully-blank substitute to `null` before validation runs; a *partially*
  // filled-in one (something set, but no name) still fails — deliberately,
  // since that's a real incomplete-input case, not an abandoned click.
  describe("Substitute handling (Gate 2 remediation)", () => {
    it("a completely blank substitute does not fail validation, and persists as no substitute", async () => {
      const user = await createTestUser();
      userId = user.id;

      const payload = content({
        sections: [
          {
            name: null,
            guidanceNote: null,
            ingredients: [
              {
                name: "Soy sauce",
                quantity: null,
                quantityEnd: null,
                isApproximate: false,
                unit: null,
                displayText: null,
                preparationNote: null,
                isOptional: false,
                substitute: {
                  name: "",
                  quantity: null,
                  quantityEnd: null,
                  isApproximate: false,
                  unit: null,
                  displayText: null,
                  preparationNote: null,
                },
              },
            ],
            instructions: [],
          },
        ],
      });

      const validated = dishContentSchema.parse(payload);
      expect(validated.sections[0].ingredients[0].substitute).toBeNull();

      const dishId = await dishService.createDish(user.id, "RECIPE", validated);
      const created = await loadDishWithVersion(dishId);
      const ingredients = await prisma.ingredient.findMany({
        where: { dishVersionId: created.currentVersionId! },
      });
      expect(ingredients).toHaveLength(1);
      expect(ingredients[0].substituteForIngredientId).toBeNull();
    });

    it("a partially completed substitute (no name) still fails validation, distinctly from a generic error", () => {
      const payload = content({
        sections: [
          {
            name: null,
            guidanceNote: null,
            ingredients: [
              {
                name: "Soy sauce",
                quantity: null,
                quantityEnd: null,
                isApproximate: false,
                unit: null,
                displayText: null,
                preparationNote: null,
                isOptional: false,
                substitute: {
                  name: "",
                  quantity: null,
                  quantityEnd: null,
                  isApproximate: false,
                  unit: "tbsp",
                  displayText: null,
                  preparationNote: null,
                },
              },
            ],
            instructions: [],
          },
        ],
      });

      expect(() => dishContentSchema.parse(payload)).toThrow(
        /Enter a name for the substitute\./,
      );
    });

    it("a fully completed substitute persists and survives reload", async () => {
      const user = await createTestUser();
      userId = user.id;

      const payload = content({
        sections: [
          {
            name: null,
            guidanceNote: null,
            ingredients: [
              {
                name: "Soy sauce",
                quantity: 2,
                quantityEnd: null,
                isApproximate: false,
                unit: "tbsp",
                displayText: null,
                preparationNote: null,
                isOptional: false,
                substitute: {
                  name: "Tamari",
                  quantity: 2,
                  quantityEnd: null,
                  isApproximate: false,
                  unit: "tbsp",
                  displayText: null,
                  preparationNote: "gluten-free",
                },
              },
            ],
            instructions: [],
          },
        ],
      });

      const validated = dishContentSchema.parse(payload);
      const dishId = await dishService.createDish(user.id, "RECIPE", validated);

      const created = await loadDishWithVersion(dishId);
      const substitute = await prisma.ingredient.findFirstOrThrow({
        where: {
          dishVersionId: created.currentVersionId!,
          substituteForIngredientId: { not: null },
        },
      });
      expect(substitute.name).toBe("Tamari");
      expect(substitute.quantity?.toNumber()).toBe(2);
      expect(substitute.unit).toBe("tbsp");
      expect(substitute.preparationNote).toBe("gluten-free");
    });

    // Final Gate 2 correction pass: the three tests above all go through
    // `dishContentSchema.parse()` first, so they only prove the Zod
    // preprocess step works — not that `dishService.createDish`/`editDish`
    // are safe when called directly with unparsed input (bypassing Zod
    // entirely), which is exactly what a caller other than the one Server
    // Action path could do. These three call the service directly instead,
    // proving `normalizeIngredientQuantities`/`sanitizedSectionsOrThrow`'s
    // own `isBlankSubstitute` check (service.ts) — the same shared
    // predicate the Zod preprocess step uses, not a second definition —
    // covers this boundary too.
    describe("direct service calls, bypassing dishContentSchema entirely", () => {
      it("a blank substitute normalizes to no substitute, never reaching the database", async () => {
        const user = await createTestUser();
        userId = user.id;

        const dishId = await dishService.createDish(user.id, "RECIPE", {
          ...content(),
          sections: [
            {
              name: null,
              guidanceNote: null,
              ingredients: [
                {
                  ...blankIngredient("Soy sauce"),
                  substitute: {
                    name: "",
                    quantity: null,
                    quantityEnd: null,
                    isApproximate: false,
                    unit: null,
                    displayText: null,
                    preparationNote: null,
                  },
                },
              ],
              instructions: [],
            },
          ],
        });

        const created = await loadDishWithVersion(dishId);
        const ingredients = await prisma.ingredient.findMany({
          where: { dishVersionId: created.currentVersionId! },
        });
        expect(ingredients).toHaveLength(1);
        expect(ingredients[0].substituteForIngredientId).toBeNull();
      });

      it("a partial substitute (no name) is rejected, not silently written as an empty-named row", async () => {
        const user = await createTestUser();
        userId = user.id;

        await expect(
          dishService.createDish(user.id, "RECIPE", {
            ...content(),
            sections: [
              {
                name: null,
                guidanceNote: null,
                ingredients: [
                  {
                    ...blankIngredient("Soy sauce"),
                    substitute: {
                      name: "",
                      quantity: null,
                      quantityEnd: null,
                      isApproximate: false,
                      unit: "tbsp",
                      displayText: null,
                      preparationNote: null,
                    },
                  },
                ],
                instructions: [],
              },
            ],
          }),
        ).rejects.toThrow(/Enter a name for the substitute/);
      });

      it("a valid substitute is unaffected", async () => {
        const user = await createTestUser();
        userId = user.id;

        const dishId = await dishService.createDish(user.id, "RECIPE", {
          ...content(),
          sections: [
            {
              name: null,
              guidanceNote: null,
              ingredients: [
                {
                  ...blankIngredient("Soy sauce"),
                  substitute: {
                    name: "Tamari",
                    quantity: null,
                    quantityEnd: null,
                    isApproximate: false,
                    unit: null,
                    displayText: null,
                    preparationNote: null,
                  },
                },
              ],
              instructions: [],
            },
          ],
        });

        const created = await loadDishWithVersion(dishId);
        const substitute = await prisma.ingredient.findFirstOrThrow({
          where: {
            dishVersionId: created.currentVersionId!,
            substituteForIngredientId: { not: null },
          },
        });
        expect(substitute.name).toBe("Tamari");
      });
    });
  });

  // Gate 2 polish pass (docs/SLICE_3_FOLLOWUP.md): Ingredient.quantity/
  // quantityEnd are `Decimal @db.Decimal(12, 3)` — normalization to 3
  // decimal places happens in `sanitizedSectionsOrThrow` (service.ts),
  // which both `createDish` and `editDish` always pass sections through
  // regardless of whether the caller went through `dishContentSchema`
  // first — these tests call the service directly (bypassing the schema
  // entirely, as most of this file's tests do) to prove that bypass path
  // still gets normalized.
  describe("Ingredient quantity normalization (PRODUCT_SPEC.md §10.6a)", () => {
    it("normalizes unbounded fraction decimals (1/3, 2/3) to 3 places on create, surviving reload", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              ingredients: [
                {
                  ...blankIngredient("Broth"),
                  quantity: 1 / 3, // 0.3333333333333333, unvalidated
                  quantityEnd: 2 / 3, // 0.6666666666666666
                },
              ],
              instructions: [],
            },
          ],
        }),
      );

      const created = await loadDishWithVersion(dishId);
      const ingredient = created.currentVersion!.sections[0].ingredients[0];
      expect(ingredient.quantity?.toNumber()).toBe(0.333);
      expect(ingredient.quantityEnd?.toNumber()).toBe(0.667);
    });

    it("normalizes a mixed-number decimal already exact at 3 places, and rounds a decimal with more than 3 places, on edit — quantityEnd follows the same rule", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const section = dish.currentVersion!.sections[0];
      const ingredient = section.ingredients[0];

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        {
          ...content(),
          sections: [
            {
              lineageId: section.lineageId,
              name: null,
              guidanceNote: null,
              ingredients: [
                {
                  lineageId: ingredient.lineageId,
                  ...blankIngredient("Broth"),
                  quantity: 2 + 1 / 8, // 2.125 — already exact at 3 places
                  quantityEnd: 1.23456789, // more than 3 places
                },
              ],
              instructions: [],
            },
          ],
        },
        "MINOR",
      );

      const reloaded = await loadDishWithVersion(dishId);
      const reloadedIngredient =
        reloaded.currentVersion!.sections[0].ingredients[0];
      expect(reloadedIngredient.quantity?.toNumber()).toBe(2.125);
      expect(reloadedIngredient.quantityEnd?.toNumber()).toBe(1.235);
    });

    it("leaves a decimal already at or under 3 places unchanged", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              ingredients: [{ ...blankIngredient("Broth"), quantity: 1.5 }],
              instructions: [],
            },
          ],
        }),
      );

      const created = await loadDishWithVersion(dishId);
      expect(
        created.currentVersion!.sections[0].ingredients[0].quantity?.toNumber(),
      ).toBe(1.5);
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
      const source = await loadDishWithVersion(sourceId);

      const copyId = await dishService.duplicateDish(
        userId,
        sourceId,
        undefined,
      );
      expect(copyId).not.toBe(sourceId);

      const copy = await loadDishWithVersion(copyId);

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
