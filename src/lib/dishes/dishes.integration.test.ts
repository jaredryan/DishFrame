import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import {
  restoreDishSchema,
  dishContentSchema,
  type DishContentInput,
  type SectionInput,
} from "@/lib/dishes/schema";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
  PartHasLiveUsagesError,
} from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import {
  listCurrentPartUsages,
  listAttachableParts,
  getDishScopedVersionContentOrThrow,
} from "@/lib/dishes/queries";
import { versionContentToInput } from "@/lib/dishes/mappers";

// Slice 5: `deleteDish`'s reference-counted image cleanup calls
// `bestEffortDeleteBlob` (`src/lib/images/service.ts`), which calls
// `@vercel/blob`'s `del()`. These tests create `ImageAsset` rows directly
// against Postgres (no real Blob upload), so the real network call is
// mocked here — an integration test for domain/database behavior should
// never depend on, or exercise, a live external API call.
vi.mock("@vercel/blob", () => ({ del: vi.fn(async () => {}) }));

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

// Slice 6 post-gate: loads a persisted Version's content back into
// SectionInput/PartLinkInput shape via the same mapper `service.ts` itself
// uses for diffing/duplication/promotion — one shared read path, not a
// second one the new tests below could drift from.
async function loadContent(dishId: string, versionId: string) {
  const version = await getDishScopedVersionContentOrThrow(dishId, versionId);
  return versionContentToInput(version.sections, version.partLinks);
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
      position: 0,
      ingredients: [
        { lineageId: ingredient.lineageId, ...blankIngredient("Salt") },
      ],
      instructions: [],
      partLinks: [],
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
                position: 0,
                ingredients: [],
                instructions: [],
                partLinks: [],
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

    // Version-trigger correction pass, PRODUCT_SPEC.md §7.1: title is
    // stable Dish identity, not Version-owned content — a title-only edit
    // must never allocate a Version, unlike the pre-correction behavior.
    it("creates no Version for a title-only change, and updates Dish.currentTitle directly", async () => {
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
      expect(after.currentTitle).toBe("Ginger Soy Bowl (updated)");
      expect(after.currentVersionId).toBe(before.currentVersionId);
      expect(await versionCount(dishId)).toBe(1);
      // The current Version's own `title` column is an inert historical
      // mirror now — it is deliberately left untouched by a metadata-only
      // save, since only Version creation ever writes it.
      expect(after.currentVersion?.title).toBe("Ginger Soy Bowl");
    });

    it("creates exactly one minor Version for a non-cooking Version-owned change (prep time)", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const before = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        before.currentVersionId!,
        content({
          prepTimeMinutes: 15,
          sections: unchangedSections(before),
        }),
        undefined,
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersion?.majorVersion).toBe(1);
      expect(after.currentVersion?.minorVersion).toBe(1);
      expect(after.currentVersion?.prepTimeMinutes).toBe(15);
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
              position: 0,
              ingredients: [
                {
                  lineageId: originalIngredient.lineageId,
                  ...blankIngredient("Salt"),
                },
                blankIngredient("Pepper"),
              ],
              instructions: [],
              partLinks: [],
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
              position: 0,
              ingredients: [
                {
                  lineageId: originalIngredient.lineageId,
                  ...blankIngredient("Salt"),
                },
              ],
              instructions: [{ text: "Whisk everything together." }],
              partLinks: [],
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
              position: 0,
              ingredients: [blankIngredient("Salt"), blankIngredient("Pepper")],
              instructions: [],
              partLinks: [],
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
            position: 0,
            ingredients,
            instructions: [],
            partLinks: [],
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
          prepTimeMinutes: 20,
          sections: unchangedSections(before),
        }),
        undefined,
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.cuisine).toBe("Thai");
      expect(after.currentVersion?.prepTimeMinutes).toBe(20);
      expect(after.currentVersion?.minorVersion).toBe(1);
      expect(await versionCount(dishId)).toBe(2);
    });

    // Version-trigger correction pass: a title change riding along with a
    // Version-creating (non-cooking) change lands on the stable Dish, not
    // on the newly created Version's own inert `title` mirror column — the
    // Version is created only because of the non-cooking field, never
    // because of the title change itself.
    it("a title change combined with a non-cooking change updates the Dish title without a second cause for the Version", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const before = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        before.currentVersionId!,
        content({
          title: "Ginger Soy Bowl (v2)",
          prepTimeMinutes: 20,
          sections: unchangedSections(before),
        }),
        undefined,
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.currentTitle).toBe("Ginger Soy Bowl (v2)");
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
          prepTimeMinutes: 25,
          sections: unchangedSections(before),
        }),
        undefined,
      );

      const originalVersion = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: originalVersionId },
      });
      expect(originalVersion.prepTimeMinutes).toBeNull();
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
        content({
          prepTimeMinutes: 5,
          sections: unchangedSections(dish),
        }),
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
          prepTimeMinutes: 10,
          sections: unchangedSections(dish),
        }),
        undefined,
      );
      expect(newDishId).toBe(dishId);

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersion?.majorVersion).toBe(1);
      expect(after.currentVersion?.minorVersion).toBe(2);
      expect(after.currentVersion?.prepTimeMinutes).toBe(10);
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
              position: 0,
              ingredients: [blankIngredient("Ginger")],
              instructions: [],
              partLinks: [],
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
              position: 0,
              ingredients: [
                {
                  lineageId:
                    historicalBase.sections[0].ingredients[0].lineageId,
                  ...blankIngredient("Kosher salt"),
                },
              ],
              instructions: [],
              partLinks: [],
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

      // Prep-time-only change (no versionChoice needed — this is the
      // non-cooking "automatic minor" bucket, PRODUCT_SPEC.md §13.2a)
      // against the unchanged, real-lineageId content of the historical
      // line. (Title is no longer part of this bucket — Version-trigger
      // correction pass, §7.1 — so a genuine non-cooking field is used
      // here instead.)
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({
          prepTimeMinutes: 12,
          sections: [
            {
              lineageId: historicalBase.sections[0].lineageId,
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                {
                  lineageId:
                    historicalBase.sections[0].ingredients[0].lineageId,
                  ...blankIngredient("Salt"),
                },
              ],
              instructions: [],
              partLinks: [],
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
      expect(historicalLineVersions[1].prepTimeMinutes).toBe(12);
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
      // Version-trigger correction pass, PRODUCT_SPEC.md §7.1/§13.9: title
      // is stable Dish identity now, exactly like Stage — promoting V1's
      // *content* must not revert the Dish's title back to what V1 was
      // called. The current title ("A different direction", set by the
      // intervening V2.0 edit) survives the promotion untouched, and the
      // newly created V3.0's own inert `title` mirror reflects it too.
      expect(after.currentVersion?.title).toBe("A different direction");
      expect(after.currentVersion?.sourceVersionId).toBe(v1Id);
      // Slice 4 correction pass §4: promoting a historical direction seeds
      // source → result wording ending in "Revival", same as a major
      // created directly from a historical base.
      expect(after.currentVersion?.versionNote).toBe("V1.0 → V3.0: Revival");
      expect(after.currentTitle).toBe("A different direction");
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
            position: 0,
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
            partLinks: [],
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
              position: 0,
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
              partLinks: [],
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
            position: 0,
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
            partLinks: [],
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
            position: 0,
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
            partLinks: [],
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
            position: 0,
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
            partLinks: [],
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
            position: 0,
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
            partLinks: [],
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
              position: 0,
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
              partLinks: [],
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
                position: 0,
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
                partLinks: [],
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
              position: 0,
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
              partLinks: [],
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
              position: 0,
              ingredients: [
                {
                  ...blankIngredient("Broth"),
                  quantity: 1 / 3, // 0.3333333333333333, unvalidated
                  quantityEnd: 2 / 3, // 0.6666666666666666
                },
              ],
              instructions: [],
              partLinks: [],
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
              position: 0,
              ingredients: [
                {
                  lineageId: ingredient.lineageId,
                  ...blankIngredient("Broth"),
                  quantity: 2 + 1 / 8, // 2.125 — already exact at 3 places
                  quantityEnd: 1.23456789, // more than 3 places
                },
              ],
              instructions: [],
              partLinks: [],
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
              position: 0,
              ingredients: [{ ...blankIngredient("Broth"), quantity: 1.5 }],
              instructions: [],
              partLinks: [],
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

  describe("editDish — imageAssetId (Version-trigger and Slice 5 image correction pass)", () => {
    it("does not create a Version when imageAssetId is unchanged", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        content({ sections: unchangedSections(dish) }),
        undefined,
      );

      expect(await versionCount(dishId)).toBe(1);
    });

    it("adding an image creates no Version — updates the selected Version in place", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const image = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const originalVersionId = dish.currentVersionId!;

      await dishService.editDish(
        userId,
        dishId,
        originalVersionId,
        content({
          sections: unchangedSections(dish),
          imageAssetId: image.id,
        }),
        undefined,
      );

      expect(await versionCount(dishId)).toBe(1);
      const reloaded = await loadDishWithVersion(dishId);
      expect(reloaded.currentVersionId).toBe(originalVersionId);
      expect(reloaded.currentVersion?.imageAssetId).toBe(image.id);
    });

    it("replacing an image creates no Version, and the old image survives while another Version still references it", async () => {
      const user = await createTestUser();
      userId = user.id;
      const oldImage = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const newImage = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: oldImage.id }),
      );
      const dish = await loadDishWithVersion(dishId);
      // A second Dish still references oldImage — it must survive the
      // replacement below.
      await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: oldImage.id }),
      );

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        content({
          sections: unchangedSections(dish),
          imageAssetId: newImage.id,
        }),
        undefined,
      );

      expect(await versionCount(dishId)).toBe(1);
      const reloaded = await loadDishWithVersion(dishId);
      expect(reloaded.currentVersionId).toBe(dish.currentVersionId);
      expect(reloaded.currentVersion?.imageAssetId).toBe(newImage.id);

      const survivingOldImage = await prisma.imageAsset.findUnique({
        where: { id: oldImage.id },
      });
      expect(survivingOldImage).not.toBeNull();
    });

    it("removing an image creates no Version, and the old image is cleaned up once its last reference is gone", async () => {
      const user = await createTestUser();
      userId = user.id;
      const image = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: image.id }),
      );
      const dish = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        content({ sections: unchangedSections(dish), imageAssetId: null }),
        undefined,
      );

      expect(await versionCount(dishId)).toBe(1);
      const reloaded = await loadDishWithVersion(dishId);
      expect(reloaded.currentVersionId).toBe(dish.currentVersionId);
      expect(reloaded.currentVersion?.imageAssetId).toBeNull();

      const orphaned = await prisma.imageAsset.findUnique({
        where: { id: image.id },
      });
      expect(orphaned).toBeNull();
    });

    it("a material Ingredient change combined with an image change creates exactly one Version, inheriting only where not overridden", async () => {
      const user = await createTestUser();
      userId = user.id;
      const baseImage = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const newImage = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: baseImage.id }),
      );
      const dish = await loadDishWithVersion(dishId);
      const section = dish.currentVersion!.sections[0];
      const ingredient = section.ingredients[0];

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        content({
          imageAssetId: newImage.id,
          sections: [
            {
              lineageId: section.lineageId,
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                {
                  lineageId: ingredient.lineageId,
                  ...blankIngredient("Kosher salt"),
                },
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );

      expect(await versionCount(dishId)).toBe(2);
      const reloaded = await loadDishWithVersion(dishId);
      expect(reloaded.currentVersion?.imageAssetId).toBe(newImage.id);
      // The base Version keeps its own original image, untouched.
      const baseVersion = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: dish.currentVersionId! },
      });
      expect(baseVersion.imageAssetId).toBe(baseImage.id);
    });

    it("a material Version with no explicit image override inherits the selected base Version's image", async () => {
      const user = await createTestUser();
      userId = user.id;
      const image = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: image.id }),
      );
      const dish = await loadDishWithVersion(dishId);
      const section = dish.currentVersion!.sections[0];
      const ingredient = section.ingredients[0];

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        content({
          imageAssetId: image.id, // untouched — same as the base's own value
          sections: [
            {
              lineageId: section.lineageId,
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                {
                  lineageId: ingredient.lineageId,
                  ...blankIngredient("Kosher salt"),
                },
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );

      const reloaded = await loadDishWithVersion(dishId);
      expect(reloaded.currentVersion?.imageAssetId).toBe(image.id);
    });
  });

  describe("editDish/createDish — image attach authorization (Version-trigger and Slice 5 image correction pass §4)", () => {
    it("rejects attaching another user's unreferenced uploaded asset on create", async () => {
      const owner = await createTestUser();
      const uploader = await createTestUser();
      userId = owner.id;
      const foreignImage = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: uploader.id,
        },
      });

      await expect(
        dishService.createDish(
          owner.id,
          "RECIPE",
          content({ imageAssetId: foreignImage.id }),
        ),
      ).rejects.toThrow(AuthorizationError);

      await deleteTestUser(uploader.id);
    });

    it("rejects attaching another user's unreferenced uploaded asset on edit", async () => {
      const owner = await createTestUser();
      const uploader = await createTestUser();
      userId = owner.id;
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const dish = await loadDishWithVersion(dishId);
      const foreignImage = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: uploader.id,
        },
      });

      await expect(
        dishService.editDish(
          owner.id,
          dishId,
          dish.currentVersionId!,
          content({
            sections: unchangedSections(dish),
            imageAssetId: foreignImage.id,
          }),
          undefined,
        ),
      ).rejects.toThrow(AuthorizationError);
      expect(await versionCount(dishId)).toBe(1);

      await deleteTestUser(uploader.id);
    });

    it("allows a legitimate cross-account duplicate owner to reuse an already-referenced shared asset", async () => {
      const original = await createTestUser();
      const duplicator = await createTestUser();
      userId = duplicator.id;
      const image = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: original.id,
        },
      });
      await dishService.createDish(
        original.id,
        "RECIPE",
        content({ imageAssetId: image.id }),
      );

      // Tier 1 has no cross-account duplication/accept-share flow yet
      // (PRODUCT_SPEC.md §18/§95.2 — that's Tier 2 scope); `duplicateDish`
      // is strictly intra-account, since its `ownerId` param must already
      // own the source Dish. To exercise the cross-account branch of
      // `assertImageAssetAttachable` (a DishVersion this owner owns already
      // references the asset, even though a different user uploaded it),
      // construct that precondition directly at the data level, simulating
      // what a future accepted cross-account share/duplicate would produce.
      const duplicatedDish = await prisma.dish.create({
        data: {
          ownerId: duplicator.id,
          kind: "RECIPE",
          currentTitle: "Copy of Ginger Soy Bowl",
        },
      });
      const duplicatedVersion = await prisma.dishVersion.create({
        data: {
          dishId: duplicatedDish.id,
          majorVersion: 1,
          minorVersion: 0,
          title: "Copy of Ginger Soy Bowl",
          imageAssetId: image.id,
        },
      });
      await prisma.dish.update({
        where: { id: duplicatedDish.id },
        data: { currentVersionId: duplicatedVersion.id },
      });
      const duplicatedDishId = duplicatedDish.id;

      // A second, brand-new Recipe by the same duplicator may now legitimately
      // reuse that same shared asset via ordinary create — allowed because a
      // DishVersion this owner owns already references it.
      const secondDishId = await dishService.createDish(
        duplicator.id,
        "RECIPE",
        content({ imageAssetId: image.id }),
      );

      const secondDish = await loadDishWithVersion(secondDishId);
      expect(secondDish.currentVersion?.imageAssetId).toBe(image.id);

      await dishService.deleteDish(duplicator.id, duplicatedDishId);
      await dishService.deleteDish(duplicator.id, secondDishId);
      await deleteTestUser(original.id);
    });
  });

  describe("editDish — description (Version-trigger correction pass, PRODUCT_SPEC.md §7.2)", () => {
    it("a description-only change through the full editor creates no Version", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        content({
          description: "A weeknight favorite.",
          sections: unchangedSections(dish),
        }),
        undefined,
      );

      expect(await versionCount(dishId)).toBe(1);
      const reloaded = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: dish.currentVersionId! },
      });
      expect(reloaded.description).toBe("A weeknight favorite.");
    });

    it("a material Ingredient change combined with a description change creates exactly one Version carrying the new description, leaving the base Version's own description untouched", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ description: "Original description." }),
      );
      const dish = await loadDishWithVersion(dishId);
      const section = dish.currentVersion!.sections[0];
      const ingredient = section.ingredients[0];

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        content({
          description: "Updated for the new direction.",
          sections: [
            {
              lineageId: section.lineageId,
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                {
                  lineageId: ingredient.lineageId,
                  ...blankIngredient("Kosher salt"),
                },
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );

      expect(await versionCount(dishId)).toBe(2);
      const reloaded = await loadDishWithVersion(dishId);
      expect(reloaded.currentVersion?.description).toBe(
        "Updated for the new direction.",
      );
      const baseVersion = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: dish.currentVersionId! },
      });
      expect(baseVersion.description).toBe("Original description.");
    });

    it("a material Version with no explicit description override inherits the selected base Version's description", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ description: "Carried forward." }),
      );
      const dish = await loadDishWithVersion(dishId);
      const section = dish.currentVersion!.sections[0];
      const ingredient = section.ingredients[0];

      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        content({
          description: "Carried forward.", // untouched — same as the base's own value
          sections: [
            {
              lineageId: section.lineageId,
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                {
                  lineageId: ingredient.lineageId,
                  ...blankIngredient("Kosher salt"),
                },
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );

      const reloaded = await loadDishWithVersion(dishId);
      expect(reloaded.currentVersion?.description).toBe("Carried forward.");
    });
  });

  describe("promoteHistoricalVersion — imageAssetId (Slice 5)", () => {
    it("copies the historical Version's image verbatim", async () => {
      const user = await createTestUser();
      userId = user.id;
      const image = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: image.id }),
      );
      const dish = await loadDishWithVersion(dishId);

      await dishService.promoteHistoricalVersion(
        userId,
        dishId,
        dish.currentVersionId!,
      );

      const reloaded = await loadDishWithVersion(dishId);
      expect(reloaded.currentVersion?.imageAssetId).toBe(image.id);
    });
  });

  describe("duplicateDish — imageAssetId (Slice 5)", () => {
    it("shares the same ImageAsset row as its source rather than copying it", async () => {
      const user = await createTestUser();
      userId = user.id;
      const image = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: image.id }),
      );

      const newDishId = await dishService.duplicateDish(
        userId,
        dishId,
        undefined,
      );

      const duplicated = await loadDishWithVersion(newDishId);
      expect(duplicated.currentVersion?.imageAssetId).toBe(image.id);
    });
  });

  describe("deleteDish — image reference-counted cleanup (Slice 5)", () => {
    it("deletes the ImageAsset once its last referencing Dish is deleted", async () => {
      const user = await createTestUser();
      userId = user.id;
      const image = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: image.id }),
      );

      await dishService.deleteDish(userId, dishId);

      const reloadedImage = await prisma.imageAsset.findUnique({
        where: { id: image.id },
      });
      expect(reloadedImage).toBeNull();
    });

    it("does not delete an ImageAsset still referenced by a surviving duplicate", async () => {
      const user = await createTestUser();
      userId = user.id;
      const image = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: image.id }),
      );
      const duplicateDishId = await dishService.duplicateDish(
        userId,
        dishId,
        undefined,
      );

      await dishService.deleteDish(userId, dishId);

      const stillReferenced = await prisma.imageAsset.findUnique({
        where: { id: image.id },
      });
      expect(stillReferenced).not.toBeNull();

      await dishService.deleteDish(userId, duplicateDishId);

      const nowOrphaned = await prisma.imageAsset.findUnique({
        where: { id: image.id },
      });
      expect(nowOrphaned).toBeNull();
    });
  });

  describe("updateVersionMetadata (Version-trigger correction pass, PRODUCT_SPEC.md §7.2)", () => {
    it("updates the current Version's description in place, creating no Version", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);

      await dishService.updateVersionMetadata(
        userId,
        dishId,
        dish.currentVersionId!,
        {
          description: "Tastes best the next day.",
          imageAssetId: null,
        },
      );

      expect(await versionCount(dishId)).toBe(1);
      const reloaded = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: dish.currentVersionId! },
      });
      expect(reloaded.description).toBe("Tastes best the next day.");
    });

    it("updates a historical Version's description in place without mutating its Ingredients/Instructions/Sections, or moving currentVersionId", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const v1 = await loadDishWithVersion(dishId);
      const v1Id = v1.currentVersionId!;
      const originalIngredientLineageId =
        v1.currentVersion!.sections[0].ingredients[0].lineageId;

      // Advance to V2.0 (a material change) so v1Id becomes historical.
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [blankIngredient("Ginger")],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MAJOR",
      );
      const afterMajor = await loadDishWithVersion(dishId);
      expect(afterMajor.currentVersionId).not.toBe(v1Id);

      await dishService.updateVersionMetadata(userId, dishId, v1Id, {
        description: "The original direction.",
        imageAssetId: null,
      });

      const stillCurrent = await loadDishWithVersion(dishId);
      expect(stillCurrent.currentVersionId).toBe(afterMajor.currentVersionId);
      expect(await versionCount(dishId)).toBe(2);

      const historicalVersion = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: v1Id },
        include: { sections: { include: { ingredients: true } } },
      });
      expect(historicalVersion.description).toBe("The original direction.");
      expect(historicalVersion.sections[0].ingredients[0].lineageId).toBe(
        originalIngredientLineageId,
      );
      expect(historicalVersion.sections[0].ingredients[0].name).toBe("Salt");
    });

    it("replacing the image does not change currentVersionId, sourceVersionId, or version numbering", async () => {
      const user = await createTestUser();
      userId = user.id;
      const oldImage = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const newImage = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: user.id,
        },
      });
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ imageAssetId: oldImage.id }),
      );
      const before = await loadDishWithVersion(dishId);

      await dishService.updateVersionMetadata(
        userId,
        dishId,
        before.currentVersionId!,
        { description: null, imageAssetId: newImage.id },
      );

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersionId).toBe(before.currentVersionId);
      expect(after.currentVersion?.sourceVersionId).toBeNull();
      expect(after.currentVersion?.majorVersion).toBe(1);
      expect(after.currentVersion?.minorVersion).toBe(0);
      expect(after.currentVersion?.imageAssetId).toBe(newImage.id);
    });

    it("rejects an unrelated user's unreferenced image on a metadata update", async () => {
      const owner = await createTestUser();
      const uploader = await createTestUser();
      userId = owner.id;
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const dish = await loadDishWithVersion(dishId);
      const foreignImage = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.jpg`,
          uploadedByUserId: uploader.id,
        },
      });

      await expect(
        dishService.updateVersionMetadata(
          owner.id,
          dishId,
          dish.currentVersionId!,
          {
            description: null,
            imageAssetId: foreignImage.id,
          },
        ),
      ).rejects.toThrow(AuthorizationError);

      await deleteTestUser(uploader.id);
    });

    it("rejects cross-user metadata edits with NotFoundError", async () => {
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
        dishService.updateVersionMetadata(
          intruder.id,
          dishId,
          dish.currentVersionId!,
          {
            description: "Not yours",
            imageAssetId: null,
          },
        ),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });

  describe("setDefaultBatchScale (Slice 5)", () => {
    it("sets and resets the Dish's default batch scale without creating a Version", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ yieldQuantity: 6, yieldUnit: "servings" }),
      );

      await dishService.setDefaultBatchScale(userId, dishId, 9, "servings");
      let dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
      expect(decimalToNumber(dish.defaultBatchQuantity)).toBe(9);
      expect(dish.defaultBatchUnit).toBe("servings");
      expect(await versionCount(dishId)).toBe(1);

      await dishService.setDefaultBatchScale(userId, dishId, null, null);
      dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
      expect(dish.defaultBatchQuantity).toBeNull();
      expect(dish.defaultBatchUnit).toBeNull();
    });

    it("rejects cross-user access with NotFoundError", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );

      await expect(
        dishService.setDefaultBatchScale(intruder.id, dishId, 9, null),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });

  describe("savePreferredUnitOverride / clearPreferredUnitOverride (Slice 5)", () => {
    it("upserts by (dishId, ingredientLineageId) and clears back to the authored unit", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const lineageId =
        dish.currentVersion!.sections[0].ingredients[0].lineageId;

      await dishService.savePreferredUnitOverride(
        userId,
        dishId,
        lineageId,
        "cup",
      );
      let overrides = await prisma.preferredUnitOverride.findMany({
        where: { dishId },
      });
      expect(overrides).toHaveLength(1);
      expect(overrides[0].unit).toBe("cup");

      await dishService.savePreferredUnitOverride(
        userId,
        dishId,
        lineageId,
        "tbsp",
      );
      overrides = await prisma.preferredUnitOverride.findMany({
        where: { dishId },
      });
      expect(overrides).toHaveLength(1);
      expect(overrides[0].unit).toBe("tbsp");

      await dishService.clearPreferredUnitOverride(userId, dishId, lineageId);
      overrides = await prisma.preferredUnitOverride.findMany({
        where: { dishId },
      });
      expect(overrides).toHaveLength(0);
    });

    it("targets one ingredient lineage without affecting a different one", async () => {
      const user = await createTestUser();
      userId = user.id;
      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const lineageId =
        dish.currentVersion!.sections[0].ingredients[0].lineageId;

      await dishService.savePreferredUnitOverride(
        userId,
        dishId,
        lineageId,
        "cup",
      );
      await dishService.savePreferredUnitOverride(
        userId,
        dishId,
        "a-different-ingredient-lineage-id",
        "kg",
      );

      const overrides = await prisma.preferredUnitOverride.findMany({
        where: { dishId },
        orderBy: { unit: "asc" },
      });
      expect(overrides.map((o) => o.unit)).toEqual(["cup", "kg"]);
    });

    it("rejects cross-user access with NotFoundError", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const dish = await loadDishWithVersion(dishId);
      const lineageId =
        dish.currentVersion!.sections[0].ingredients[0].lineageId;

      await expect(
        dishService.savePreferredUnitOverride(
          intruder.id,
          dishId,
          lineageId,
          "cup",
        ),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });
});

// Slice 6 pre-gate scope (Build Plan Review Gate 3): Part attach/detach via
// the ordinary editDish content pipeline, the authoritative save-time cycle
// re-check, verbatim copy through duplicate/promote, and usage discovery.
// Propagation and deletion materialization are out of scope until the gate.
describe("Slice 6 — linked Parts", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  async function createPart(ownerId: string, title: string) {
    return dishService.createDish(
      ownerId,
      "PART",
      content({ title, partLinks: [] }),
    );
  }

  describe("editDish — attaching and detaching", () => {
    it("attaching a top-level Part requires the minor/major choice and persists a LIVE PartLink", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await createPart(userId, "Nuoc Cham");
      const partVersionId = (
        await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
      ).currentVersionId!;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const baseVersionId = dish.currentVersionId!;

      await expect(
        dishService.editDish(
          userId,
          dishId,
          baseVersionId,
          {
            ...content({ sections: unchangedSections(dish) }),
            partLinks: [
              {
                targetDishId: partDishId,
                targetDishVersionId: partVersionId,
                position: 0,
                multiplier: 1,
              },
            ],
          },
          undefined,
        ),
      ).rejects.toThrow(ValidationError);

      const newDishId = await dishService.editDish(
        userId,
        dishId,
        baseVersionId,
        {
          ...content({ sections: unchangedSections(dish) }),
          partLinks: [
            {
              targetDishId: partDishId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        },
        "MINOR",
      );

      const after = await prisma.dish.findUniqueOrThrow({
        where: { id: newDishId },
        include: { currentVersion: { include: { partLinks: true } } },
      });
      expect(after.currentVersion?.majorVersion).toBe(1);
      expect(after.currentVersion?.minorVersion).toBe(1);
      expect(after.currentVersion?.partLinks).toHaveLength(1);
      expect(after.currentVersion?.partLinks[0]).toMatchObject({
        linkState: "LIVE",
        sectionId: null,
        targetDishId: partDishId,
        targetDishVersionId: partVersionId,
      });
    });

    it("detaching (removing) a linked Part is a cooking change and leaves no PartLink on the new Version", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await createPart(userId, "Nuoc Cham");
      const partVersionId = (
        await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
      ).currentVersionId!;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      let dish = await loadDishWithVersion(dishId);
      const v1Id = dish.currentVersionId!;

      const v2DishId = await dishService.editDish(
        userId,
        dishId,
        v1Id,
        {
          ...content({ sections: unchangedSections(dish) }),
          partLinks: [
            {
              targetDishId: partDishId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        },
        "MINOR",
      );
      const v2 = await prisma.dish.findUniqueOrThrow({
        where: { id: v2DishId },
      });

      dish = await loadDishWithVersion(dishId);
      await expect(
        dishService.editDish(
          userId,
          dishId,
          v2.currentVersionId!,
          { ...content({ sections: unchangedSections(dish) }), partLinks: [] },
          undefined,
        ),
      ).rejects.toThrow(ValidationError);

      await dishService.editDish(
        userId,
        dishId,
        v2.currentVersionId!,
        { ...content({ sections: unchangedSections(dish) }), partLinks: [] },
        "MINOR",
      );

      const after = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
        include: { currentVersion: { include: { partLinks: true } } },
      });
      expect(after.currentVersion?.minorVersion).toBe(2);
      expect(after.currentVersion?.partLinks).toHaveLength(0);
    });

    it("rejects a save that would create a Part cycle, authoritatively, at save time", async () => {
      const user = await createTestUser();
      userId = user.id;

      const partBId = await createPart(userId, "Part B");
      const partBV1 = (
        await prisma.dish.findUniqueOrThrow({ where: { id: partBId } })
      ).currentVersionId!;

      const partAId = await createPart(userId, "Part A");
      const partAV1 = (
        await prisma.dish.findUniqueOrThrow({ where: { id: partAId } })
      ).currentVersionId!;

      // Part A attaches Part B — legitimate, no cycle. This creates a new
      // Version (V1.1) for Part A; the link lives on that new Version, not
      // on the original, still-unchanged V1.0 (`partAV1`).
      const partADish = await loadDishWithVersion(partAId);
      await dishService.editDish(
        userId,
        partAId,
        partAV1,
        {
          ...content({
            title: "Part A",
            sections: unchangedSections(partADish),
          }),
          partLinks: [
            {
              targetDishId: partBId,
              targetDishVersionId: partBV1,
              position: 0,
              multiplier: 1,
            },
          ],
        },
        "MINOR",
        "PART",
      );
      const partACurrentVersionId = (
        await prisma.dish.findUniqueOrThrow({ where: { id: partAId } })
      ).currentVersionId!;

      // Now attempt to make Part B attach Part A's *current* Version (the
      // one that actually contains the link to Part B) — B -> A -> B, a
      // real cycle.
      const partBDish = await loadDishWithVersion(partBId);
      await expect(
        dishService.editDish(
          userId,
          partBId,
          partBV1,
          {
            ...content({
              title: "Part B",
              sections: unchangedSections(partBDish),
            }),
            partLinks: [
              {
                targetDishId: partAId,
                targetDishVersionId: partACurrentVersionId,
                position: 0,
                multiplier: 1,
              },
            ],
          },
          "MINOR",
          "PART",
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("duplicateDish and promoteHistoricalVersion — verbatim PartLink copy", () => {
    it("duplicateDish copies the same live target reference, not a new Part", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await createPart(userId, "Nuoc Cham");
      const partVersionId = (
        await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
      ).currentVersionId!;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        {
          ...content({ sections: unchangedSections(dish) }),
          partLinks: [
            {
              targetDishId: partDishId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        },
        "MINOR",
      );

      const duplicateId = await dishService.duplicateDish(
        userId,
        dishId,
        undefined,
      );
      const duplicate = await prisma.dish.findUniqueOrThrow({
        where: { id: duplicateId },
        include: { currentVersion: { include: { partLinks: true } } },
      });

      expect(duplicate.currentVersion?.partLinks).toHaveLength(1);
      expect(duplicate.currentVersion?.partLinks[0].targetDishId).toBe(
        partDishId,
      );
      expect(duplicate.currentVersion?.partLinks[0].targetDishVersionId).toBe(
        partVersionId,
      );
    });

    it("promoteHistoricalVersion copies the historical Version's PartLinks verbatim", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await createPart(userId, "Nuoc Cham");
      const partVersionId = (
        await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
      ).currentVersionId!;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);
      const v1Id = dish.currentVersionId!;
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        {
          ...content({ sections: unchangedSections(dish) }),
          partLinks: [
            {
              targetDishId: partDishId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        },
        "MINOR",
      );

      await dishService.promoteHistoricalVersion(userId, dishId, v1Id);

      const after = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
        include: { currentVersion: { include: { partLinks: true } } },
      });
      // V1.0 had no PartLinks — promoting it verbatim means the new
      // current Version has none either, even though V1.1 (still saved,
      // untouched) has one.
      expect(after.currentVersion?.majorVersion).toBe(2);
      expect(after.currentVersion?.partLinks).toHaveLength(0);
    });
  });

  describe("listCurrentPartUsages and listAttachableParts", () => {
    it("finds the current usage of a Part, with its container's title and Section placement", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await createPart(userId, "Nuoc Cham");
      const partVersionId = (
        await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
      ).currentVersionId!;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ title: "Grilled Pork" }),
      );
      const dish = await loadDishWithVersion(dishId);
      await dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        {
          ...content({
            title: "Grilled Pork",
            sections: unchangedSections(dish),
          }),
          partLinks: [
            {
              targetDishId: partDishId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        },
        "MINOR",
      );

      const usages = await listCurrentPartUsages(userId, partDishId);
      expect(usages).toHaveLength(1);
      expect(usages[0]).toMatchObject({
        containerDishId: dishId,
        containerKind: "RECIPE",
        containerTitle: "Grilled Pork",
        targetDishVersionId: partVersionId,
        sectionName: null, // top-level occurrence
      });
    });

    it("does not include a Part that has no current usages", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await createPart(userId, "Unused Part");

      expect(await listCurrentPartUsages(userId, partDishId)).toEqual([]);
    });

    it("excludes the Part currently being edited from its own attach picker", async () => {
      const user = await createTestUser();
      userId = user.id;
      const partDishId = await createPart(userId, "Toasted Almonds");
      await createPart(userId, "Nuoc Cham");

      const attachable = await listAttachableParts(userId, partDishId);
      expect(attachable.map((p) => p.id)).not.toContain(partDishId);
      expect(attachable.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// Slice 6 post-gate (Build Plan Review Gate 3): unified Section/PartLink
// position, duplicate-target rejection, propagation, and the two-phase
// Part-deletion flow — docs/SLICE_6.md.
describe("Slice 6 post-gate — unified position round-trip", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  async function createPart(ownerId: string, title: string) {
    return dishService.createDish(
      ownerId,
      "PART",
      content({ title, partLinks: [] }),
    );
  }

  // Section pos 0, PartLink pos 1, Section pos 2 — deliberately interleaved
  // so a round-trip that merely preserved array order (rather than each
  // row's own explicit `position`) would fail these assertions.
  function interleavedContent(
    partDishId: string,
    partVersionId: string,
  ): DishContentInput {
    return {
      ...content(),
      sections: [
        {
          name: "First",
          guidanceNote: null,
          position: 0,
          ingredients: [blankIngredient("Salt")],
          instructions: [],
          partLinks: [],
        },
        {
          name: "Second",
          guidanceNote: null,
          position: 2,
          ingredients: [blankIngredient("Pepper")],
          instructions: [],
          partLinks: [],
        },
      ],
      partLinks: [
        {
          targetDishId: partDishId,
          targetDishVersionId: partVersionId,
          position: 1,
          multiplier: 1,
        },
      ],
    };
  }

  function expectInterleavedPositions(loaded: {
    sections: SectionInput[];
    partLinks: { position: number }[];
  }) {
    const byName = new Map(loaded.sections.map((s) => [s.name, s.position]));
    expect(byName.get("First")).toBe(0);
    expect(byName.get("Second")).toBe(2);
    expect(loaded.partLinks[0]?.position).toBe(1);
  }

  it("persists interleaved Section/PartLink positions on create", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPart(userId, "Nuoc Cham");
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      interleavedContent(partDishId, partVersionId),
    );
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    expectInterleavedPositions(
      await loadContent(dishId, dish.currentVersionId!),
    );
  });

  it("preserves positions through an edit that carries the same content forward", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPart(userId, "Nuoc Cham");
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      interleavedContent(partDishId, partVersionId),
    );
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    const before = await loadContent(dishId, dish.currentVersionId!);

    await dishService.editDish(
      userId,
      dishId,
      dish.currentVersionId!,
      {
        ...content(),
        sections: before.sections,
        partLinks: before.partLinks,
        prepTimeMinutes: 10,
      },
      undefined,
    );

    const after = await prisma.dish.findUniqueOrThrow({
      where: { id: dishId },
    });
    expectInterleavedPositions(
      await loadContent(dishId, after.currentVersionId!),
    );
  });

  it("preserves positions through duplicateDish", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPart(userId, "Nuoc Cham");
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      interleavedContent(partDishId, partVersionId),
    );
    const duplicateId = await dishService.duplicateDish(
      userId,
      dishId,
      undefined,
    );
    const duplicate = await prisma.dish.findUniqueOrThrow({
      where: { id: duplicateId },
    });
    expectInterleavedPositions(
      await loadContent(duplicateId, duplicate.currentVersionId!),
    );
  });

  it("preserves positions through promoteHistoricalVersion", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPart(userId, "Nuoc Cham");
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      interleavedContent(partDishId, partVersionId),
    );
    const v1 = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    const v1Id = v1.currentVersionId!;

    // Advances current away from V1 so promotion has something to do.
    await dishService.editDish(
      userId,
      dishId,
      v1Id,
      content({ title: "Different direction" }),
      "MAJOR",
    );

    await dishService.promoteHistoricalVersion(userId, dishId, v1Id);

    const after = await prisma.dish.findUniqueOrThrow({
      where: { id: dishId },
    });
    expectInterleavedPositions(
      await loadContent(dishId, after.currentVersionId!),
    );
  });
});

describe("Slice 6 post-gate — duplicate Part target rejection", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("rejects createDish with the same Part linked twice at the top level", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await dishService.createDish(
      userId,
      "PART",
      content({ title: "Nuoc Cham", partLinks: [] }),
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    await expect(
      dishService.createDish(userId, "RECIPE", {
        ...content(),
        partLinks: [
          {
            targetDishId: partDishId,
            targetDishVersionId: partVersionId,
            position: 0,
            multiplier: 1,
          },
          {
            targetDishId: partDishId,
            targetDishVersionId: partVersionId,
            position: 1,
            multiplier: 1,
          },
        ],
      }),
    ).rejects.toThrow(/already linked/);
  });

  it("rejects editDish with the same Part linked top-level and nested in a Section", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await dishService.createDish(
      userId,
      "PART",
      content({ title: "Nuoc Cham", partLinks: [] }),
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    const dishId = await dishService.createDish(userId, "RECIPE", content());
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });

    await expect(
      dishService.editDish(
        userId,
        dishId,
        dish.currentVersionId!,
        {
          ...content({
            sections: [
              {
                name: null,
                guidanceNote: null,
                position: 0,
                ingredients: [],
                instructions: [],
                partLinks: [
                  {
                    targetDishId: partDishId,
                    targetDishVersionId: partVersionId,
                    position: 0,
                    multiplier: 1,
                  },
                ],
              },
            ],
          }),
          partLinks: [
            {
              targetDishId: partDishId,
              targetDishVersionId: partVersionId,
              position: 1,
              multiplier: 1,
            },
          ],
        },
        "MINOR",
      ),
    ).rejects.toThrow(/already linked/);
  });
});

describe("Slice 6 post-gate — propagatePartUpdate", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  async function createPart(ownerId: string, title: string) {
    return dishService.createDish(
      ownerId,
      "PART",
      content({ title, partLinks: [] }),
    );
  }

  async function attachPartTopLevel(
    ownerId: string,
    containerDishId: string,
    partDishId: string,
    partVersionId: string,
    multiplier: number,
    kind?: "RECIPE" | "PART",
  ) {
    const dish = await loadDishWithVersion(containerDishId);
    const container = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    await dishService.editDish(
      ownerId,
      containerDishId,
      container.currentVersionId!,
      {
        ...content({ sections: unchangedSections(dish) }),
        partLinks: [
          {
            targetDishId: partDishId,
            targetDishVersionId: partVersionId,
            position: 0,
            multiplier,
          },
        ],
      },
      "MINOR",
      kind,
    );
  }

  it("updates a container to a newer Part Version, and a repeat call on the now-current occurrence is skipped", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPart(userId, "Marinade Base");
    const v1Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;
    await dishService.editDish(
      userId,
      partDishId,
      v1Id,
      content({ title: "Marinade Base", prepTimeMinutes: 5 }),
      "MINOR",
      "PART",
    );
    const v2Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;
    expect(v2Id).not.toBe(v1Id);

    const containerId = await dishService.createDish(
      userId,
      "RECIPE",
      content(),
    );
    await attachPartTopLevel(userId, containerId, partDishId, v1Id, 2);
    const containerBefore = await prisma.dish.findUniqueOrThrow({
      where: { id: containerId },
    });
    const occurrenceLineageId = (
      await loadContent(containerId, containerBefore.currentVersionId!)
    ).partLinks[0].lineageId!;

    const outcomes = await dishService.propagatePartUpdate(
      userId,
      partDishId,
      v2Id,
      [{ containerDishId: containerId, lineageIds: [occurrenceLineageId] }],
    );
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      containerDishId: containerId,
      status: "updated",
    });
    expect(
      (outcomes[0] as { newVersionId?: string }).newVersionId,
    ).toBeTruthy();

    const containerAfter = await prisma.dish.findUniqueOrThrow({
      where: { id: containerId },
    });
    const afterContent = await loadContent(
      containerId,
      containerAfter.currentVersionId!,
    );
    expect(afterContent.partLinks[0].targetDishVersionId).toBe(v2Id);
    expect(afterContent.partLinks[0].multiplier).toBe(2);
    expect(afterContent.partLinks[0].position).toBe(0);
    expect(afterContent.partLinks[0].lineageId).toBe(occurrenceLineageId);

    // Already current — repeating the exact same call is a no-op.
    const secondOutcomes = await dishService.propagatePartUpdate(
      userId,
      partDishId,
      v2Id,
      [{ containerDishId: containerId, lineageIds: [occurrenceLineageId] }],
    );
    expect(secondOutcomes[0]).toMatchObject({
      containerDishId: containerId,
      status: "skipped",
    });
  });

  it("fails a single occurrence when accepting the update would introduce a Part cycle, without corrupting state", async () => {
    const user = await createTestUser();
    userId = user.id;

    const containerPartId = await createPart(userId, "Container Part");
    const containerV1Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: containerPartId } })
    ).currentVersionId!;

    const partId = await createPart(userId, "Updatable Part");
    const partV1Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partId } })
    ).currentVersionId!;

    // Part's V2 links to Container Part's current Version — no cycle yet,
    // since Container Part doesn't link back to Part at this point.
    const partDish = await loadDishWithVersion(partId);
    await dishService.editDish(
      userId,
      partId,
      partV1Id,
      {
        ...content({
          title: "Updatable Part",
          sections: unchangedSections(partDish),
        }),
        partLinks: [
          {
            targetDishId: containerPartId,
            targetDishVersionId: containerV1Id,
            position: 0,
            multiplier: 1,
          },
        ],
      },
      "MINOR",
      "PART",
    );
    const partV2Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partId } })
    ).currentVersionId!;

    // Container Part now legitimately attaches Part at V1 — no cycle yet,
    // since Part's V1 (unlike its V2) has no links back to Container Part.
    await attachPartTopLevel(
      userId,
      containerPartId,
      partId,
      partV1Id,
      1,
      "PART",
    );
    const containerBefore = await prisma.dish.findUniqueOrThrow({
      where: { id: containerPartId },
    });
    const occurrenceLineageId = (
      await loadContent(containerPartId, containerBefore.currentVersionId!)
    ).partLinks[0].lineageId!;

    const outcomes = await dishService.propagatePartUpdate(
      userId,
      partId,
      partV2Id,
      [{ containerDishId: containerPartId, lineageIds: [occurrenceLineageId] }],
    );
    expect(outcomes[0].status).toBe("failed");

    // State is untouched — still pointing at V1, no stray Version created.
    const containerAfter = await prisma.dish.findUniqueOrThrow({
      where: { id: containerPartId },
    });
    expect(containerAfter.currentVersionId).toBe(
      containerBefore.currentVersionId,
    );
    const afterContent = await loadContent(
      containerPartId,
      containerAfter.currentVersionId!,
    );
    expect(afterContent.partLinks[0].targetDishVersionId).toBe(partV1Id);
  });

  it("propagates independently across multiple containers in one call — one succeeds while another fails", async () => {
    const user = await createTestUser();
    userId = user.id;

    const containerPartId = await createPart(userId, "Container Part");
    const containerV1Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: containerPartId } })
    ).currentVersionId!;

    const partId = await createPart(userId, "Shared Part");
    const partV1Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partId } })
    ).currentVersionId!;

    // Shared Part's V2 links to Container Part — sets up the eventual
    // cycle, same reasoning as the single-container test above.
    const partDish = await loadDishWithVersion(partId);
    await dishService.editDish(
      userId,
      partId,
      partV1Id,
      {
        ...content({
          title: "Shared Part",
          sections: unchangedSections(partDish),
        }),
        partLinks: [
          {
            targetDishId: containerPartId,
            targetDishVersionId: containerV1Id,
            position: 0,
            multiplier: 1,
          },
        ],
      },
      "MINOR",
      "PART",
    );
    const partV2Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partId } })
    ).currentVersionId!;

    // A plain Recipe container — cycle checks never apply to Recipes, so
    // updating this one will succeed.
    const recipeId = await dishService.createDish(userId, "RECIPE", content());
    await attachPartTopLevel(userId, recipeId, partId, partV1Id, 1);
    const recipeBefore = await prisma.dish.findUniqueOrThrow({
      where: { id: recipeId },
    });
    const recipeLineageId = (
      await loadContent(recipeId, recipeBefore.currentVersionId!)
    ).partLinks[0].lineageId!;

    // Container Part attaches Shared Part at V1 — legitimate at this point.
    await attachPartTopLevel(
      userId,
      containerPartId,
      partId,
      partV1Id,
      1,
      "PART",
    );
    const containerBefore = await prisma.dish.findUniqueOrThrow({
      where: { id: containerPartId },
    });
    const containerLineageId = (
      await loadContent(containerPartId, containerBefore.currentVersionId!)
    ).partLinks[0].lineageId!;

    const outcomes = await dishService.propagatePartUpdate(
      userId,
      partId,
      partV2Id,
      [
        { containerDishId: recipeId, lineageIds: [recipeLineageId] },
        { containerDishId: containerPartId, lineageIds: [containerLineageId] },
      ],
    );

    const recipeOutcome = outcomes.find((o) => o.containerDishId === recipeId)!;
    const containerOutcome = outcomes.find(
      (o) => o.containerDishId === containerPartId,
    )!;
    expect(recipeOutcome.status).toBe("updated");
    expect(containerOutcome.status).toBe("failed");

    // The successful outcome actually persisted, independent of the failure.
    const recipeAfter = await prisma.dish.findUniqueOrThrow({
      where: { id: recipeId },
    });
    const recipeContent = await loadContent(
      recipeId,
      recipeAfter.currentVersionId!,
    );
    expect(recipeContent.partLinks[0].targetDishVersionId).toBe(partV2Id);

    // The failed container is entirely untouched.
    const containerAfter = await prisma.dish.findUniqueOrThrow({
      where: { id: containerPartId },
    });
    expect(containerAfter.currentVersionId).toBe(
      containerBefore.currentVersionId,
    );
  });

  it("does not process a container the caller does not own", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;

    const partId = await createPart(owner.id, "Owned Part");
    const partV1Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partId } })
    ).currentVersionId!;
    await dishService.editDish(
      owner.id,
      partId,
      partV1Id,
      content({ title: "Owned Part", prepTimeMinutes: 5 }),
      "MINOR",
      "PART",
    );
    const partV2Id = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partId } })
    ).currentVersionId!;

    const intruderDishId = await dishService.createDish(
      intruder.id,
      "RECIPE",
      content(),
    );
    const intruderDishBefore = await prisma.dish.findUniqueOrThrow({
      where: { id: intruderDishId },
    });

    const outcomes = await dishService.propagatePartUpdate(
      owner.id,
      partId,
      partV2Id,
      [{ containerDishId: intruderDishId, lineageIds: ["does-not-matter"] }],
    );
    expect(outcomes[0].status).toBe("failed");

    const intruderDishAfter = await prisma.dish.findUniqueOrThrow({
      where: { id: intruderDishId },
    });
    expect(intruderDishAfter.currentVersionId).toBe(
      intruderDishBefore.currentVersionId,
    );

    await deleteTestUser(intruder.id);
  });
});

describe("Slice 6 post-gate — resolvePartUsageOccurrence", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  async function createPartWithIngredient(
    ownerId: string,
    title: string,
    quantity: number,
    unit: string,
  ) {
    return dishService.createDish(
      ownerId,
      "PART",
      content({
        title,
        sections: [
          {
            name: null,
            guidanceNote: null,
            position: 0,
            ingredients: [
              {
                name: "Rice",
                quantity,
                quantityEnd: null,
                isApproximate: false,
                unit,
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
      }),
    );
  }

  async function attachOccurrence(
    ownerId: string,
    containerDishId: string,
    partDishId: string,
    partVersionId: string,
    multiplier: number,
  ): Promise<string> {
    const dish = await loadDishWithVersion(containerDishId);
    const container = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    await dishService.editDish(
      ownerId,
      containerDishId,
      container.currentVersionId!,
      {
        ...content({ sections: unchangedSections(dish) }),
        partLinks: [
          {
            targetDishId: partDishId,
            targetDishVersionId: partVersionId,
            position: 0,
            multiplier,
          },
        ],
      },
      "MINOR",
    );
    const after = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    const { partLinks } = await loadContent(
      containerDishId,
      after.currentVersionId!,
    );
    return partLinks[0].lineageId!;
  }

  it("DETACH scales the localized ingredient quantity by the occurrence's multiplier", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPartWithIngredient(
      userId,
      "Rice Base",
      2,
      "cup",
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;
    const containerDishId = await dishService.createDish(
      userId,
      "RECIPE",
      content(),
    );
    const lineageId = await attachOccurrence(
      userId,
      containerDishId,
      partDishId,
      partVersionId,
      2,
    );

    await dishService.resolvePartUsageOccurrence(
      userId,
      partDishId,
      containerDishId,
      lineageId,
      "DETACH",
    );

    const after = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    const { sections, partLinks } = await loadContent(
      containerDishId,
      after.currentVersionId!,
    );
    expect(partLinks).toHaveLength(0);
    const rice = sections
      .flatMap((s) => s.ingredients)
      .find((i) => i.name === "Rice")!;
    expect(rice.quantity).toBe(4); // 2 × multiplier 2
  });

  it("DETACH with multiplier 1 leaves the localized quantity unchanged", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPartWithIngredient(
      userId,
      "Rice Base",
      2,
      "cup",
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;
    const containerDishId = await dishService.createDish(
      userId,
      "RECIPE",
      content(),
    );
    const lineageId = await attachOccurrence(
      userId,
      containerDishId,
      partDishId,
      partVersionId,
      1,
    );

    await dishService.resolvePartUsageOccurrence(
      userId,
      partDishId,
      containerDishId,
      lineageId,
      "DETACH",
    );

    const after = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    const { sections } = await loadContent(
      containerDishId,
      after.currentVersionId!,
    );
    const rice = sections
      .flatMap((s) => s.ingredients)
      .find((i) => i.name === "Rice")!;
    expect(rice.quantity).toBe(2);
  });

  it("REPLACE retargets the occurrence to the replacement Part/Version", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPartWithIngredient(
      userId,
      "Rice Base",
      2,
      "cup",
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;
    const replacementPartId = await createPartWithIngredient(
      userId,
      "Quinoa Base",
      1,
      "cup",
    );
    const replacementVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: replacementPartId } })
    ).currentVersionId!;

    const containerDishId = await dishService.createDish(
      userId,
      "RECIPE",
      content(),
    );
    const lineageId = await attachOccurrence(
      userId,
      containerDishId,
      partDishId,
      partVersionId,
      1,
    );

    await dishService.resolvePartUsageOccurrence(
      userId,
      partDishId,
      containerDishId,
      lineageId,
      "REPLACE",
      {
        targetDishId: replacementPartId,
        targetDishVersionId: replacementVersionId,
      },
    );

    const after = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    const { partLinks } = await loadContent(
      containerDishId,
      after.currentVersionId!,
    );
    expect(partLinks).toHaveLength(1);
    expect(partLinks[0].targetDishId).toBe(replacementPartId);
    expect(partLinks[0].targetDishVersionId).toBe(replacementVersionId);
  });

  it("REPLACE rejects a replacement that would duplicate an already-linked Part", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPartWithIngredient(
      userId,
      "Rice Base",
      2,
      "cup",
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;
    const otherPartId = await createPartWithIngredient(
      userId,
      "Quinoa Base",
      1,
      "cup",
    );
    const otherVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: otherPartId } })
    ).currentVersionId!;

    const containerDishId = await dishService.createDish(
      userId,
      "RECIPE",
      content(),
    );
    const dish = await loadDishWithVersion(containerDishId);
    const container = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    await dishService.editDish(
      userId,
      containerDishId,
      container.currentVersionId!,
      {
        ...content({ sections: unchangedSections(dish) }),
        partLinks: [
          {
            targetDishId: partDishId,
            targetDishVersionId: partVersionId,
            position: 0,
            multiplier: 1,
          },
          {
            targetDishId: otherPartId,
            targetDishVersionId: otherVersionId,
            position: 1,
            multiplier: 1,
          },
        ],
      },
      "MINOR",
    );
    const afterAttach = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    const { partLinks } = await loadContent(
      containerDishId,
      afterAttach.currentVersionId!,
    );
    const lineageId = partLinks.find(
      (l) => l.targetDishId === partDishId,
    )!.lineageId!;

    await expect(
      dishService.resolvePartUsageOccurrence(
        userId,
        partDishId,
        containerDishId,
        lineageId,
        "REPLACE",
        { targetDishId: otherPartId, targetDishVersionId: otherVersionId },
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("REMOVE deletes the occurrence when other content survives, and is rejected when it would leave none", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await createPartWithIngredient(
      userId,
      "Rice Base",
      2,
      "cup",
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    // Surviving local content — REMOVE succeeds.
    const containerDishId = await dishService.createDish(
      userId,
      "RECIPE",
      content(),
    );
    const lineageId = await attachOccurrence(
      userId,
      containerDishId,
      partDishId,
      partVersionId,
      1,
    );
    await dishService.resolvePartUsageOccurrence(
      userId,
      partDishId,
      containerDishId,
      lineageId,
      "REMOVE",
    );
    const after = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    const { partLinks } = await loadContent(
      containerDishId,
      after.currentVersionId!,
    );
    expect(partLinks).toHaveLength(0);

    // Only this occurrence as content — REMOVE is rejected.
    const barePartId = await createPartWithIngredient(
      userId,
      "Second Part",
      1,
      "cup",
    );
    const barePartVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: barePartId } })
    ).currentVersionId!;
    const bareContainerId = await dishService.createDish(userId, "RECIPE", {
      ...content({ sections: [] }),
      partLinks: [
        {
          targetDishId: barePartId,
          targetDishVersionId: barePartVersionId,
          position: 0,
          multiplier: 1,
        },
      ],
    });
    const bareContainer = await prisma.dish.findUniqueOrThrow({
      where: { id: bareContainerId },
    });
    const { partLinks: barePartLinks } = await loadContent(
      bareContainerId,
      bareContainer.currentVersionId!,
    );
    const bareLineageId = barePartLinks[0].lineageId!;

    await expect(
      dishService.resolvePartUsageOccurrence(
        userId,
        barePartId,
        bareContainerId,
        bareLineageId,
        "REMOVE",
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe("Slice 6 post-gate — deletePart (Phase 2)", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("aborts cleanly with PartHasLiveUsagesError while a current usage still exists", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await dishService.createDish(
      userId,
      "PART",
      content({ title: "Nuoc Cham", partLinks: [] }),
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    const containerDishId = await dishService.createDish(
      userId,
      "RECIPE",
      content(),
    );
    const dish = await loadDishWithVersion(containerDishId);
    const container = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    await dishService.editDish(
      userId,
      containerDishId,
      container.currentVersionId!,
      {
        ...content({ sections: unchangedSections(dish) }),
        partLinks: [
          {
            targetDishId: partDishId,
            targetDishVersionId: partVersionId,
            position: 0,
            multiplier: 1,
          },
        ],
      },
      "MINOR",
    );

    await expect(
      dishService.deleteDish(userId, partDishId),
    ).rejects.toBeInstanceOf(PartHasLiveUsagesError);

    const stillExists = await prisma.dish.findUnique({
      where: { id: partDishId },
    });
    expect(stillExists).not.toBeNull();
  });

  it("materializes a historical usage (preserving its multiplier) and deletes the Part once no current usage remains", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partDishId = await dishService.createDish(
      userId,
      "PART",
      content({ title: "Nuoc Cham", partLinks: [] }),
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    const containerDishId = await dishService.createDish(
      userId,
      "RECIPE",
      content(),
    );
    const dish = await loadDishWithVersion(containerDishId);
    const container = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    await dishService.editDish(
      userId,
      containerDishId,
      container.currentVersionId!,
      {
        ...content({ sections: unchangedSections(dish) }),
        partLinks: [
          {
            targetDishId: partDishId,
            targetDishVersionId: partVersionId,
            position: 0,
            multiplier: 3,
          },
        ],
      },
      "MINOR",
    );
    const containerWithLink = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
      include: { currentVersion: { include: { partLinks: true } } },
    });
    const historicalLinkId = containerWithLink.currentVersion!.partLinks[0].id;
    const historicalVersionId = containerWithLink.currentVersionId!;

    // Resolve the CURRENT usage, leaving the just-created Version above as
    // a HISTORICAL usage that still references the Part.
    const { partLinks: linkedContentBefore } = await loadContent(
      containerDishId,
      historicalVersionId,
    );
    await dishService.resolvePartUsageOccurrence(
      userId,
      partDishId,
      containerDishId,
      linkedContentBefore[0].lineageId!,
      "DETACH",
    );
    const containerAfterResolve = await prisma.dish.findUniqueOrThrow({
      where: { id: containerDishId },
    });
    expect(containerAfterResolve.currentVersionId).not.toBe(
      historicalVersionId,
    );

    await dishService.deleteDish(userId, partDishId);

    expect(
      await prisma.dish.findUnique({ where: { id: partDishId } }),
    ).toBeNull();

    const materialized = await prisma.partLink.findUniqueOrThrow({
      where: { id: historicalLinkId },
    });
    expect(materialized.linkState).toBe("MATERIALIZED");
    expect(materialized.targetDishId).toBeNull();
    expect(materialized.targetDishVersionId).toBeNull();
    expect(materialized.materializedTitle).toBe("Nuoc Cham");
    expect(materialized.materializedVersionLabel).toBe("V1.0");
    // §Judgment call (docs/SLICE_6.md): the multiplier column is left as
    // historical record, not reset or baked into the JSON snapshot.
    expect(decimalToNumber(materialized.multiplier)).toBe(3);
    expect(materialized.materializedContent).not.toBeNull();
    const snapshot = materialized.materializedContent as unknown as {
      sections: { ingredients: { name: string }[] }[];
    };
    expect(snapshot.sections[0].ingredients[0].name).toBe("Salt");
  });
});
