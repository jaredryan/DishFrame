import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import { cleanupAbandonedImageAssets } from "@/lib/images/service";
import type { DishContentInput } from "@/lib/dishes/schema";

// Same reasoning as account.integration.test.ts: these tests create
// ImageAsset rows directly against Postgres, no real Blob upload — the real
// network call is mocked.
const { del } = vi.hoisted(() => ({ del: vi.fn(async () => {}) }));
vi.mock("@vercel/blob", () => ({ del }));

const OLD_ENOUGH = new Date(Date.now() - 25 * 60 * 60 * 1000); // > 24h cutoff
const TOO_RECENT = new Date(Date.now() - 1 * 60 * 60 * 1000); // < 24h cutoff

function content(overrides: Partial<DishContentInput> = {}): DishContentInput {
  return {
    title: "Ginger Soy Bowl",
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

describe("cleanupAbandonedImageAssets", () => {
  let ownerId: string | undefined;
  const imageAssetIds: string[] = [];

  // The local dev Postgres persists across runs, so a genuinely orphaned
  // ImageAsset row left by an earlier session could crowd out this file's
  // own fixtures in the batch-size-limited, oldest-first sweep, or hijack
  // a mockRejectedValueOnce/mockImplementationOnce meant for this file's
  // asset. Drain any such backlog once up front so each test's fixture is
  // the only real candidate.
  beforeAll(async () => {
    let result = await cleanupAbandonedImageAssets();
    while (result.candidateCount > 0) {
      result = await cleanupAbandonedImageAssets();
    }
    del.mockClear();
  });

  afterEach(async () => {
    if (ownerId) {
      await deleteTestUser(ownerId);
      ownerId = undefined;
    }
    // ImageAsset.uploadedByUserId is SetNull, not Cascade — any row this
    // suite created and left behind (a retained-for-retry candidate, or one
    // a test never got around to attaching) needs explicit cleanup so it
    // doesn't leak into another test file's own candidate query.
    if (imageAssetIds.length > 0) {
      await prisma.imageAsset.deleteMany({
        where: { id: { in: imageAssetIds } },
      });
      imageAssetIds.length = 0;
    }
    del.mockClear();
  });

  async function createAsset(createdAt: Date) {
    const owner = await createTestUser();
    ownerId = owner.id;
    const asset = await prisma.imageAsset.create({
      data: {
        storageKey: `images/test/${owner.id}.webp`,
        uploadedByUserId: owner.id,
        createdAt,
      },
    });
    imageAssetIds.push(asset.id);
    return { owner, asset };
  }

  it("deletes an old, genuinely-unattached asset and its blob", async () => {
    const { asset } = await createAsset(OLD_ENOUGH);

    await cleanupAbandonedImageAssets();

    expect(del).toHaveBeenCalledWith(asset.storageKey);
    expect(
      await prisma.imageAsset.findUnique({ where: { id: asset.id } }),
    ).toBeNull();
  });

  it("retains a recently-created unattached asset", async () => {
    const { asset } = await createAsset(TOO_RECENT);

    await cleanupAbandonedImageAssets();

    expect(del).not.toHaveBeenCalledWith(asset.storageKey);
    expect(
      await prisma.imageAsset.findUnique({ where: { id: asset.id } }),
    ).not.toBeNull();
  });

  it("retains an old asset attached to a saved DishVersion", async () => {
    const { owner, asset } = await createAsset(OLD_ENOUGH);
    await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ imageAssetId: asset.id }),
    );

    await cleanupAbandonedImageAssets();

    expect(del).not.toHaveBeenCalledWith(asset.storageKey);
    expect(
      await prisma.imageAsset.findUnique({ where: { id: asset.id } }),
    ).not.toBeNull();
  });

  it("retains an old asset referenced by a still-PENDING DirectShare's frozen graph", async () => {
    const { owner, asset } = await createAsset(OLD_ENOUGH);
    const collection = await prisma.directShareCollection.create({
      data: {
        senderId: owner.id,
        recipientLookup: "recipient@example.invalid",
      },
    });
    await prisma.directShare.create({
      data: {
        senderId: owner.id,
        recipientLookup: "recipient@example.invalid",
        dishTitleSnapshot: "Ginger Soy Bowl",
        status: "PENDING",
        frozenImageAssetIds: [asset.id],
        collectionId: collection.id,
      },
    });

    await cleanupAbandonedImageAssets();

    expect(del).not.toHaveBeenCalledWith(asset.storageKey);
    expect(
      await prisma.imageAsset.findUnique({ where: { id: asset.id } }),
    ).not.toBeNull();
  });

  it("keeps the DB row when the blob delete fails, for a later retry", async () => {
    const { asset } = await createAsset(OLD_ENOUGH);
    del.mockRejectedValueOnce(new Error("blob delete failed"));

    await cleanupAbandonedImageAssets();

    expect(del).toHaveBeenCalledWith(asset.storageKey);
    expect(
      await prisma.imageAsset.findUnique({ where: { id: asset.id } }),
    ).not.toBeNull();
  });

  /**
   * Regression test for the race the row lock (`SELECT ... FOR UPDATE`
   * inside `cleanupAbandonedImageAssets`) exists to close: an attach
   * landing in the gap between the reference check and the Blob delete. The
   * concurrent attach is fired from inside the mocked `del()` call — i.e.
   * while the sweep's transaction is still open and holding its lock on
   * this exact row — so it can only proceed once that transaction commits.
   * Real Postgres lock contention, not a simulated ordering.
   */
  it("blocks a concurrent attach until the sweep's transaction finishes, so it can never land against a since-deleted blob", async () => {
    const { owner, asset } = await createAsset(OLD_ENOUGH);

    let concurrentAttachSettled = false;
    let concurrentAttachError: unknown;

    del.mockImplementationOnce(async () => {
      dishService
        .createDish(owner.id, "RECIPE", content({ imageAssetId: asset.id }))
        .then(() => {
          concurrentAttachSettled = true;
        })
        .catch((error: unknown) => {
          concurrentAttachSettled = true;
          concurrentAttachError = error;
        });

      // Give the concurrent attempt time to reach Postgres and block on the
      // row lock this transaction is holding.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(concurrentAttachSettled).toBe(false);
    });

    await cleanupAbandonedImageAssets();

    // The row is gone, so the previously-blocked attach must now fail with
    // a foreign-key violation rather than silently succeed against a Blob
    // that's already been deleted.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(concurrentAttachSettled).toBe(true);
    expect(concurrentAttachError).toBeDefined();
    expect(
      await prisma.imageAsset.findUnique({ where: { id: asset.id } }),
    ).toBeNull();
  });
});
