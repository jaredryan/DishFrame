import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";

/**
 * Confirms the hand-added raw-SQL constraints from
 * docs/PRISMA_SCHEMA_PROPOSAL.md §4 actually exist in the database and
 * reject invalid data — not just that the migration files mention them.
 * Each test provokes exactly one constraint via the lowest-level Prisma
 * call available, bypassing any application-level validation.
 */
describe("database-level constraints", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("rating_value_range rejects a value outside 1..5", async () => {
    const user = await createTestUser();
    userId = user.id;

    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "RECIPE" },
    });
    const version = await prisma.dishVersion.create({
      data: { dishId: dish.id, majorVersion: 1, minorVersion: 0, title: "V1" },
    });
    const session = await prisma.cookingSession.create({
      data: { ownerId: userId, dishId: dish.id, dishVersionId: version.id },
    });
    const taster = await prisma.taster.create({
      data: { ownerId: userId, name: "Taster", position: 0 },
    });

    await expect(
      prisma.rating.create({
        data: {
          sessionId: session.id,
          tasterId: taster.id,
          value: 6,
          dishTitleSnapshot: "V1",
          dishVersionLabelSnapshot: "V1.0",
        },
      }),
    ).rejects.toThrow();
  });

  it("part_link_state_consistency rejects a LIVE link with no target", async () => {
    const user = await createTestUser();
    userId = user.id;

    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "RECIPE" },
    });
    const version = await prisma.dishVersion.create({
      data: { dishId: dish.id, majorVersion: 1, minorVersion: 0, title: "V1" },
    });

    await expect(
      prisma.partLink.create({
        data: {
          lineageId: "test-lineage",
          containerVersionId: version.id,
          linkState: "LIVE",
          position: 0,
          // targetDishId/targetDishVersionId intentionally omitted —
          // required whenever linkState = LIVE.
        },
      }),
    ).rejects.toThrow();
  });

  it("one_active_session_per_dish rejects a second concurrent in-progress session", async () => {
    const user = await createTestUser();
    userId = user.id;

    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "RECIPE" },
    });
    const version = await prisma.dishVersion.create({
      data: { dishId: dish.id, majorVersion: 1, minorVersion: 0, title: "V1" },
    });

    await prisma.cookingSession.create({
      data: { ownerId: userId, dishId: dish.id, dishVersionId: version.id },
    });

    await expect(
      prisma.cookingSession.create({
        data: { ownerId: userId, dishId: dish.id, dishVersionId: version.id },
      }),
    ).rejects.toThrow();
  });

  it("grocery_list_mode_consistency rejects MEAL_PLAN_LINKED with no linked plan", async () => {
    const user = await createTestUser();
    userId = user.id;

    await expect(
      prisma.groceryList.create({
        data: {
          ownerId: userId,
          title: "Broken list",
          mode: "MEAL_PLAN_LINKED",
          // linkedMealPlanId intentionally omitted.
        },
      }),
    ).rejects.toThrow();
  });

  it("meal_plan_date_order rejects an end date before the start date", async () => {
    const user = await createTestUser();
    userId = user.id;

    await expect(
      prisma.mealPlan.create({
        data: {
          ownerId: userId,
          title: "Backwards plan",
          startDate: new Date("2026-02-01"),
          endDate: new Date("2026-01-01"),
        },
      }),
    ).rejects.toThrow();
  });

  it("nutrition_basis_consistency rejects PER_OUTPUT_UNIT with no basis quantity", async () => {
    const user = await createTestUser();
    userId = user.id;

    const dish = await prisma.dish.create({
      data: { ownerId: userId, kind: "RECIPE" },
    });

    await expect(
      prisma.dishVersion.create({
        data: {
          dishId: dish.id,
          majorVersion: 1,
          minorVersion: 0,
          title: "V1",
          nutritionBasis: "PER_OUTPUT_UNIT",
          // nutritionBasisQuantity/nutritionBasisUnit intentionally omitted.
        },
      }),
    ).rejects.toThrow();
  });

  it("dish_archived_state_consistency rejects Archived stage with no archivedAt", async () => {
    const user = await createTestUser();
    userId = user.id;

    await expect(
      prisma.dish.create({
        data: { ownerId: userId, kind: "RECIPE", stage: "ARCHIVED" },
      }),
    ).rejects.toThrow();
  });

  it("one_fallback_category_per_user (Slice 2 follow-up) rejects a second fallback Grocery Category", async () => {
    const user = await createTestUser();
    userId = user.id;

    await prisma.groceryCategory.create({
      data: {
        ownerId: userId,
        normalizedName: "other",
        displayName: "Other",
        position: 0,
        isFallback: true,
      },
    });

    await expect(
      prisma.groceryCategory.create({
        data: {
          ownerId: userId,
          normalizedName: "misc",
          displayName: "Misc",
          position: 1,
          isFallback: true,
        },
      }),
    ).rejects.toThrow();
  });
});
