import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { handleSyncPush } from "@/lib/offline-sync/http";
import { cookingSyncOps } from "@/lib/offline-sync/cooking";
import * as dishService from "@/lib/dishes/service";
import * as cookingService from "@/lib/cooking/service";
import {
  getOwnedDishVersionOrThrow,
  buildCookableUnits,
} from "@/lib/cooking/queries";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Multi-source Cooking Sessions completion pass (2026-09-18) — the offline
 * queued-mutation layer's own idempotency-receipt mechanism
 * (`offline-sync/http.ts`'s `handleSyncPush`, exercised the same way
 * `sync-idempotency.integration.test.ts` already does for `dish.create`),
 * applied to the multi-source-specific behaviors that mechanism has to get
 * right: starting a session, an active-session conflict discovered only at
 * sync time, and rescaling a source — not the generic receipt-ledger
 * mechanism itself, which that existing file already covers once.
 */

let userId: string;

vi.mock("@/lib/auth/session", () => ({
  requireUserId: vi.fn(async () => userId),
}));

function bowlContent(
  title: string,
  overrides: Partial<DishContentInput> = {},
): DishContentInput {
  return {
    title,
    stage: "IDEA",
    cuisineIds: [],
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      {
        name: "Prep",
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            name: "Rice",
            quantity: 2,
            quantityEnd: null,
            isApproximate: false,
            unit: "cups",
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [{ text: "Cook rice." }],
        partLinks: [],
      },
    ],
    partLinks: [],
    ...overrides,
  };
}

function partContent(
  title: string,
  quantity = 2,
  overrides: Partial<DishContentInput> = {},
): DishContentInput {
  return {
    title,
    stage: "IDEA",
    cuisineIds: [],
    description: null,
    yieldQuantity: quantity,
    yieldUnit: "cups",
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      {
        name: "Roast",
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            name: "Carrots",
            quantity,
            quantityEnd: null,
            isApproximate: false,
            unit: "cups",
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [{ text: "Roast carrots." }],
        partLinks: [],
      },
    ],
    partLinks: [],
    ...overrides,
  };
}

async function currentVersionId(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  return dish.currentVersionId!;
}

async function unitsFor(ownerId: string, dishId: string) {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  const { version } = await getOwnedDishVersionOrThrow(
    ownerId,
    dishId,
    dish.currentVersionId!,
  );
  return buildCookableUnits(ownerId, dish, version);
}

/** Two Recipes sharing the same Part at the same Version — Chicken Bowl's
 * link multiplier is 1, Beef Bowl's is 0.5 (same fixture shape as
 * multi-source.integration.test.ts's `setUpTwoBowlsSharingAPart`, local to
 * this file per its own file-scoped fixture convention). */
async function setUpTwoBowlsSharingAPart(ownerId: string) {
  const carrotsId = await dishService.createDish(
    ownerId,
    "PART",
    partContent("Roasted Carrots", 2),
  );
  const carrotsVersionId = await currentVersionId(carrotsId);

  const chickenBowlId = await dishService.createDish(
    ownerId,
    "RECIPE",
    bowlContent("Chicken Bowl", {
      partLinks: [
        {
          targetDishId: carrotsId,
          targetDishVersionId: carrotsVersionId,
          position: 1,
          multiplier: 1,
        },
      ],
    }),
  );
  const beefBowlId = await dishService.createDish(
    ownerId,
    "RECIPE",
    bowlContent("Beef Bowl", {
      partLinks: [
        {
          targetDishId: carrotsId,
          targetDishVersionId: carrotsVersionId,
          position: 1,
          multiplier: 0.5,
        },
      ],
    }),
  );

  return {
    carrotsId,
    chickenBowlId,
    chickenBowlVersionId: await currentVersionId(chickenBowlId),
    beefBowlId,
    beefBowlVersionId: await currentVersionId(beefBowlId),
  };
}

/** Builds the exact `startMultiSourceCookingSession` input for "both
 * sources, consolidated" — same `mergeKey` convention
 * (`multi-source.integration.test.ts`'s own tests derive it identically:
 * `part:{targetDishId}:{targetDishVersionId}` for the shared Part,
 * `unique:{sourceIndex}:{unitKey}` for each source's own unshared units). */
async function buildTwoSourceInput(
  ownerId: string,
  chickenBowlId: string,
  chickenBowlVersionId: string,
  beefBowlId: string,
  beefBowlVersionId: string,
) {
  const chickenUnits = await unitsFor(ownerId, chickenBowlId);
  const beefUnits = await unitsFor(ownerId, beefBowlId);
  return {
    sources: [
      {
        dishId: chickenBowlId,
        dishVersionId: chickenBowlVersionId,
        scaleFactor: 1,
      },
      { dishId: beefBowlId, dishVersionId: beefBowlVersionId, scaleFactor: 1 },
    ],
    units: [
      ...chickenUnits.map((u) => ({
        mergeKey:
          u.kind === "PART"
            ? `part:${u.targetDishId}:${u.targetDishVersionId}`
            : `unique:0:${u.unitKey}`,
      })),
      ...beefUnits
        .filter((u) => u.kind !== "PART")
        .map((u) => ({ mergeKey: `unique:1:${u.unitKey}` })),
    ],
  };
}

function pushRequest(body: unknown): Request {
  return new Request("http://localhost/api/sync/cooking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("offline multi-source Cooking Session sync", () => {
  afterEach(async () => {
    if (userId) await deleteTestUser(userId).catch(() => {});
  });

  it("replays the stored receipt instead of re-applying a retried cooking.startMultiSourceSession — one session, one consolidated unit, not duplicated", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const input = await buildTwoSourceInput(
      userId,
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    );

    const clientSessionId = crypto.randomUUID();
    const mutationId = crypto.randomUUID();
    const body = {
      mutationId,
      op: "cooking.startMultiSourceSession",
      entityId: clientSessionId,
      payload: { clientSessionId, input },
    };

    const first = await handleSyncPush(pushRequest(body), cookingSyncOps);
    expect(first.status).toBe(200);
    const firstJson = await first.json();
    expect(firstJson.status).toBe("applied");

    const second = await handleSyncPush(pushRequest(body), cookingSyncOps);
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson).toEqual(firstJson);

    expect(
      await prisma.cookingSession.count({ where: { id: clientSessionId } }),
    ).toBe(1);
    expect(
      await prisma.cookingSessionSource.count({
        where: { sessionId: clientSessionId },
      }),
    ).toBe(2);
    // Two unique per-source units (Rice sections) plus the shared Part
    // consolidated into one — a naive replay bug (re-running the handler
    // instead of short-circuiting on the receipt) would double every row
    // this creates, including the shared unit's own contribution rows.
    const units = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: clientSessionId },
      include: { contributions: true },
    });
    expect(units).toHaveLength(3);
    const sharedUnit = units.find((u) => u.contributions.length > 1)!;
    expect(sharedUnit.contributions).toHaveLength(2);
  });

  it("a genuine active-session conflict discovered only when the queued start reaches the server is rejected cleanly — no overlapping session, and retrying the same mutation replays the stored conflict rather than retrying forever", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const input = await buildTwoSourceInput(
      userId,
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    );

    // A conflict that only exists server-side by the time the offline-queued
    // mutation syncs — e.g. another device already started Chicken Bowl
    // cooking online in the meantime.
    const chickenUnits = await unitsFor(userId, chickenBowlId);
    await cookingService.startCookingSession(userId, {
      dishId: chickenBowlId,
      dishVersionId: chickenBowlVersionId,
      units: chickenUnits.map((u) => ({ unitKey: u.unitKey })),
    });

    const clientSessionId = crypto.randomUUID();
    const mutationId = crypto.randomUUID();
    const body = {
      mutationId,
      op: "cooking.startMultiSourceSession",
      entityId: clientSessionId,
      payload: { clientSessionId, input },
    };

    const first = await handleSyncPush(pushRequest(body), cookingSyncOps);
    expect(first.status).toBe(409);

    // Rolled back atomically — neither the attempted session nor Beef
    // Bowl's own source row was left behind.
    expect(
      await prisma.cookingSession.count({ where: { id: clientSessionId } }),
    ).toBe(0);
    expect(
      await prisma.cookingSessionSource.count({
        where: { dishId: beefBowlId },
      }),
    ).toBe(0);

    // A retried delivery of the exact same queued mutation (the real offline
    // scenario: the client never saw the first response and retries) must
    // replay the stored 409, not re-attempt the conflicting create.
    const second = await handleSyncPush(pushRequest(body), cookingSyncOps);
    expect(second.status).toBe(409);
    expect(
      await prisma.cookingSession.count({ where: { id: clientSessionId } }),
    ).toBe(0);

    const receipt = await prisma.syncMutationReceipt.findUnique({
      where: { id: mutationId },
    });
    expect(receipt?.status).toBe("409");
  });

  it("a queued source rescale stays pinned to the exact Version cooked, never the newer current library Version created after the session started", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const input = await buildTwoSourceInput(
      userId,
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    );
    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      input,
    );
    const chickenSource = await prisma.cookingSessionSource.findFirstOrThrow({
      where: { sessionId: session.id, dishId: chickenBowlId },
    });

    // Chicken Bowl is edited (a new Version) after the session already
    // pinned the original one. `editDish` returns the Dish id, not the new
    // Version id — the new Version's own id is read back separately.
    await dishService.editDish(
      userId,
      chickenBowlId,
      chickenBowlVersionId,
      bowlContent("Chicken Bowl", {
        sections: [
          {
            name: "Prep",
            guidanceNote: null,
            position: 0,
            ingredients: [
              {
                name: "Rice",
                quantity: 4,
                quantityEnd: null,
                isApproximate: false,
                unit: "cups",
                displayText: null,
                preparationNote: null,
                isOptional: false,
                substitute: null,
              },
            ],
            instructions: [{ text: "Cook rice." }],
            partLinks: [],
          },
        ],
      }),
      "MINOR",
    );
    const newVersionId = await currentVersionId(chickenBowlId);
    expect(newVersionId).not.toBe(chickenBowlVersionId);

    const mutationId = crypto.randomUUID();
    const body = {
      mutationId,
      op: "cooking.updateSourceScale",
      entityId: session.id,
      payload: {
        sessionId: session.id,
        sourceId: chickenSource.id,
        scaleFactor: 2,
      },
    };
    const result = await handleSyncPush(pushRequest(body), cookingSyncOps);
    expect(result.status).toBe(200);

    const rescaledSource = await prisma.cookingSessionSource.findUniqueOrThrow({
      where: { id: chickenSource.id },
    });
    expect(rescaledSource.scaleFactor?.toNumber()).toBe(2);
    // Still the exact Version the session started with — the rescale never
    // silently re-pins to the newer current Version.
    expect(rescaledSource.dishVersionId).toBe(chickenBowlVersionId);
  });

  it("source contribution totals for a shared Part stay internally consistent after a queued rescale is replayed (no double-application)", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const input = await buildTwoSourceInput(
      userId,
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    );
    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      input,
    );
    const chickenSource = await prisma.cookingSessionSource.findFirstOrThrow({
      where: { sessionId: session.id, dishId: chickenBowlId },
    });

    const mutationId = crypto.randomUUID();
    const body = {
      mutationId,
      op: "cooking.updateSourceScale",
      entityId: session.id,
      payload: {
        sessionId: session.id,
        sourceId: chickenSource.id,
        scaleFactor: 2,
      },
    };

    // A retried queued delivery of the same rescale — the offline-replay
    // scenario this test exists for.
    await handleSyncPush(pushRequest(body), cookingSyncOps);
    await handleSyncPush(pushRequest(body), cookingSyncOps);

    // `buildTwoSourceInput` includes every unit (each source's own unique
    // Rice section plus the shared Part), so the shared unit has to be
    // picked out by its contribution count rather than assumed to be the
    // only row.
    const units = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: session.id },
      include: { checklistItems: true, contributions: true },
    });
    const unit = units.find((u) => u.contributions.length > 1)!;
    expect(unit.contributions).toHaveLength(2); // still one row per source, not duplicated
    // Chicken (2 cups × link multiplier 1 × rescaled ×2) + Beef (2 cups ×
    // link multiplier 0.5 × its own untouched ×1) = 4 + 1 = 5 — not 9, which
    // a non-idempotent double-application of the rescale would produce.
    const carrotsItem = unit.checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    )!;
    expect(carrotsItem.baseQuantity?.toNumber()).toBe(5);
  });
});
