import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Version-trigger and Slice 5 image correction pass §4 (read authorization):
 * `/api/images/[assetId]` must authorize a signed-in user whenever that
 * user owns at least one `DishVersion` referencing the asset — not only
 * the asset's original uploader — since cross-account duplication
 * intentionally shares the same `ImageAsset` row (ARCHITECTURE_PROPOSAL.md
 * §D.2a). These tests exercise the real route handler against real
 * Postgres rows, mocking only the two things that can't run in a test
 * process: the authenticated session and the actual Blob network read.
 */
const mockGetServerSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getServerSession: () => mockGetServerSession(),
}));

const mockBlobGet = vi.fn();
vi.mock("@vercel/blob", () => ({
  get: (...args: unknown[]) => mockBlobGet(...args),
}));

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

function requestFor(assetId: string) {
  return { params: Promise.resolve({ assetId }) };
}

describe("GET /api/images/[assetId]", () => {
  let userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds) {
      await deleteTestUser(id);
    }
    userIds = [];
    mockGetServerSession.mockReset();
    mockBlobGet.mockReset();
  });

  it("rejects a request with no signed-in session", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const image = await prisma.imageAsset.create({
      data: {
        storageKey: `images/test/${randomUUID()}.jpg`,
        uploadedByUserId: owner.id,
      },
    });
    await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ imageAssetId: image.id }),
    );
    mockGetServerSession.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://x"), requestFor(image.id));
    expect(response.status).toBe(401);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("allows the owner of a referencing DishVersion to read the image", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const image = await prisma.imageAsset.create({
      data: {
        storageKey: `images/test/${randomUUID()}.jpg`,
        uploadedByUserId: owner.id,
      },
    });
    await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ imageAssetId: image.id }),
    );
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });
    mockBlobGet.mockResolvedValue({
      statusCode: 200,
      blob: { contentType: "image/jpeg" },
      stream: new ReadableStream(),
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://x"), requestFor(image.id));
    expect(response.status).toBe(200);
    expect(mockBlobGet).toHaveBeenCalledWith(image.storageKey, {
      access: "private",
    });
  });

  // Version-trigger correction pass: a legitimate cross-account duplicate
  // owner — who never uploaded the asset, but owns a DishVersion that
  // references the shared row — must be authorized too, not just the
  // original uploader.
  it("allows a cross-account duplicate owner to read a shared asset they never uploaded", async () => {
    const original = await createTestUser();
    const duplicator = await createTestUser();
    userIds.push(original.id, duplicator.id);
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
    // (PRODUCT_SPEC.md §18/§95.2 — that's Tier 2 scope); `duplicateDish` is
    // strictly intra-account, since its `ownerId` param must already own
    // the source Dish. To exercise the route's cross-account authorization
    // branch (a DishVersion this signed-in user owns already references
    // the asset, even though a different user uploaded it), construct that
    // precondition directly at the data level, simulating what a future
    // accepted cross-account share/duplicate would produce.
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

    mockGetServerSession.mockResolvedValue({ user: { id: duplicator.id } });
    mockBlobGet.mockResolvedValue({
      statusCode: 200,
      blob: { contentType: "image/jpeg" },
      stream: new ReadableStream(),
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://x"), requestFor(image.id));
    expect(response.status).toBe(200);
  });

  it("rejects an unrelated signed-in user with no authorized DishVersion reference", async () => {
    const owner = await createTestUser();
    const unrelated = await createTestUser();
    userIds.push(owner.id, unrelated.id);
    const image = await prisma.imageAsset.create({
      data: {
        storageKey: `images/test/${randomUUID()}.jpg`,
        uploadedByUserId: owner.id,
      },
    });
    await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ imageAssetId: image.id }),
    );
    mockGetServerSession.mockResolvedValue({ user: { id: unrelated.id } });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://x"), requestFor(image.id));
    expect(response.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });
});
