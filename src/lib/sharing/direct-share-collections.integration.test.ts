import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import { deleteAccount } from "@/lib/account/service";
import { initializeNewUser } from "@/lib/account/init";
import { normalizeEmail } from "@/lib/auth/email";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import type { DishContentInput } from "@/lib/dishes/schema";
import {
  sendDirectShareCollection,
  listSentDirectShareCollections,
  listReceivedDirectShareCollections,
  cancelDirectShareCollection,
  finalizeDirectShareCollectionDecision,
  claimPendingDirectShareCollections,
  reconcilePendingDirectShareCollectionsForViewer,
  getDirectShareCollectionDetail,
  getDirectShareHistoryForRecipient,
} from "@/lib/sharing/collections";
import {
  getDirectSharePreview,
  isImageAssetVisibleViaDirectShare,
  acceptDirectShare,
} from "@/lib/sharing/service";
import { DIRECT_SHARE_MAX_ITEMS } from "@/lib/sharing/schema";

// Several tests below permanently delete a source or copied Dish — same
// Blob-cleanup mock direct-sharing.integration.test.ts already uses.
vi.mock("@vercel/blob", () => ({ del: vi.fn(async () => {}) }));

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

async function currentVersionId(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  return dish.currentVersionId!;
}

async function toItems(
  dishIds: string[],
): Promise<{ dishId: string; dishVersionId: string }[]> {
  return Promise.all(
    dishIds.map(async (dishId) => ({
      dishId,
      dishVersionId: await currentVersionId(dishId),
    })),
  );
}

async function newUser(overrides?: { email?: string }) {
  const user = await createTestUser(overrides);
  return user;
}

async function withCleanup(
  userIds: string[],
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } finally {
    for (const id of userIds) {
      await prisma.user
        .findUnique({ where: { id } })
        .then((row) => row && deleteTestUser(id))
        .catch(() => {});
    }
  }
}

describe("sendDirectShareCollection", () => {
  it("sends a single-Recipe collection to an existing recipient, binding recipientId immediately", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "One Recipe" }),
      );

      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([dishId]),
        note: "Try this one",
      });

      const sent = await listSentDirectShareCollections(sender.id);
      const collection = sent.find((c) => c.id === collectionId)!;
      expect(collection.hasJoined).toBe(true);
      expect(collection.children).toHaveLength(1);
      expect(collection.children[0].status).toBe("PENDING");
      expect(collection.children[0].dishTitleSnapshot).toBe("One Recipe");

      const received = await listReceivedDirectShareCollections(recipient.id);
      expect(received.some((c) => c.id === collectionId)).toBe(true);
    });
  });

  it("sends a multi-Recipe collection with one child per Recipe, all frozen at Send time", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishA = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Recipe A" }),
      );
      const dishB = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Recipe B" }),
      );

      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([dishA, dishB]),
        note: "Try both of these",
      });

      const detail = await getDirectShareCollectionDetail(
        sender.id,
        collectionId,
      );
      expect(detail.children).toHaveLength(2);
      expect(detail.children.map((c) => c.dishTitleSnapshot).sort()).toEqual([
        "Recipe A",
        "Recipe B",
      ]);
      expect(detail.children.every((c) => c.status === "PENDING")).toBe(true);
      expect(detail.note).toBe("Try both of these");

      // One Send note on the envelope, surfaced identically through every
      // child's own preview -- never duplicated per item.
      const previews = await Promise.all(
        detail.children.map((c) => getDirectSharePreview(recipient.id, c.id)),
      );
      expect(previews.every((p) => p.note === "Try both of these")).toBe(true);
    });
  });

  it("sends a Part through the same collection flow as a Recipe", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const partId = await dishService.createDish(
        sender.id,
        "PART",
        content({ title: "Shared Part" }),
      );

      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([partId]),
        note: null,
      });

      const detail = await getDirectShareCollectionDetail(
        sender.id,
        collectionId,
      );
      expect(detail.children).toHaveLength(1);
      expect(detail.children[0].dishKind).toBe("PART");
      expect(detail.children[0].dishTitleSnapshot).toBe("Shared Part");
    });
  });

  it("sends a mixed Recipe + Part collection in a single envelope", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const recipeId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Mixed Recipe" }),
      );
      const partId = await dishService.createDish(
        sender.id,
        "PART",
        content({ title: "Mixed Part" }),
      );

      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([recipeId, partId]),
        note: null,
      });

      const detail = await getDirectShareCollectionDetail(
        recipient.id,
        collectionId,
      );
      expect(detail.children).toHaveLength(2);
      const kinds = detail.children.map((c) => c.dishKind).sort();
      expect(kinds).toEqual(["PART", "RECIPE"]);

      const result = await finalizeDirectShareCollectionDecision(
        recipient.id,
        collectionId,
        detail.children.map((c) => c.id),
      );
      expect(result.accepted).toHaveLength(2);
      const copiedKinds = (
        await Promise.all(
          result.accepted.map((a) =>
            prisma.dish.findUniqueOrThrow({
              where: { id: a.dishId },
              select: { kind: true },
            }),
          ),
        )
      )
        .map((d) => d.kind)
        .sort();
      expect(copiedKinds).toEqual(["PART", "RECIPE"]);
    });
  });

  it("creates a pending collection with a normalized email and null recipientId for a not-yet-registered recipient, without creating any User row", async () => {
    const sender = await newUser();
    await withCleanup([sender.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Unregistered Target" }),
      );
      const targetEmail = "  Unregistered.Person@Example.INVALID  ";

      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: targetEmail,
        items: await toItems([dishId]),
        note: null,
      });

      const sent = await listSentDirectShareCollections(sender.id);
      const collection = sent.find((c) => c.id === collectionId)!;
      expect(collection.hasJoined).toBe(false);
      expect(collection.recipientLookup).toBe(
        "unregistered.person@example.invalid",
      );
      expect(collection.recipientName).toBeNull();

      const userRow = await prisma.user.findFirst({
        where: { email: { equals: "unregistered.person@example.invalid" } },
      });
      expect(userRow).toBeNull();
    });
  });

  it("lets the sender cancel a pending collection to an unregistered recipient, and no other user can preview or view its images", async () => {
    const sender = await newUser();
    const stranger = await newUser();
    await withCleanup([sender.id, stranger.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Cancel Me" }),
      );
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: "nobody-yet@example.invalid",
        items: await toItems([dishId]),
        note: null,
      });

      const detail = await getDirectShareCollectionDetail(
        sender.id,
        collectionId,
      );
      const childId = detail.children[0].id;

      await expect(
        getDirectSharePreview(stranger.id, childId),
      ).rejects.toThrow();
      expect(
        await isImageAssetVisibleViaDirectShare(
          stranger.id,
          childId,
          "nonexistent-asset",
        ),
      ).toBe(false);

      await cancelDirectShareCollection(sender.id, collectionId);
      const afterCancel = await listSentDirectShareCollections(sender.id);
      const canceled = afterCancel.find((c) => c.id === collectionId)!;
      expect(canceled.children[0].status).toBe("CANCELED");
    });
  });

  it("does not create a partial collection when one selected Recipe is not owned by the sender", async () => {
    const sender = await newUser();
    const otherOwner = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, otherOwner.id, recipient.id], async () => {
      const ownDishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Owned" }),
      );
      const notOwnedDishId = await dishService.createDish(
        otherOwner.id,
        "RECIPE",
        content({ title: "Not owned" }),
      );

      await expect(
        sendDirectShareCollection(sender.id, {
          recipientEmail: recipient.email,
          items: await toItems([ownDishId, notOwnedDishId]),
          note: null,
        }),
      ).rejects.toThrow(NotFoundError);

      const sent = await listSentDirectShareCollections(sender.id);
      expect(sent).toHaveLength(0);
    });
  });

  it("prevents a duplicate pending Recipe-to-recipient-email send, whether or not the recipient is registered", async () => {
    const sender = await newUser();
    await withCleanup([sender.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Duplicate Target" }),
      );
      await sendDirectShareCollection(sender.id, {
        recipientEmail: "pending-target@example.invalid",
        items: await toItems([dishId]),
        note: null,
      });

      await expect(
        sendDirectShareCollection(sender.id, {
          recipientEmail: "pending-target@example.invalid",
          items: await toItems([dishId]),
          note: null,
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  it("two genuinely concurrent sends of the same item to the same sender/recipient produce exactly one pending collection", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Race Target" }),
      );
      const input = {
        recipientEmail: recipient.email,
        items: await toItems([dishId]),
        note: null,
      };

      // The DB-backed `one_pending_direct_share_per_sender_dish_recipient_email`
      // partial unique index is what actually closes this race — the
      // application-level pre-check alone cannot, since both calls can pass
      // it before either commits.
      const results = await Promise.allSettled([
        sendDirectShareCollection(sender.id, input),
        sendDirectShareCollection(sender.id, input),
      ]);

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<{ collectionId: string }> =>
          r.status === "fulfilled",
      );
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);

      const pendingRows = await prisma.directShare.findMany({
        where: { senderId: sender.id, dishId, status: "PENDING" },
      });
      expect(pendingRows).toHaveLength(1);
    });
  });

  it("rejects sending to yourself", async () => {
    const sender = await newUser();
    await withCleanup([sender.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Self Send" }),
      );
      await expect(
        sendDirectShareCollection(sender.id, {
          recipientEmail: sender.email.toUpperCase(),
          items: await toItems([dishId]),
          note: null,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  it("does not change an already-sent collection's frozen content when the source Recipe is edited afterward", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Before Edit" }),
      );
      const baseVersionId = await currentVersionId(dishId);
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([dishId]),
        note: null,
      });

      await dishService.editDish(
        sender.id,
        dishId,
        baseVersionId,
        content({ title: "After Edit" }),
        "MAJOR",
      );

      const detail = await getDirectShareCollectionDetail(
        recipient.id,
        collectionId,
      );
      expect(detail.children[0].dishTitleSnapshot).toBe("Before Edit");
      const childId = detail.children[0].id;
      const preview = await getDirectSharePreview(recipient.id, childId);
      expect(preview.content.title).toBe("Before Edit");
    });
  });
});

describe("finalizeDirectShareCollectionDecision", () => {
  it("accept-all creates an independent copy for every child", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishA = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Accept A" }),
      );
      const dishB = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Accept B" }),
      );
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([dishA, dishB]),
        note: null,
      });
      const detail = await getDirectShareCollectionDetail(
        recipient.id,
        collectionId,
      );
      const allIds = detail.children.map((c) => c.id);

      const result = await finalizeDirectShareCollectionDecision(
        recipient.id,
        collectionId,
        allIds,
      );
      expect(result.accepted).toHaveLength(2);
      expect(result.declined).toHaveLength(0);

      for (const accepted of result.accepted) {
        const copy = await prisma.dish.findUnique({
          where: { id: accepted.dishId },
        });
        expect(copy?.ownerId).toBe(recipient.id);
      }
    });
  });

  it("accept-subset accepts selected children and declines the rest; retry does not duplicate copies", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishA = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Subset A" }),
      );
      const dishB = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Subset B" }),
      );
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([dishA, dishB]),
        note: null,
      });
      const detail = await getDirectShareCollectionDetail(
        recipient.id,
        collectionId,
      );
      const acceptChild = detail.children.find(
        (c) => c.dishTitleSnapshot === "Subset A",
      )!;

      const result = await finalizeDirectShareCollectionDecision(
        recipient.id,
        collectionId,
        [acceptChild.id],
      );
      expect(result.accepted).toHaveLength(1);
      expect(result.declined).toHaveLength(1);

      const retry = await finalizeDirectShareCollectionDecision(
        recipient.id,
        collectionId,
        [acceptChild.id],
      );
      expect(retry.accepted).toHaveLength(0);
      expect(retry.declined).toHaveLength(0);

      const dishCount = await prisma.dish.count({
        where: { ownerId: recipient.id, currentTitle: "Subset A" },
      });
      expect(dishCount).toBe(1);
    });
  });

  it("decline-all declines every pending child and creates no copies", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Decline Me" }),
      );
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([dishId]),
        note: null,
      });

      const result = await finalizeDirectShareCollectionDecision(
        recipient.id,
        collectionId,
        [],
      );
      expect(result.accepted).toHaveLength(0);
      expect(result.declined).toHaveLength(1);
      const dishCount = await prisma.dish.count({
        where: { ownerId: recipient.id, currentTitle: "Decline Me" },
      });
      expect(dishCount).toBe(0);
    });
  });
});

describe("getDirectShareHistoryForRecipient (Send picker resend-prevention)", () => {
  it("reports ACCEPTED for a Dish already accepted by this recipient, PENDING for a currently pending one, and omits a never-shared Dish", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const acceptedDish = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Accepted Already" }),
      );
      const pendingDish = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Still Pending" }),
      );
      const untouchedDish = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Never Sent" }),
      );

      const { collectionId: acceptedCollectionId } =
        await sendDirectShareCollection(sender.id, {
          recipientEmail: recipient.email,
          items: await toItems([acceptedDish]),
          note: null,
        });
      const acceptedDetail = await getDirectShareCollectionDetail(
        recipient.id,
        acceptedCollectionId,
      );
      await finalizeDirectShareCollectionDecision(
        recipient.id,
        acceptedCollectionId,
        acceptedDetail.children.map((c) => c.id),
      );

      await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([pendingDish]),
        note: null,
      });

      const history = await getDirectShareHistoryForRecipient(
        sender.id,
        recipient.email,
      );
      expect(history[acceptedDish]).toBe("ACCEPTED");
      expect(history[pendingDish]).toBe("PENDING");
      expect(history[untouchedDish]).toBeUndefined();
    });
  });

  it("leaves a Dish eligible again after its only share to that recipient was canceled", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Canceled Then Resendable" }),
      );
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([dishId]),
        note: null,
      });
      await cancelDirectShareCollection(sender.id, collectionId);

      const history = await getDirectShareHistoryForRecipient(
        sender.id,
        recipient.email,
      );
      expect(history[dishId]).toBeUndefined();
    });
  });

  it("does not report a share made to a different recipient", async () => {
    const sender = await newUser();
    const recipientA = await newUser();
    const recipientB = await newUser();
    await withCleanup([sender.id, recipientA.id, recipientB.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Sent To A Only" }),
      );
      await sendDirectShareCollection(sender.id, {
        recipientEmail: recipientA.email,
        items: await toItems([dishId]),
        note: null,
      });

      const historyForB = await getDirectShareHistoryForRecipient(
        sender.id,
        recipientB.email,
      );
      expect(historyForB[dishId]).toBeUndefined();
    });
  });
});

describe("claimPendingDirectShareCollections", () => {
  it("binds every pending collection addressed to a newly verified email, without auto-accepting anything", async () => {
    const sender = await newUser();
    const claimEmail = `claim-target-${Date.now()}@example.invalid`;
    await withCleanup([sender.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Claimable" }),
      );
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: claimEmail,
        items: await toItems([dishId]),
        note: null,
      });

      const newRecipient = await newUser({ email: claimEmail });
      await withCleanup([newRecipient.id], async () => {
        await claimPendingDirectShareCollections(
          newRecipient.id,
          claimEmail,
          true,
        );

        const received = await listReceivedDirectShareCollections(
          newRecipient.id,
        );
        const claimed = received.find((c) => c.id === collectionId);
        expect(claimed).toBeDefined();
        expect(claimed!.children[0].status).toBe("PENDING");
      });
    });
  });

  it("does not claim for an unverified email", async () => {
    const sender = await newUser();
    const claimEmail = `unverified-${Date.now()}@example.invalid`;
    await withCleanup([sender.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Unverified Claim" }),
      );
      await sendDirectShareCollection(sender.id, {
        recipientEmail: claimEmail,
        items: await toItems([dishId]),
        note: null,
      });

      const newRecipient = await newUser({ email: claimEmail });
      await withCleanup([newRecipient.id], async () => {
        await claimPendingDirectShareCollections(
          newRecipient.id,
          claimEmail,
          false,
        );
        const received = await listReceivedDirectShareCollections(
          newRecipient.id,
        );
        expect(received).toHaveLength(0);
      });
    });
  });

  it("does not claim an invitation addressed to a different email", async () => {
    const sender = await newUser();
    const claimEmail = `right-target-${Date.now()}@example.invalid`;
    await withCleanup([sender.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Wrong Email Claim" }),
      );
      await sendDirectShareCollection(sender.id, {
        recipientEmail: claimEmail,
        items: await toItems([dishId]),
        note: null,
      });

      const differentUser = await newUser();
      await withCleanup([differentUser.id], async () => {
        await claimPendingDirectShareCollections(
          differentUser.id,
          differentUser.email,
          true,
        );
        const received = await listReceivedDirectShareCollections(
          differentUser.id,
        );
        expect(received).toHaveLength(0);
      });
    });
  });

  it("repeated/concurrent claim calls are idempotent", async () => {
    const sender = await newUser();
    const claimEmail = `idempotent-${Date.now()}@example.invalid`;
    await withCleanup([sender.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Idempotent Claim" }),
      );
      await sendDirectShareCollection(sender.id, {
        recipientEmail: claimEmail,
        items: await toItems([dishId]),
        note: null,
      });

      const newRecipient = await newUser({ email: claimEmail });
      await withCleanup([newRecipient.id], async () => {
        await Promise.all([
          claimPendingDirectShareCollections(newRecipient.id, claimEmail, true),
          claimPendingDirectShareCollections(newRecipient.id, claimEmail, true),
        ]);
        const received = await listReceivedDirectShareCollections(
          newRecipient.id,
        );
        expect(received).toHaveLength(1);
      });
    });
  });

  it("never claims a collection that was fully canceled before the recipient signed in", async () => {
    const sender = await newUser();
    const claimEmail = `canceled-before-claim-${Date.now()}@example.invalid`;
    await withCleanup([sender.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Canceled Before Claim" }),
      );
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: claimEmail,
        items: await toItems([dishId]),
        note: null,
      });
      await cancelDirectShareCollection(sender.id, collectionId);

      const newRecipient = await newUser({ email: claimEmail });
      await withCleanup([newRecipient.id], async () => {
        await claimPendingDirectShareCollections(
          newRecipient.id,
          claimEmail,
          true,
        );
        const received = await listReceivedDirectShareCollections(
          newRecipient.id,
        );
        expect(received).toHaveLength(0);
      });
    });
  });
});

describe("reconcilePendingDirectShareCollectionsForViewer (Slice 22 /share race repair)", () => {
  it("binds a stranded invitation whose recipient's account init already completed, without accepting or copying anything", async () => {
    const sender = await newUser();
    const recipientEmail = `stranded-${Date.now()}@example.invalid`;
    const recipient = await newUser({ email: recipientEmail });
    await withCleanup([sender.id, recipient.id], async () => {
      // Recipient's account init already ran to completion (as
      // account/init.integration.test.ts's own tests exercise) BEFORE the
      // stranded collection below ever existed — modeling that the
      // one-shot claim window has already closed for this account.
      await prisma.user.update({
        where: { id: recipient.id },
        data: { emailVerified: true },
      });
      await initializeNewUser(recipient.id);

      // Deliberately bypasses sendDirectShareCollection's own recipient
      // lookup so recipientId stays null despite a matching, already-
      // verified account existing — this is exactly the acknowledged race
      // (sender's exact-email lookup executing a few ms ahead of the
      // recipient's row becoming visible).
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Stranded Invitation" }),
      );
      const dishVersionId = await currentVersionId(dishId);
      const collection = await prisma.directShareCollection.create({
        data: {
          senderId: sender.id,
          recipientId: null,
          recipientLookup: normalizeEmail(recipientEmail),
          note: null,
        },
      });
      await prisma.directShare.create({
        data: {
          senderId: sender.id,
          recipientId: null,
          recipientLookup: normalizeEmail(recipientEmail),
          dishId,
          dishVersionId,
          dishTitleSnapshot: "Stranded Invitation",
          frozenGraph: {},
          collectionId: collection.id,
        },
      });

      await reconcilePendingDirectShareCollectionsForViewer(recipient.id);

      const bound = await prisma.directShareCollection.findUniqueOrThrow({
        where: { id: collection.id },
      });
      expect(bound.recipientId).toBe(recipient.id);

      const received = await listReceivedDirectShareCollections(recipient.id);
      const claimed = received.find((c) => c.id === collection.id);
      expect(claimed).toBeDefined();
      expect(claimed!.children).toHaveLength(1);
      expect(claimed!.children[0].status).toBe("PENDING");
      expect(claimed!.children[0].createdDishId).toBeNull();

      const copies = await prisma.dish.count({
        where: { ownerId: recipient.id, currentTitle: "Stranded Invitation" },
      });
      expect(copies).toBe(0);
    });
  });

  it("is idempotent — repeated reconciliation creates no duplicate collections, children, or accepted copies", async () => {
    const sender = await newUser();
    const recipientEmail = `stranded-idempotent-${Date.now()}@example.invalid`;
    const recipient = await newUser({ email: recipientEmail });
    await withCleanup([sender.id, recipient.id], async () => {
      await prisma.user.update({
        where: { id: recipient.id },
        data: { emailVerified: true },
      });
      await initializeNewUser(recipient.id);

      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Stranded Idempotent" }),
      );
      const dishVersionId = await currentVersionId(dishId);
      const collection = await prisma.directShareCollection.create({
        data: {
          senderId: sender.id,
          recipientId: null,
          recipientLookup: normalizeEmail(recipientEmail),
          note: null,
        },
      });
      await prisma.directShare.create({
        data: {
          senderId: sender.id,
          recipientId: null,
          recipientLookup: normalizeEmail(recipientEmail),
          dishId,
          dishVersionId,
          dishTitleSnapshot: "Stranded Idempotent",
          frozenGraph: {},
          collectionId: collection.id,
        },
      });

      await Promise.all([
        reconcilePendingDirectShareCollectionsForViewer(recipient.id),
        reconcilePendingDirectShareCollectionsForViewer(recipient.id),
      ]);
      await reconcilePendingDirectShareCollectionsForViewer(recipient.id);

      const received = await listReceivedDirectShareCollections(recipient.id);
      expect(received).toHaveLength(1);
      expect(received[0].children).toHaveLength(1);

      const collectionCount = await prisma.directShareCollection.count({
        where: {
          senderId: sender.id,
          recipientLookup: normalizeEmail(recipientEmail),
        },
      });
      expect(collectionCount).toBe(1);

      // Reconciliation never accepts/copies — retrying it must not create
      // any Dish copy either.
      const copies = await prisma.dish.count({
        where: { ownerId: recipient.id },
      });
      expect(copies).toBe(0);
    });
  });

  it("does not let a different authenticated email claim the collection", async () => {
    const sender = await newUser();
    const recipientEmail = `right-target-viewer-${Date.now()}@example.invalid`;
    const wrongUser = await newUser();
    await withCleanup([sender.id, wrongUser.id], async () => {
      await prisma.user.update({
        where: { id: wrongUser.id },
        data: { emailVerified: true },
      });
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Wrong Viewer Target" }),
      );
      await sendDirectShareCollection(sender.id, {
        recipientEmail,
        items: await toItems([dishId]),
        note: null,
      });

      await reconcilePendingDirectShareCollectionsForViewer(wrongUser.id);

      const received = await listReceivedDirectShareCollections(wrongUser.id);
      expect(received).toHaveLength(0);
    });
  });

  it("does not claim for an authenticated but unverified email", async () => {
    const sender = await newUser();
    const recipientEmail = `unverified-viewer-${Date.now()}@example.invalid`;
    await withCleanup([sender.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Unverified Viewer Target" }),
      );
      // Sent while the recipient email has no account yet, so recipientId
      // stays null — otherwise sendDirectShareCollection's own immediate
      // exact-email bind would claim it regardless of this test's intent.
      await sendDirectShareCollection(sender.id, {
        recipientEmail,
        items: await toItems([dishId]),
        note: null,
      });

      // createTestUser defaults emailVerified to false — left unverified
      // here on purpose, created only now (after send) so the send-time
      // lookup above still found no account.
      const recipient = await newUser({ email: recipientEmail });
      await withCleanup([recipient.id], async () => {
        await reconcilePendingDirectShareCollectionsForViewer(recipient.id);

        const received = await listReceivedDirectShareCollections(recipient.id);
        expect(received).toHaveLength(0);
      });
    });
  });

  it("never claims a fully sender-canceled collection, and binds only the still-pending children of a partially canceled one", async () => {
    const sender = await newUser();
    const recipientEmail = `partial-cancel-viewer-${Date.now()}@example.invalid`;
    await withCleanup([sender.id], async () => {
      // Every send below happens while recipientEmail has no account yet
      // (recipient is created only after), so recipientId stays null on
      // every collection — otherwise sendDirectShareCollection's own
      // immediate exact-email bind would claim them at send time, and this
      // test would no longer be exercising the claim/reconcile path at all.

      // Fully canceled collection: must stay unclaimable entirely.
      const fullyCanceledDishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Fully Canceled Target" }),
      );
      const { collectionId: fullyCanceledId } = await sendDirectShareCollection(
        sender.id,
        {
          recipientEmail,
          items: await toItems([fullyCanceledDishId]),
          note: null,
        },
      );
      await cancelDirectShareCollection(sender.id, fullyCanceledId);

      // Partially canceled collection: still claimable (one child stays
      // PENDING), but its already-CANCELED sibling (via source-deletion
      // cancellation, same as the existing "source deletion" coverage
      // above) must remain CANCELED and must not gain a recipientId.
      const pendingDishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Partial Cancel Pending" }),
      );
      const canceledDishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Partial Cancel Deleted Source" }),
      );
      const { collectionId: partialId } = await sendDirectShareCollection(
        sender.id,
        {
          recipientEmail,
          items: await toItems([pendingDishId, canceledDishId]),
          note: null,
        },
      );
      await dishService.deleteDish(sender.id, canceledDishId, "RECIPE");

      const recipient = await newUser({ email: recipientEmail });
      await withCleanup([recipient.id], async () => {
        await prisma.user.update({
          where: { id: recipient.id },
          data: { emailVerified: true },
        });

        await reconcilePendingDirectShareCollectionsForViewer(recipient.id);

        const received = await listReceivedDirectShareCollections(recipient.id);
        expect(received.some((c) => c.id === fullyCanceledId)).toBe(false);

        const partial = received.find((c) => c.id === partialId);
        expect(partial).toBeDefined();
        const pendingChild = partial!.children.find(
          (c) => c.dishTitleSnapshot === "Partial Cancel Pending",
        )!;
        const canceledChild = partial!.children.find(
          (c) => c.dishTitleSnapshot === "Partial Cancel Deleted Source",
        )!;
        expect(pendingChild.status).toBe("PENDING");
        expect(canceledChild.status).toBe("CANCELED");

        const canceledRow = await prisma.directShare.findUniqueOrThrow({
          where: { id: canceledChild.id },
        });
        expect(canceledRow.recipientId).toBeNull();
      });
    });
  });
});

describe("50/51-Recipe collection boundary", () => {
  it("sends exactly 50 owned Recipes atomically as one collection, and the recipient can accept all 50 with no duplicate copies on retry", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishIds = await Promise.all(
        Array.from({ length: DIRECT_SHARE_MAX_ITEMS }, (_, i) =>
          dishService.createDish(
            sender.id,
            "RECIPE",
            content({ title: `Boundary Recipe ${i}` }),
          ),
        ),
      );

      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems(dishIds),
        note: null,
      });

      const collectionCount = await prisma.directShareCollection.count({
        where: { senderId: sender.id },
      });
      expect(collectionCount).toBe(1);

      const detail = await getDirectShareCollectionDetail(
        recipient.id,
        collectionId,
      );
      expect(detail.children).toHaveLength(DIRECT_SHARE_MAX_ITEMS);
      expect(detail.children.every((c) => c.status === "PENDING")).toBe(true);

      const allIds = detail.children.map((c) => c.id);
      const result = await finalizeDirectShareCollectionDecision(
        recipient.id,
        collectionId,
        allIds,
      );
      expect(result.accepted).toHaveLength(DIRECT_SHARE_MAX_ITEMS);
      expect(result.declined).toHaveLength(0);

      const copyCount = await prisma.dish.count({
        where: { ownerId: recipient.id },
      });
      expect(copyCount).toBe(DIRECT_SHARE_MAX_ITEMS);

      // Retry (e.g. a resubmitted review action) must not create any
      // further copies — every child is already ACCEPTED.
      const retry = await finalizeDirectShareCollectionDecision(
        recipient.id,
        collectionId,
        allIds,
      );
      expect(retry.accepted).toHaveLength(0);
      expect(retry.declined).toHaveLength(0);

      const copyCountAfterRetry = await prisma.dish.count({
        where: { ownerId: recipient.id },
      });
      expect(copyCountAfterRetry).toBe(DIRECT_SHARE_MAX_ITEMS);
    });
  }, 60_000);

  it("rejects 51 selected Recipes and creates no collection or partial children", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishIds = await Promise.all(
        Array.from({ length: DIRECT_SHARE_MAX_ITEMS + 1 }, (_, i) =>
          dishService.createDish(
            sender.id,
            "RECIPE",
            content({ title: `Over Boundary Recipe ${i}` }),
          ),
        ),
      );

      await expect(
        sendDirectShareCollection(sender.id, {
          recipientEmail: recipient.email,
          items: await toItems(dishIds),
          note: null,
        }),
      ).rejects.toThrow(ValidationError);

      const collectionCount = await prisma.directShareCollection.count({
        where: { senderId: sender.id },
      });
      expect(collectionCount).toBe(0);
      const childCount = await prisma.directShare.count({
        where: { senderId: sender.id },
      });
      expect(childCount).toBe(0);
    });
  }, 60_000);
});

describe("durability across deletion", () => {
  it("accepted-copy deletion preserves the ACCEPTED status on the child row", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Durable Accept" }),
      );
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([dishId]),
        note: null,
      });
      const detail = await getDirectShareCollectionDetail(
        recipient.id,
        collectionId,
      );
      const childId = detail.children[0].id;
      const result = await finalizeDirectShareCollectionDecision(
        recipient.id,
        collectionId,
        [childId],
      );
      const copiedDishId = result.accepted[0].dishId;

      await dishService.deleteDish(recipient.id, copiedDishId, "RECIPE");

      const afterDeletion = await getDirectShareCollectionDetail(
        recipient.id,
        collectionId,
      );
      expect(afterDeletion.children[0].status).toBe("ACCEPTED");
      expect(afterDeletion.children[0].createdDishId).toBeNull();
    });
  });

  it("permanently deleting the source Recipe cancels the still-pending child but not an already-accepted one", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    await withCleanup([sender.id, recipient.id], async () => {
      const dishA = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Source Deleted Pending" }),
      );
      const dishB = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Source Deleted Accepted" }),
      );
      const { collectionId } = await sendDirectShareCollection(sender.id, {
        recipientEmail: recipient.email,
        items: await toItems([dishA, dishB]),
        note: null,
      });
      const detail = await getDirectShareCollectionDetail(
        recipient.id,
        collectionId,
      );
      const acceptedChild = detail.children.find(
        (c) => c.dishTitleSnapshot === "Source Deleted Accepted",
      )!;
      // Accepts this one child directly (not via finalize, which would also
      // decline its still-pending sibling) — leaves the other child PENDING
      // so this test can prove source deletion only cancels that one.
      await acceptDirectShare(recipient.id, acceptedChild.id);

      await dishService.deleteDish(sender.id, dishA, "RECIPE");

      const afterDeletion = await getDirectShareCollectionDetail(
        recipient.id,
        collectionId,
      );
      const pendingChild = afterDeletion.children.find(
        (c) => c.dishTitleSnapshot === "Source Deleted Pending",
      )!;
      const stillAccepted = afterDeletion.children.find(
        (c) => c.dishTitleSnapshot === "Source Deleted Accepted",
      )!;
      expect(pendingChild.status).toBe("CANCELED");
      expect(stillAccepted.status).toBe("ACCEPTED");
    });
  });

  it("recipient account deletion terminalizes a still-pending received child before the recipient FK is cleared", async () => {
    const sender = await newUser();
    const recipient = await newUser();
    let recipientDeleted = false;
    await withCleanup([sender.id], async () => {
      try {
        const dishId = await dishService.createDish(
          sender.id,
          "RECIPE",
          content({ title: "Recipient Deleted" }),
        );
        const { collectionId } = await sendDirectShareCollection(sender.id, {
          recipientEmail: recipient.email,
          items: await toItems([dishId]),
          note: null,
        });

        await deleteAccount(recipient.id);
        recipientDeleted = true;

        const sent = await listSentDirectShareCollections(sender.id);
        const collection = sent.find((c) => c.id === collectionId)!;
        expect(collection.children[0].status).toBe("CANCELED");
      } finally {
        if (!recipientDeleted) {
          await deleteTestUser(recipient.id);
        }
      }
    });
  });
});
