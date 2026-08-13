import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import * as sharingService from "@/lib/sharing/service";
import { sendDirectShareCollection } from "@/lib/sharing/collections";
import { deleteAccount, revokeAuthSession } from "@/lib/account/service";
import { deleteImageAssetIfOrphaned } from "@/lib/images/service";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import type { DishContentInput } from "@/lib/dishes/schema";

// Same reasoning as dishes.integration.test.ts: these tests create
// ImageAsset rows directly against Postgres, no real Blob upload — the
// real network call `bestEffortDeleteBlob` makes is mocked.
const { del } = vi.hoisted(() => ({ del: vi.fn(async () => {}) }));
vi.mock("@vercel/blob", () => ({ del }));

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

/** Every Send is now a one-or-more-item `DirectShareCollection` envelope
 * (`sharing/collections.ts`'s `sendDirectShareCollection`) — this wraps that
 * as a one-item send and returns the single child's own `directShareId`, so
 * these account-deletion tests (which only need one plain pending share)
 * don't need their own collection-shaped assertions. */
async function sendItem(
  senderId: string,
  input: { dishId: string; recipientEmail: string },
): Promise<{ directShareId: string }> {
  const { collectionId } = await sendDirectShareCollection(senderId, {
    recipientEmail: input.recipientEmail,
    dishIds: [input.dishId],
    note: null,
  });
  const child = await prisma.directShare.findFirstOrThrow({
    where: { collectionId, dishId: input.dishId },
  });
  return { directShareId: child.id };
}

describe("deleteAccount", () => {
  let ownerId: string | undefined;
  let otherUserId: string | undefined;

  afterEach(async () => {
    if (otherUserId) {
      await deleteTestUser(otherUserId);
      otherUserId = undefined;
    }
    if (ownerId) {
      // Some tests delete the owner themselves as the thing under test —
      // deleteMany (not delete) so a re-run of that deletion is a no-op
      // rather than an error.
      await prisma.user.deleteMany({ where: { id: ownerId } });
      ownerId = undefined;
    }
    del.mockClear();
  });

  it("hard-deletes the account and every Dish/ShareLink/DirectShare it owns", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;
    const recipient = await createTestUser();
    otherUserId = recipient.id;

    const dishId = await dishService.createDish(ownerId, "RECIPE", content());
    const { shareLinkId } = await sharingService.createShareLink(ownerId, {
      dishId,
      mode: "CURRENT",
      showCreatorName: false,
    });
    const { directShareId } = await sendItem(ownerId, {
      dishId,
      recipientEmail: recipient.email,
    });

    await deleteAccount(ownerId);

    expect(await prisma.user.findUnique({ where: { id: ownerId } })).toBeNull();
    expect(await prisma.dish.findUnique({ where: { id: dishId } })).toBeNull();
    expect(
      await prisma.shareLink.findUnique({ where: { id: shareLinkId } }),
    ).toBeNull();
    expect(
      await prisma.directShare.findUnique({ where: { id: directShareId } }),
    ).toBeNull();
  });

  it("preserves another user's already-accepted ShareLink copy with no personally-identifying link", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;
    const recipient = await createTestUser();
    otherUserId = recipient.id;

    const dishId = await dishService.createDish(ownerId, "RECIPE", content());
    const { url } = await sharingService.createShareLink(ownerId, {
      dishId,
      mode: "CURRENT",
      showCreatorName: true,
    });
    const result = await sharingService.saveSharedCopy(recipient.id, url);
    if (result.outcome === "previously_accepted_copy_deleted") {
      throw new Error("unexpected outcome");
    }
    const copyDishId = result.dishId;

    await deleteAccount(ownerId);
    ownerId = undefined;

    const copy = await prisma.dish.findUniqueOrThrow({
      where: { id: copyDishId },
    });
    expect(copy.ownerId).toBe(recipient.id);
    expect(copy.sourceDishId).toBeNull();
    expect(copy.sourceTitle).toBe("Ginger Soy Bowl");
  });

  it("preserves another user's already-accepted DirectShare copy after the sender's account is deleted", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;
    const recipient = await createTestUser();
    otherUserId = recipient.id;

    const dishId = await dishService.createDish(ownerId, "RECIPE", content());
    const { directShareId } = await sendItem(ownerId, {
      dishId,
      recipientEmail: recipient.email,
    });
    const accepted = await sharingService.acceptDirectShare(
      recipient.id,
      directShareId,
    );
    if (accepted.outcome !== "accepted") {
      throw new Error("unexpected outcome");
    }
    const copyDishId = accepted.dishId;

    await deleteAccount(ownerId);
    ownerId = undefined;

    expect(
      await prisma.directShare.findUnique({ where: { id: directShareId } }),
    ).toBeNull();
    const copy = await prisma.dish.findUniqueOrThrow({
      where: { id: copyDishId },
    });
    expect(copy.ownerId).toBe(recipient.id);
    expect(copy.sourceDishId).toBeNull();
  });

  it("deletes an ImageAsset only this account referenced, and cleans up its blob", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;

    const asset = await prisma.imageAsset.create({
      data: {
        storageKey: `images/test/${owner.id}.webp`,
        uploadedByUserId: owner.id,
      },
    });
    await dishService.createDish(
      ownerId,
      "RECIPE",
      content({ imageAssetId: asset.id }),
    );

    await deleteAccount(ownerId);
    ownerId = undefined;

    expect(
      await prisma.imageAsset.findUnique({ where: { id: asset.id } }),
    ).toBeNull();
    expect(del).toHaveBeenCalledWith(asset.storageKey);
  });

  it("keeps an ImageAsset alive while another account's copy still references it", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;
    const recipient = await createTestUser();
    otherUserId = recipient.id;

    const asset = await prisma.imageAsset.create({
      data: {
        storageKey: `images/test/${owner.id}.webp`,
        uploadedByUserId: owner.id,
      },
    });
    const dishId = await dishService.createDish(
      ownerId,
      "RECIPE",
      content({ imageAssetId: asset.id }),
    );
    const { url } = await sharingService.createShareLink(ownerId, {
      dishId,
      mode: "CURRENT",
      showCreatorName: false,
    });
    await sharingService.saveSharedCopy(recipient.id, url);

    await deleteAccount(ownerId);
    ownerId = undefined;

    const survivingAsset = await prisma.imageAsset.findUnique({
      where: { id: asset.id },
    });
    expect(survivingAsset).not.toBeNull();
    expect(survivingAsset?.uploadedByUserId).toBeNull();
    expect(del).not.toHaveBeenCalledWith(asset.storageKey);
  });

  it("deletes without a Restrict violation when a Part is linked from the account's own Recipe", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;

    const partDishId = await dishService.createDish(
      ownerId,
      "PART",
      content({ title: "Nuoc Cham", partLinks: [] }),
    );
    const partVersionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: partDishId } })
    ).currentVersionId!;

    await dishService.createDish(
      ownerId,
      "RECIPE",
      content({
        partLinks: [
          {
            targetDishId: partDishId,
            targetDishVersionId: partVersionId,
            position: 0,
            multiplier: 1,
          },
        ],
      }),
    );

    await expect(deleteAccount(ownerId)).resolves.not.toThrow();
    expect(await prisma.user.findUnique({ where: { id: ownerId } })).toBeNull();
    ownerId = undefined;
  });

  it("deletes without a Restrict violation when a grocery list is linked to the account's own Meal Plan", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;

    const mealPlan = await prisma.mealPlan.create({
      data: {
        ownerId,
        title: "Week 1",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-07"),
      },
    });
    await prisma.groceryList.create({
      data: {
        ownerId,
        title: "Linked list",
        mode: "MEAL_PLAN_LINKED",
        linkedMealPlanId: mealPlan.id,
      },
    });

    await expect(deleteAccount(ownerId)).resolves.not.toThrow();
    expect(await prisma.user.findUnique({ where: { id: ownerId } })).toBeNull();
    ownerId = undefined;
  });
});

describe("deleteAccount — pending DirectShares received by the deleted account", () => {
  let userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds) {
      await prisma.user.deleteMany({ where: { id } });
    }
    userIds = [];
  });

  it("terminalizes a received PENDING share, releases its image retention, and leaves it non-actionable", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    userIds.push(sender.id, recipient.id);

    const asset = await prisma.imageAsset.create({
      data: {
        storageKey: `images/test/${randomUUID()}.webp`,
        uploadedByUserId: sender.id,
      },
    });
    const dishId = await dishService.createDish(
      sender.id,
      "RECIPE",
      content({ imageAssetId: asset.id }),
    );
    const versionId = (
      await prisma.dish.findUniqueOrThrow({ where: { id: dishId } })
    ).currentVersionId!;
    const { directShareId } = await sendItem(sender.id, {
      dishId,
      recipientEmail: recipient.email,
    });
    // Detach the image from the live Version so the frozen PENDING delivery
    // is the only remaining protection — isolates the retention-release
    // assertion below from the ordinary DishVersion reference count.
    await dishService.updateVersionMetadata(sender.id, dishId, versionId, {
      description: null,
      imageAssetId: null,
    });

    await deleteAccount(recipient.id);
    userIds = userIds.filter((id) => id !== recipient.id);

    const share = await prisma.directShare.findUniqueOrThrow({
      where: { id: directShareId },
    });
    expect(share.status).toBe("CANCELED");
    expect(share.recipientId).toBeNull();
    expect(share.senderId).toBe(sender.id);

    // Not previewable by the sender (or anyone) anymore.
    await expect(
      sharingService.getDirectSharePreview(sender.id, directShareId),
    ).rejects.toBeInstanceOf(NotFoundError);
    // Not actionable — the deleted recipient's id no longer matches the
    // (now-null) recipientId, so neither accept nor decline can resolve it.
    await expect(
      sharingService.acceptDirectShare(recipient.id, directShareId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      sharingService.declineDirectShare(recipient.id, directShareId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      sharingService.isImageAssetVisibleViaDirectShare(
        sender.id,
        directShareId,
        asset.id,
      ),
    ).resolves.toBe(false);

    // No PENDING share protects this image anymore — the next ordinary
    // cleanup opportunity (e.g. the sender later editing/deleting their own
    // Dish) can free it.
    const freedStorageKey = await prisma.$transaction((tx) =>
      deleteImageAssetIfOrphaned(tx, asset.id),
    );
    expect(freedStorageKey).toBe(asset.storageKey);
  });

  it("does not rewrite an already-terminal received share", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    userIds.push(sender.id, recipient.id);

    const dishId = await dishService.createDish(sender.id, "RECIPE", content());
    const { directShareId } = await sendItem(sender.id, {
      dishId,
      recipientEmail: recipient.email,
    });
    const declined = await sharingService.declineDirectShare(
      recipient.id,
      directShareId,
    );
    expect(declined.outcome).toBe("declined");

    await deleteAccount(recipient.id);
    userIds = userIds.filter((id) => id !== recipient.id);

    const share = await prisma.directShare.findUniqueOrThrow({
      where: { id: directShareId },
    });
    expect(share.status).toBe("DECLINED");
  });

  it("does not touch another recipient's already-accepted share or copy", async () => {
    const sender = await createTestUser();
    const pendingRecipient = await createTestUser();
    const acceptedRecipient = await createTestUser();
    userIds.push(sender.id, pendingRecipient.id, acceptedRecipient.id);

    const dishId = await dishService.createDish(sender.id, "RECIPE", content());
    await sendItem(sender.id, {
      dishId,
      recipientEmail: pendingRecipient.email,
    });
    const { directShareId: acceptedShareId } = await sendItem(sender.id, {
      dishId,
      recipientEmail: acceptedRecipient.email,
    });
    const accepted = await sharingService.acceptDirectShare(
      acceptedRecipient.id,
      acceptedShareId,
    );
    if (accepted.outcome !== "accepted") {
      throw new Error("unexpected outcome");
    }

    await deleteAccount(pendingRecipient.id);
    userIds = userIds.filter((id) => id !== pendingRecipient.id);

    const acceptedShare = await prisma.directShare.findUniqueOrThrow({
      where: { id: acceptedShareId },
    });
    expect(acceptedShare.status).toBe("ACCEPTED");
    expect(acceptedShare.recipientId).toBe(acceptedRecipient.id);
    const copy = await prisma.dish.findUniqueOrThrow({
      where: { id: accepted.dishId },
    });
    expect(copy.ownerId).toBe(acceptedRecipient.id);
  });
});

describe("revokeAuthSession authorization", () => {
  let ownerId: string | undefined;
  let otherUserId: string | undefined;

  afterEach(async () => {
    if (ownerId) {
      await deleteTestUser(ownerId);
      ownerId = undefined;
    }
    if (otherUserId) {
      await deleteTestUser(otherUserId);
      otherUserId = undefined;
    }
  });

  it("rejects revoking a session that belongs to a different account", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;
    const other = await createTestUser();
    otherUserId = other.id;

    const otherSession = await prisma.session.create({
      data: {
        id: `${other.id}-session`,
        token: `${other.id}-token`,
        userId: other.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    await expect(
      revokeAuthSession(owner.id, otherSession.id),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects revoking a session id that doesn't exist", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;

    await expect(
      revokeAuthSession(owner.id, "nonexistent-session-id"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("deleting one of an account's own sessions leaves its other sessions intact", async () => {
    const owner = await createTestUser();
    ownerId = owner.id;

    const sessionA = await prisma.session.create({
      data: {
        id: `${owner.id}-session-a`,
        token: `${owner.id}-token-a`,
        userId: owner.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    const sessionB = await prisma.session.create({
      data: {
        id: `${owner.id}-session-b`,
        token: `${owner.id}-token-b`,
        userId: owner.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    await prisma.session.delete({ where: { id: sessionA.id } });

    const remaining = await prisma.session.findMany({
      where: { userId: owner.id },
    });
    expect(remaining.map((s) => s.id)).toEqual([sessionB.id]);
  });
});
