import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import { createShareLink } from "@/lib/sharing/service";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Slice 21 structural follow-up: `generateMetadata` is exercised directly
 * against real Postgres rows, mirroring the route-handler integration
 * pattern (`api/export/dish/[dishId]/route.integration.test.ts`) — only the
 * session is mocked.
 */
const mockGetServerSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getServerSession: () => mockGetServerSession(),
}));

vi.mock("@vercel/blob", () => ({ del: vi.fn(async () => {}) }));
vi.mock("@/lib/env/server", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/env/server")>(
      "@/lib/env/server",
    );
  return {
    ...actual,
    env: { ...actual.env, SHARE_LINK_HMAC_SECRET: "test-secret-do-not-use" },
  };
});

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

/** Preserves the seeded section/ingredient lineageIds so a title-only edit
 * doesn't get misread as a structural (add/remove) change requiring an
 * explicit `versionChoice` — mirrors `unchangedSections` in
 * `dishes.integration.test.ts`. */
async function unchangedSectionsFor(dishVersionId: string) {
  const section = await prisma.section.findFirstOrThrow({
    where: { dishVersionId },
  });
  const ingredient = await prisma.ingredient.findFirstOrThrow({
    where: { sectionId: section.id },
  });
  return [
    {
      lineageId: section.lineageId,
      name: null,
      guidanceNote: null,
      position: 0,
      ingredients: [
        {
          lineageId: ingredient.lineageId,
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
  ];
}

describe("route metadata", () => {
  let userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds) {
      await deleteTestUser(id);
    }
    userIds = [];
    mockGetServerSession.mockReset();
  });

  it("uses the Recipe's own title on the Recipe detail page", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ title: "Sunday Ramen Project" }),
    );
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });

    const { generateMetadata } =
      await import("@/app/(app)/recipes/[dishId]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ dishId }),
    });
    expect(metadata.title).toBe("Sunday Ramen Project");
  });

  it("uses the Part's own title on the Part detail page", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(
      owner.id,
      "PART",
      content({ title: "Peanut Dipping Sauce" }),
    );
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });

    const { generateMetadata } =
      await import("@/app/(app)/parts/[dishId]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ dishId }),
    });
    expect(metadata.title).toBe("Peanut Dipping Sauce");
  });

  it("distinguishes a historical Version page from the current one via its Version label", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ title: "Weeknight Stir-Fry" }),
    );
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    const originalVersionId = dish.currentVersionId!;
    const originalSection = await prisma.section.findFirstOrThrow({
      where: { dishVersionId: originalVersionId },
    });
    const originalIngredient = await prisma.ingredient.findFirstOrThrow({
      where: { sectionId: originalSection.id },
    });

    await dishService.editDish(
      owner.id,
      dishId,
      originalVersionId,
      content({
        title: "Weeknight Stir-Fry",
        sections: [
          {
            lineageId: originalSection.lineageId,
            name: null,
            guidanceNote: null,
            position: 0,
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
            ],
            instructions: [{ text: "Whisk everything together." }],
            partLinks: [],
          },
        ],
      }),
      "MAJOR",
    );

    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });
    const { generateMetadata } =
      await import("@/app/(app)/recipes/[dishId]/versions/[versionId]/page");

    const historical = await generateMetadata({
      params: Promise.resolve({ dishId, versionId: originalVersionId }),
    });
    expect(historical.title).toBe("Weeknight Stir-Fry — V1.0");

    const updatedDish = await prisma.dish.findUniqueOrThrow({
      where: { id: dishId },
    });
    const current = await generateMetadata({
      params: Promise.resolve({
        dishId,
        versionId: updatedDish.currentVersionId!,
      }),
    });
    expect(current.title).toBe("Weeknight Stir-Fry — V2.0");
  });

  it("uses the Meal Plan's own title", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const mealPlan = await prisma.mealPlan.create({
      data: {
        ownerId: owner.id,
        title: "This Week",
        startDate: new Date("2026-08-03"),
        endDate: new Date("2026-08-09"),
      },
    });
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });

    const { generateMetadata } =
      await import("@/app/(app)/meal-plans/[id]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: mealPlan.id }),
    });
    expect(metadata.title).toBe("This Week");
  });

  it("uses the Grocery List's own title", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const list = await prisma.groceryList.create({
      data: { ownerId: owner.id, title: "This Week's Groceries" },
    });
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });

    const { generateMetadata } =
      await import("@/app/(app)/grocery-lists/[id]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: list.id }),
    });
    expect(metadata.title).toBe("This Week's Groceries");
  });

  it("public FIXED_SNAPSHOT ShareLink metadata keeps its frozen title even after the source Recipe is later renamed", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ title: "Rice Side Dish" }),
    );
    const { url: token } = await createShareLink(owner.id, {
      dishId,
      mode: "FIXED_SNAPSHOT",
      showCreatorName: false,
      versionId: undefined,
      expiresAt: null,
    });

    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    await dishService.editDish(
      owner.id,
      dishId,
      dish.currentVersionId!,
      content({
        title: "Renamed Rice Dish",
        sections: await unchangedSectionsFor(dish.currentVersionId!),
      }),
      undefined,
    );

    const { generateMetadata } = await import("@/app/(share)/s/[token]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ token }),
    });
    expect(metadata.title).toBe("Rice Side Dish — V1.0");
  });

  it("public CURRENT ShareLink metadata reflects the currently resolved title", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ title: "Peanut Noodle Salad" }),
    );
    const { url: token } = await createShareLink(owner.id, {
      dishId,
      mode: "CURRENT",
      showCreatorName: false,
      versionId: undefined,
      expiresAt: null,
    });

    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    await dishService.editDish(
      owner.id,
      dishId,
      dish.currentVersionId!,
      content({
        title: "Peanut Noodle Salad, Revised",
        sections: await unchangedSectionsFor(dish.currentVersionId!),
      }),
      undefined,
    );

    const { generateMetadata } = await import("@/app/(share)/s/[token]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ token }),
    });
    expect(metadata.title).toBe("Peanut Noodle Salad, Revised — V1.0");
  });

  it("never leaks private version-note content into public share metadata", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ title: "Simple Garden Salad" }),
    );
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    await prisma.dishVersion.update({
      where: { id: dish.currentVersionId! },
      data: { versionNote: "PRIVATE_MARKER: only for me" },
    });
    const { url: token } = await createShareLink(owner.id, {
      dishId,
      mode: "CURRENT",
      showCreatorName: false,
      versionId: undefined,
      expiresAt: null,
    });

    const { generateMetadata } = await import("@/app/(share)/s/[token]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ token }),
    });
    expect(Object.keys(metadata)).toEqual(["title"]);
    expect(metadata.title).not.toContain("PRIVATE_MARKER");
    expect(metadata.title).toBe("Simple Garden Salad — V1.0");
  });

  it("falls back to no metadata override for an invalid or revoked public share token, matching the route's existing not-found behavior", async () => {
    const { generateMetadata } = await import("@/app/(share)/s/[token]/page");

    const malformed = await generateMetadata({
      params: Promise.resolve({ token: "not-a-real-token" }),
    });
    expect(malformed).toEqual({});

    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ title: "Rice Bowl Base" }),
    );
    const { shareLinkId, url: token } = await createShareLink(owner.id, {
      dishId,
      mode: "CURRENT",
      showCreatorName: false,
      versionId: undefined,
      expiresAt: null,
    });
    await prisma.shareLink.update({
      where: { id: shareLinkId },
      data: { revokedAt: new Date() },
    });

    const revoked = await generateMetadata({
      params: Promise.resolve({ token }),
    });
    expect(revoked).toEqual({});
  });
});
