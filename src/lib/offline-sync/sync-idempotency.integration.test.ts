import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { handleSyncPush } from "@/lib/offline-sync/http";
import { dishSyncOps } from "@/lib/offline-sync/dishes";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Focused coverage for the one property the whole offline-mutation design
 * depends on (docs/OFFLINE_IMPLEMENTATION_PLAN.md): a retried request after
 * an ambiguous network failure — same idempotency key, replayed verbatim —
 * must never apply twice. `dish.create` is the sharpest test case: without
 * the receipt-table short-circuit, replaying it would call
 * `createDishWithVersion` a second time and (since the client id is only
 * used when the row doesn't already exist) throw a duplicate-key error
 * rather than silently duplicating — either way, a bug this test would
 * catch.
 */

let userId: string;

vi.mock("@/lib/auth/session", () => ({
  requireUserId: vi.fn(async () => userId),
}));

function content(overrides: Partial<DishContentInput> = {}): DishContentInput {
  return {
    title: "Idempotency Test Soup",
    stage: "IDEA",
    cuisineIds: [],
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    nutritionBasis: null,
    nutritionBasisQuantity: null,
    nutritionBasisUnit: null,
    moreNutrients: null,
    nutritionSourceProvider: null,
    nutritionSourceId: null,
    nutritionSourceName: null,
    imageAssetId: null,
    sections: [
      {
        name: null,
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            name: "Broth",
            quantity: 2,
            quantityEnd: null,
            isApproximate: false,
            unit: "cup",
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [{ text: "Simmer.", position: 0 }],
        partLinks: [],
      },
    ],
    partLinks: [],
    ...overrides,
  };
}

function pushRequest(body: unknown): Request {
  return new Request("http://localhost/api/sync/dishes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("api/sync idempotency", () => {
  afterEach(async () => {
    if (userId) await deleteTestUser(userId).catch(() => {});
  });

  it("replays the stored receipt instead of re-applying a retried dish.create", async () => {
    const user = await createTestUser();
    userId = user.id;

    const clientDishId = crypto.randomUUID();
    const clientVersionId = crypto.randomUUID();
    const mutationId = crypto.randomUUID();
    const body = {
      mutationId,
      op: "dish.create",
      entityId: clientDishId,
      payload: { clientDishId, clientVersionId, kind: "RECIPE", content: content() },
    };

    const first = await handleSyncPush(pushRequest(body), dishSyncOps);
    expect(first.status).toBe(200);
    const firstJson = await first.json();
    expect(firstJson.status).toBe("applied");

    const second = await handleSyncPush(pushRequest(body), dishSyncOps);
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson).toEqual(firstJson);

    const dishCount = await prisma.dish.count({ where: { id: clientDishId } });
    expect(dishCount).toBe(1);

    const receipt = await prisma.syncMutationReceipt.findUnique({ where: { id: mutationId } });
    expect(receipt?.status).toBe("200");
  });

  it("a different idempotency key for the same dish.create payload is rejected as a duplicate id, not silently re-applied", async () => {
    const user = await createTestUser();
    userId = user.id;

    const clientDishId = crypto.randomUUID();
    const clientVersionId = crypto.randomUUID();
    const payload = { clientDishId, clientVersionId, kind: "RECIPE", content: content() };

    const first = await handleSyncPush(
      pushRequest({ mutationId: crypto.randomUUID(), op: "dish.create", entityId: clientDishId, payload }),
      dishSyncOps,
    );
    expect(first.status).toBe(200);

    // A second, genuinely distinct mutation reusing the same client-chosen
    // dish id (not a retried request — a real bug scenario) must fail
    // loudly rather than silently duplicate/overwrite.
    const second = await handleSyncPush(
      pushRequest({ mutationId: crypto.randomUUID(), op: "dish.create", entityId: clientDishId, payload }),
      dishSyncOps,
    );
    expect(second.status).toBeGreaterThanOrEqual(400);

    const dishCount = await prisma.dish.count({ where: { id: clientDishId } });
    expect(dishCount).toBe(1);
  });
});
