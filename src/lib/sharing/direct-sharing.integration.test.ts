import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import { deleteDish } from "@/lib/dishes/service";
import { deleteImageAssetIfOrphaned } from "@/lib/images/service";
import type { DishContentInput } from "@/lib/dishes/schema";
import { NotFoundError, AuthorizationError, ConflictError } from "@/lib/errors";
import {
  lookupDirectShareRecipient,
  sendDirectShare,
  cancelDirectShare,
  declineDirectShare,
  acceptDirectShare,
  getDirectSharePreview,
  isImageAssetVisibleViaDirectShare,
  listSentDirectShares,
  listReceivedDirectShares,
} from "@/lib/sharing/service";

// deleteDish's Blob-cleanup compensating step (Arch §D.2a/§I) makes a real
// @vercel/blob call — mocked here exactly as in sharing.integration.test.ts,
// since several tests below permanently delete a source or copied Dish.
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

async function currentVersionId(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  return dish.currentVersionId!;
}

function expectAccepted(
  result: Awaited<ReturnType<typeof acceptDirectShare>>,
): {
  dishId: string;
  dishKind: "RECIPE" | "PART";
} {
  if (result.outcome !== "accepted") {
    throw new Error(`Expected "accepted", got "${result.outcome}"`);
  }
  return result;
}

describe("direct account-to-account sharing (Slice 17)", () => {
  let userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds) {
      await deleteTestUser(id);
    }
    userIds = [];
  });

  async function newUser(overrides?: { email?: string }) {
    const user = await createTestUser(overrides);
    userIds.push(user.id);
    return user;
  }

  describe("lookupDirectShareRecipient", () => {
    it("finds an account by exact, case-insensitive email match", async () => {
      const requester = await newUser();
      const target = await newUser({
        email: `Target-${randomUUID()}@Example.Invalid`,
      });

      const found = await lookupDirectShareRecipient(
        requester.id,
        target.email.toLowerCase(),
      );
      expect(found).toEqual({ id: target.id, name: target.name });
    });

    it("excludes the requester's own account", async () => {
      const requester = await newUser();
      const found = await lookupDirectShareRecipient(
        requester.id,
        requester.email,
      );
      expect(found).toBeNull();
    });

    it("returns null for an email with no matching account", async () => {
      const requester = await newUser();
      const found = await lookupDirectShareRecipient(
        requester.id,
        `nobody-${randomUUID()}@example.invalid`,
      );
      expect(found).toBeNull();
    });

    it("exposes only id and name — never email, image, or account fields", async () => {
      const requester = await newUser();
      const target = await newUser();
      const found = await lookupDirectShareRecipient(
        requester.id,
        target.email,
      );
      expect(Object.keys(found ?? {}).sort()).toEqual(["id", "name"]);
    });
  });

  describe("sendDirectShare", () => {
    it("creates a pending DirectShare pinned to the current Version, with the sender's note preserved", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Ramen" }),
      );
      const versionId = await currentVersionId(dishId);

      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: "Try this one!",
      });

      const share = await prisma.directShare.findUniqueOrThrow({
        where: { id: directShareId },
      });
      expect(share.status).toBe("PENDING");
      expect(share.senderId).toBe(sender.id);
      expect(share.recipientId).toBe(recipient.id);
      expect(share.dishId).toBe(dishId);
      expect(share.dishVersionId).toBe(versionId);
      expect(share.dishTitleSnapshot).toBe("Ramen");
      expect(share.note).toBe("Try this one!");
    });

    it("works for a Part, not only a Recipe", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "PART",
        content({ title: "Chili Oil" }),
      );

      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });
      const share = await prisma.directShare.findUniqueOrThrow({
        where: { id: directShareId },
      });
      expect(share.note).toBeNull();
    });

    it("rejects sending an item the sender does not own", async () => {
      const owner = await newUser();
      const nonOwner = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );

      await expect(
        sendDirectShare(nonOwner.id, {
          dishId,
          recipientEmail: recipient.email,
          note: null,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects sending to an email with no DishFrame account", async () => {
      const sender = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      await expect(
        sendDirectShare(sender.id, {
          dishId,
          recipientEmail: `nobody-${randomUUID()}@example.invalid`,
          note: null,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects sharing to yourself", async () => {
      const sender = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      await expect(
        sendDirectShare(sender.id, {
          dishId,
          recipientEmail: sender.email,
          note: null,
        }),
      ).rejects.toThrow();
    });

    it("rejects a duplicate pending send for the same sender/recipient/item", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );

      await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });
      await expect(
        sendDirectShare(sender.id, {
          dishId,
          recipientEmail: recipient.email,
          note: null,
        }),
      ).rejects.toThrow();
    });

    it("two genuinely concurrent sends to the same sender/recipient/source produce exactly one pending delivery", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const input = { dishId, recipientEmail: recipient.email, note: null };

      // The DB-backed `one_pending_direct_share_per_sender_recipient_dish`
      // partial unique index is what actually closes this race — the
      // application-level pre-check alone cannot, since both calls can pass
      // it before either commits.
      const results = await Promise.allSettled([
        sendDirectShare(sender.id, input),
        sendDirectShare(sender.id, input),
      ]);

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<{ directShareId: string }> =>
          r.status === "fulfilled",
      );
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      // Both calls resolve safely and predictably — one succeeds, the other
      // gets the same deterministic duplicate-pending error a non-concurrent
      // duplicate would, never a raw database error.
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);

      const pendingRows = await prisma.directShare.findMany({
        where: {
          senderId: sender.id,
          recipientId: recipient.id,
          dishId,
          status: "PENDING",
        },
      });
      expect(pendingRows).toHaveLength(1);
      expect(pendingRows[0].id).toBe(fulfilled[0].value.directShareId);

      const received = await listReceivedDirectShares(recipient.id);
      expect(received).toHaveLength(1);

      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, pendingRows[0].id),
      );
      expect(
        await prisma.dish.count({ where: { ownerId: recipient.id } }),
      ).toBe(1);
      expect(copy.dishKind).toBe("RECIPE");

      // The row is now terminal (ACCEPTED) — a fresh send of the same
      // stable item to the same recipient is allowed again.
      const resend = await sendDirectShare(sender.id, input);
      expect(resend.directShareId).not.toBe(pendingRows[0].id);
    });

    it("rethrows a simulated unrelated unique violation rather than mislabeling it as duplicate-pending", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );

      // Shaped like a real P2002 (same code, same driver-adapter meta
      // envelope this codebase's Prisma version actually produces — see
      // `isDuplicatePendingDirectShareViolation`), but for a different
      // constraint entirely — proves the classifier doesn't blanket-treat
      // every P2002 from this operation as the duplicate-pending index.
      const unrelatedError = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`email`)",
        {
          code: "P2002",
          clientVersion: "test",
          meta: {
            modelName: "User",
            driverAdapterError: {
              name: "DriverAdapterError",
              cause: {
                originalCode: "23505",
                originalMessage:
                  'duplicate key value violates unique constraint "users_email_key"',
                kind: "UniqueConstraintViolation",
                constraint: { fields: ["email"] },
              },
            },
          },
        },
      );
      const spy = vi
        .spyOn(prisma.directShare, "create")
        .mockRejectedValueOnce(unrelatedError);

      await expect(
        sendDirectShare(sender.id, {
          dishId,
          recipientEmail: recipient.email,
          note: null,
        }),
      ).rejects.toBe(unrelatedError);

      spy.mockRestore();
    });
  });

  describe("cancelDirectShare", () => {
    it("lets the sender cancel a pending share, after which it can no longer be accepted or declined", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await cancelDirectShare(sender.id, directShareId);

      const share = await prisma.directShare.findUniqueOrThrow({
        where: { id: directShareId },
      });
      expect(share.status).toBe("CANCELED");

      const acceptResult = await acceptDirectShare(recipient.id, directShareId);
      expect(acceptResult).toEqual({
        outcome: "not_actionable",
        status: "CANCELED",
      });
      const declineResult = await declineDirectShare(
        recipient.id,
        directShareId,
      );
      expect(declineResult).toEqual({
        outcome: "not_actionable",
        status: "CANCELED",
      });
    });

    it("rejects cancellation by a non-sender", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const outsider = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await expect(
        cancelDirectShare(outsider.id, directShareId),
      ).rejects.toThrow(NotFoundError);
      const share = await prisma.directShare.findUniqueOrThrow({
        where: { id: directShareId },
      });
      expect(share.status).toBe("PENDING");
    });

    it("is a safe no-op when cancelling an already-cancelled or already-accepted share", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await cancelDirectShare(sender.id, directShareId);
      await cancelDirectShare(sender.id, directShareId); // repeated — must not throw
      const share = await prisma.directShare.findUniqueOrThrow({
        where: { id: directShareId },
      });
      expect(share.status).toBe("CANCELED");
    });
  });

  describe("declineDirectShare", () => {
    it("lets the intended recipient decline, creating no copy", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      const result = await declineDirectShare(recipient.id, directShareId);
      expect(result).toEqual({ outcome: "declined" });

      const recipientDishes = await prisma.dish.count({
        where: { ownerId: recipient.id },
      });
      expect(recipientDishes).toBe(0);
    });

    it("rejects decline by a non-recipient", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const outsider = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await expect(
        declineDirectShare(outsider.id, directShareId),
      ).rejects.toThrow(NotFoundError);
    });

    it("is idempotent on repeated decline calls", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await declineDirectShare(recipient.id, directShareId);
      const second = await declineDirectShare(recipient.id, directShareId);
      expect(second).toEqual({ outcome: "declined" });
    });
  });

  describe("acceptDirectShare", () => {
    it("creates an independent recipient-owned copy via the Slice 16 engine", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Ramen" }),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, directShareId),
      );
      expect(copy.dishKind).toBe("RECIPE");

      const copiedDish = await prisma.dish.findUniqueOrThrow({
        where: { id: copy.dishId },
      });
      expect(copiedDish.ownerId).toBe(recipient.id);
      expect(copiedDish.sourceKind).toBe("ACCEPTED_SHARE");
      expect(copiedDish.sourceDishId).toBe(dishId);
      expect(copiedDish.currentTitle).toBe("Ramen");

      const share = await prisma.directShare.findUniqueOrThrow({
        where: { id: directShareId },
      });
      expect(share.status).toBe("ACCEPTED");
      expect(share.createdDishId).toBe(copy.dishId);
    });

    it("rejects accept by a non-recipient", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const outsider = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await expect(
        acceptDirectShare(outsider.id, directShareId),
      ).rejects.toThrow(NotFoundError);
    });

    it("recursively copies a nested Part exactly once for a repeated Version reference", async () => {
      const sender = await newUser();
      const recipient = await newUser();

      // A single DishVersion may never directly link the same stable Part
      // twice (Review Gate 3's `findDuplicatePartTargets`) — convergence on
      // the same source Version is built through two different wrapper
      // Parts instead, matching sharing.integration.test.ts's own pattern.
      const partId = await dishService.createDish(
        sender.id,
        "PART",
        content({ title: "Tare" }),
      );
      const partVersionId = await currentVersionId(partId);

      const wrapperAId = await dishService.createDish(
        sender.id,
        "PART",
        content({
          title: "Wrapper A",
          partLinks: [
            {
              targetDishId: partId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        }),
      );
      const wrapperAVersionId = await currentVersionId(wrapperAId);

      const wrapperBId = await dishService.createDish(
        sender.id,
        "PART",
        content({
          title: "Wrapper B",
          partLinks: [
            {
              targetDishId: partId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        }),
      );
      const wrapperBVersionId = await currentVersionId(wrapperBId);

      const recipeId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({
          title: "Big Recipe",
          partLinks: [
            {
              targetDishId: wrapperAId,
              targetDishVersionId: wrapperAVersionId,
              position: 0,
              multiplier: 1,
            },
            {
              targetDishId: wrapperBId,
              targetDishVersionId: wrapperBVersionId,
              position: 1,
              multiplier: 1,
            },
          ],
        }),
      );

      const { directShareId } = await sendDirectShare(sender.id, {
        dishId: recipeId,
        recipientEmail: recipient.email,
        note: null,
      });
      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, directShareId),
      );
      expect(copy.dishKind).toBe("RECIPE");

      const recipientDishes = await prisma.dish.findMany({
        where: { ownerId: recipient.id },
      });
      // One copied Recipe + two copied wrappers + one copied `partId` — both
      // wrappers' references to the same source Version reuse a single
      // copied Part/Version, never two.
      expect(recipientDishes).toHaveLength(4);
      const copiedTare = recipientDishes.find(
        (d) => d.currentTitle === "Tare",
      )!;
      const copiedTareVersions = await prisma.dishVersion.count({
        where: { dishId: copiedTare.id },
      });
      expect(copiedTareVersions).toBe(1);
    });

    it("a nested Part deleted after Send does not alter the frozen delivery — Accept still copies its frozen content independently", async () => {
      const sender = await newUser();
      const recipient = await newUser();

      const partId = await dishService.createDish(
        sender.id,
        "PART",
        content({ title: "Nuoc Cham" }),
      );
      const partVersionId = await currentVersionId(partId);

      const recipeId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({
          title: "Spring Rolls",
          partLinks: [
            {
              targetDishId: partId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        }),
      );

      // Send while the live Part link is still current — this freezes the
      // Part's content into the delivery's own graph, independent of the
      // live source rows from this point on.
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId: recipeId,
        recipientEmail: recipient.email,
        note: null,
      });

      // The sender detaches the Recipe from the Part, then permanently
      // deletes the Part entirely — a "nested-Part change" happening
      // strictly after Send.
      await dishService.editDish(
        sender.id,
        recipeId,
        await currentVersionId(recipeId),
        content({ title: "Spring Rolls", partLinks: [] }),
        "MAJOR",
      );
      await deleteDish(sender.id, partId, "PART");
      expect(
        await prisma.dish.findUnique({ where: { id: partId } }),
      ).toBeNull();

      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, directShareId),
      );

      // Two recipient Dishes: the copied Recipe AND an independent copy of
      // the Part exactly as it existed at Send time — the frozen graph
      // never learns the source Part was later deleted.
      const recipientDishes = await prisma.dish.findMany({
        where: { ownerId: recipient.id },
      });
      expect(recipientDishes).toHaveLength(2);
      const copiedPart = recipientDishes.find((d) => d.id !== copy.dishId)!;
      expect(copiedPart.currentTitle).toBe("Nuoc Cham");
      // The FK provenance link can't survive a since-deleted source row —
      // the denormalized title snapshot does (Dish.sourceDishId's existing
      // `onDelete: SetNull` convention, applied proactively here since the
      // source was already gone before this INSERT ran).
      expect(copiedPart.sourceDishId).toBeNull();
      expect(copiedPart.sourceTitle).toBe("Nuoc Cham");

      const copiedRecipeVersion = await prisma.dishVersion.findFirstOrThrow({
        where: { dishId: copy.dishId },
      });
      const copiedLink = await prisma.partLink.findFirstOrThrow({
        where: { containerVersionId: copiedRecipeVersion.id },
      });
      expect(copiedLink.linkState).toBe("LIVE");
      expect(copiedLink.targetDishId).toBe(copiedPart.id);
    });

    it("preserves a MATERIALIZED PartLink occurrence already materialized before Send", async () => {
      const sender = await newUser();
      const recipient = await newUser();

      // Three levels: Recipe -> Wrapper (a specific, pinned Version) ->
      // Base. DirectShare always pins the Recipe's CURRENT Version, and a
      // *current* Version can never itself carry a MATERIALIZED link
      // (`deletePart` refuses to materialize a still-current usage) — but a
      // deeper, explicitly-pinned Version of a nested Part can, if that
      // Part's OWN current Version has since moved on and its historical
      // Version's usage gets materialized. This is the only shape in which
      // a DirectShare's frozen graph can ever contain a MATERIALIZED node.
      const baseId = await dishService.createDish(
        sender.id,
        "PART",
        content({ title: "Nuoc Cham" }),
      );
      const baseVersionId = await currentVersionId(baseId);

      const wrapperId = await dishService.createDish(
        sender.id,
        "PART",
        content({
          title: "Spring Roll Filling",
          partLinks: [
            {
              targetDishId: baseId,
              targetDishVersionId: baseVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        }),
      );
      const wrapperPinnedVersionId = await currentVersionId(wrapperId);

      const recipeId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({
          title: "Spring Rolls",
          partLinks: [
            {
              targetDishId: wrapperId,
              targetDishVersionId: wrapperPinnedVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        }),
      );

      // Move Wrapper's own current Version off Base — Wrapper's PINNED
      // (now historical, relative to Wrapper itself) Version still
      // live-links to Base, and the Recipe's link still targets that exact
      // pinned Wrapper Version.
      await dishService.editDish(
        sender.id,
        wrapperId,
        wrapperPinnedVersionId,
        content({ title: "Spring Roll Filling", partLinks: [] }),
        "MAJOR",
      );
      // Base's only remaining usage is now historical-only (via Wrapper's
      // pinned Version) — deleting it materializes that link in place.
      await deleteDish(sender.id, baseId, "PART");
      const materializedLink = await prisma.partLink.findFirstOrThrow({
        where: { containerVersionId: wrapperPinnedVersionId },
      });
      expect(materializedLink.linkState).toBe("MATERIALIZED");

      // Send now — the Recipe's current Version still live-links to
      // Wrapper's pinned Version, which already carries the MATERIALIZED
      // occurrence; the frozen graph captures it as-is.
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId: recipeId,
        recipientEmail: recipient.email,
        note: null,
      });

      const asRecipient = await getDirectSharePreview(
        recipient.id,
        directShareId,
      );
      expect(asRecipient.content.topLevelPartLinks[0].title).toBe(
        "Spring Roll Filling",
      );

      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, directShareId),
      );

      // One copied Recipe + one copied Wrapper — no separate copy for the
      // already-deleted Base (a MATERIALIZED occurrence has no live source
      // to copy into its own Dish).
      const recipientDishes = await prisma.dish.findMany({
        where: { ownerId: recipient.id },
      });
      expect(recipientDishes).toHaveLength(2);

      const copiedRecipeVersion = await prisma.dishVersion.findFirstOrThrow({
        where: { dishId: copy.dishId },
      });
      const copiedWrapperLink = await prisma.partLink.findFirstOrThrow({
        where: { containerVersionId: copiedRecipeVersion.id },
      });
      const copiedWrapperVersion = await prisma.dishVersion.findFirstOrThrow({
        where: { dishId: copiedWrapperLink.targetDishId! },
      });
      const copiedMaterializedLink = await prisma.partLink.findFirstOrThrow({
        where: { containerVersionId: copiedWrapperVersion.id },
      });
      expect(copiedMaterializedLink.linkState).toBe("MATERIALIZED");
      expect(copiedMaterializedLink.targetDishId).toBeNull();
      expect(copiedMaterializedLink.materializedTitle).toBe("Nuoc Cham");
    });

    it("reuses the existing ImageAsset rather than duplicating image bytes", async () => {
      const sender = await newUser();
      const recipient = await newUser();
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
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, directShareId),
      );
      const copiedVersion = await prisma.dishVersion.findFirst({
        where: { dishId: copy.dishId },
      });
      expect(copiedVersion?.imageAssetId).toBe(asset.id);
      expect(await prisma.imageAsset.count({ where: { id: asset.id } })).toBe(
        1,
      );
    });

    it("keeps sender and recipient edits independent after acceptance", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Original" }),
      );
      const baseVersionId = await currentVersionId(dishId);
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });
      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, directShareId),
      );

      await dishService.editDish(
        sender.id,
        dishId,
        baseVersionId,
        content({ title: "Sender Edited" }),
        "MINOR",
      );

      const copiedDish = await prisma.dish.findUniqueOrThrow({
        where: { id: copy.dishId },
      });
      expect(copiedDish.currentTitle).toBe("Original");
    });

    it("does not create a second copy on a concurrent duplicate accept", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      const [first, second] = await Promise.all([
        acceptDirectShare(recipient.id, directShareId),
        acceptDirectShare(recipient.id, directShareId),
      ]);
      const firstCopy = expectAccepted(first);
      const secondCopy = expectAccepted(second);
      expect(secondCopy.dishId).toBe(firstCopy.dishId);

      const recipientDishes = await prisma.dish.count({
        where: { ownerId: recipient.id },
      });
      expect(recipientDishes).toBe(1);
    });

    it("returns the truthful accepted_copy_deleted state after the recipient deletes their copy, and never creates a second one", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });
      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, directShareId),
      );

      await deleteDish(recipient.id, copy.dishId, "RECIPE");

      const result = await acceptDirectShare(recipient.id, directShareId);
      expect(result).toEqual({ outcome: "accepted_copy_deleted" });
      expect(
        await prisma.dish.count({ where: { ownerId: recipient.id } }),
      ).toBe(0);
    });
  });

  describe("frozen delivery — later source edits never change Preview or Accept", () => {
    it("a material content edit after Send does not change Preview", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Original Title" }),
      );
      const baseVersionId = await currentVersionId(dishId);
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await dishService.editDish(
        sender.id,
        dishId,
        baseVersionId,
        content({ title: "Edited Title", cuisine: "Thai" }),
        "MAJOR",
      );

      const preview = await getDirectSharePreview(recipient.id, directShareId);
      expect(preview.content.title).toBe("Original Title");
      expect(preview.content.cuisine).toBeNull();
    });

    it("an in-place metadata edit (no new Version) after Send does not change Preview", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Ramen", description: "Original description" }),
      );
      const baseVersionId = await currentVersionId(dishId);
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      // `updateVersionMetadata` (PRODUCT_SPEC.md §13.2a's "no new Version"
      // mutable-metadata category — description/image specifically) always
      // updates the same row in place, never allocating a new Version.
      await dishService.updateVersionMetadata(
        sender.id,
        dishId,
        baseVersionId,
        {
          description: "Edited description",
          imageAssetId: null,
        },
      );
      expect(await currentVersionId(dishId)).toBe(baseVersionId);

      const preview = await getDirectSharePreview(recipient.id, directShareId);
      expect(preview.content.description).toBe("Original description");
    });

    it("replacing the source image after Send does not change Preview or its authorized image", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const originalAsset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: sender.id,
        },
      });
      const replacementAsset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: sender.id,
        },
      });
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Ramen", imageAssetId: originalAsset.id }),
      );
      const baseVersionId = await currentVersionId(dishId);
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await dishService.updateVersionMetadata(
        sender.id,
        dishId,
        baseVersionId,
        {
          description: null,
          imageAssetId: replacementAsset.id,
        },
      );

      const preview = await getDirectSharePreview(recipient.id, directShareId);
      expect(preview.content.imageAssetId).toBe(originalAsset.id);
      expect(
        await isImageAssetVisibleViaDirectShare(
          recipient.id,
          directShareId,
          originalAsset.id,
        ),
      ).toBe(true);
      expect(
        await isImageAssetVisibleViaDirectShare(
          recipient.id,
          directShareId,
          replacementAsset.id,
        ),
      ).toBe(false);
    });

    it("a nested Part's content edit after Send does not change Preview", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const partId = await dishService.createDish(
        sender.id,
        "PART",
        content({ title: "Tare" }),
      );
      const partVersionId = await currentVersionId(partId);
      const recipeId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({
          title: "Ramen",
          partLinks: [
            {
              targetDishId: partId,
              targetDishVersionId: partVersionId,
              position: 0,
              multiplier: 1,
            },
          ],
        }),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId: recipeId,
        recipientEmail: recipient.email,
        note: null,
      });

      // A new major Version on the Part — the Recipe's own live link still
      // targets the exact Version it linked at Send time either way, but
      // this proves the frozen graph doesn't re-resolve the Part by dishId.
      await dishService.editDish(
        sender.id,
        partId,
        partVersionId,
        content({ title: "Tare (updated)" }),
        "MAJOR",
      );

      const preview = await getDirectSharePreview(recipient.id, directShareId);
      expect(preview.content.topLevelPartLinks[0].title).toBe("Tare");
    });

    it("Accept produces the frozen content, not the later source state", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Original" }),
      );
      const baseVersionId = await currentVersionId(dishId);
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await dishService.editDish(
        sender.id,
        dishId,
        baseVersionId,
        content({ title: "Changed after Send" }),
        "MINOR",
      );

      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, directShareId),
      );
      const copiedDish = await prisma.dish.findUniqueOrThrow({
        where: { id: copy.dishId },
      });
      expect(copiedDish.currentTitle).toBe("Original");
    });
  });

  describe("image lifetime — pending frozen deliveries protect their images from orphan cleanup", () => {
    it("a still-PENDING delivery keeps its frozen image alive after the source replaces it", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const originalAsset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: sender.id,
        },
      });
      const replacementAsset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: sender.id,
        },
      });
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ imageAssetId: originalAsset.id }),
      );
      const baseVersionId = await currentVersionId(dishId);
      await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      // Replacing the image on the same row triggers the orphan check for
      // the OLD asset (`applyVersionMetadataUpdate` -> `deleteImageAssetIfOrphaned`)
      // — normally an unreferenced asset would be deleted here, but the
      // still-PENDING delivery's frozen graph protects it.
      await dishService.updateVersionMetadata(
        sender.id,
        dishId,
        baseVersionId,
        {
          description: null,
          imageAssetId: replacementAsset.id,
        },
      );

      expect(
        await prisma.imageAsset.findUnique({ where: { id: originalAsset.id } }),
      ).not.toBeNull();
    });

    it("cancelling releases that protection once no other reference exists", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const originalAsset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: sender.id,
        },
      });
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ imageAssetId: originalAsset.id }),
      );
      const baseVersionId = await currentVersionId(dishId);
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });
      // Detach the image from the live Version so the only remaining
      // protection is the (still-PENDING) frozen delivery.
      await dishService.updateVersionMetadata(
        sender.id,
        dishId,
        baseVersionId,
        {
          description: null,
          imageAssetId: null,
        },
      );
      expect(
        await prisma.imageAsset.findUnique({ where: { id: originalAsset.id } }),
      ).not.toBeNull();

      await cancelDirectShare(sender.id, directShareId);

      // Simulates the next legitimate cleanup opportunity for this asset —
      // no other protected reference remains once the delivery is cancelled.
      const freedStorageKey = await prisma.$transaction((tx) =>
        deleteImageAssetIfOrphaned(tx, originalAsset.id),
      );
      expect(freedStorageKey).toBe(originalAsset.storageKey);
      expect(
        await prisma.imageAsset.findUnique({ where: { id: originalAsset.id } }),
      ).toBeNull();
    });

    it("an accepted copy continues to protect its image independently of the DirectShare row", async () => {
      const sender = await newUser();
      const recipient = await newUser();
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
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });
      await acceptDirectShare(recipient.id, directShareId);

      const freedStorageKey = await prisma.$transaction((tx) =>
        deleteImageAssetIfOrphaned(tx, asset.id),
      );
      expect(freedStorageKey).toBeNull();
      expect(
        await prisma.imageAsset.findUnique({ where: { id: asset.id } }),
      ).not.toBeNull();
    });
  });

  describe("source deletion", () => {
    it("cancels a pending DirectShare in the deletion transaction, and it cannot later be accepted", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content(),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      await deleteDish(sender.id, dishId, "RECIPE");

      const share = await prisma.directShare.findUniqueOrThrow({
        where: { id: directShareId },
      });
      expect(share.status).toBe("CANCELED");
      expect(share.dishId).toBeNull();

      const result = await acceptDirectShare(recipient.id, directShareId);
      expect(result).toEqual({ outcome: "not_actionable", status: "CANCELED" });
    });

    it("an accepted copy survives permanent source deletion", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Ramen" }),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });
      const copy = expectAccepted(
        await acceptDirectShare(recipient.id, directShareId),
      );

      await deleteDish(sender.id, dishId, "RECIPE");

      const copiedDish = await prisma.dish.findUniqueOrThrow({
        where: { id: copy.dishId },
      });
      expect(copiedDish.currentTitle).toBe("Ramen");
    });
  });

  describe("getDirectSharePreview", () => {
    it("is readable by the sender and the intended recipient, but not an unrelated user", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const outsider = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Ramen" }),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: "Enjoy",
      });

      const asRecipient = await getDirectSharePreview(
        recipient.id,
        directShareId,
      );
      expect(asRecipient.content.title).toBe("Ramen");
      expect(asRecipient.note).toBe("Enjoy");

      const asSender = await getDirectSharePreview(sender.id, directShareId);
      expect(asSender.content.title).toBe("Ramen");

      await expect(
        getDirectSharePreview(outsider.id, directShareId),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("preview and image authorization follow DirectShare status", () => {
    async function sendWithImage(
      sender: { id: string },
      recipient: { id: string; email: string },
    ) {
      const asset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: sender.id,
        },
      });
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Ramen", imageAssetId: asset.id }),
      );
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });
      return { asset, dishId, directShareId };
    }

    it.each([
      [
        "ACCEPTED",
        async (_s: { id: string }, r: { id: string }, id: string) => {
          await acceptDirectShare(r.id, id);
        },
      ],
      [
        "DECLINED",
        async (_s: { id: string }, r: { id: string }, id: string) => {
          await declineDirectShare(r.id, id);
        },
      ],
      [
        "CANCELED",
        async (s: { id: string }, _r: { id: string }, id: string) => {
          await cancelDirectShare(s.id, id);
        },
      ],
    ] as const)(
      "rejects direct-share preview and directShareId image authorization once %s",
      async (_label, transition) => {
        const sender = await newUser();
        const recipient = await newUser();
        const { asset, directShareId } = await sendWithImage(sender, recipient);

        await transition(sender, recipient, directShareId);

        await expect(
          getDirectSharePreview(recipient.id, directShareId),
        ).rejects.toThrow(NotFoundError);
        await expect(
          getDirectSharePreview(sender.id, directShareId),
        ).rejects.toThrow(NotFoundError);

        expect(
          await isImageAssetVisibleViaDirectShare(
            recipient.id,
            directShareId,
            asset.id,
          ),
        ).toBe(false);
        expect(
          await isImageAssetVisibleViaDirectShare(
            sender.id,
            directShareId,
            asset.id,
          ),
        ).toBe(false);
      },
    );

    it("keeps the accepted copy's own image accessible via the copied Dish, independent of directShareId authorization", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const { asset, directShareId } = await sendWithImage(sender, recipient);

      const result = await acceptDirectShare(recipient.id, directShareId);
      if (result.outcome !== "accepted") {
        throw new Error(`Expected "accepted", got "${result.outcome}"`);
      }

      // The recipient's own copy now owns a DishVersion referencing the
      // same ImageAsset — this is exactly the check the image route's
      // default (no shareToken/directShareId) branch performs, so this
      // proves "View your copy" can still show the image even though
      // `isImageAssetVisibleViaDirectShare` (terminal) now returns false.
      const ownsReferencingVersion = await prisma.dishVersion.findFirst({
        where: { imageAssetId: asset.id, dish: { ownerId: recipient.id } },
      });
      expect(ownsReferencingVersion).not.toBeNull();
      expect(
        await isImageAssetVisibleViaDirectShare(
          recipient.id,
          directShareId,
          asset.id,
        ),
      ).toBe(false);
    });

    it("frees the image via orphan cleanup after decline once no other protected reference exists", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const { asset, dishId, directShareId } = await sendWithImage(
        sender,
        recipient,
      );
      const baseVersionId = await currentVersionId(dishId);
      // Detach the image from the live Version so the only remaining
      // protection is the (still-PENDING) frozen delivery.
      await dishService.updateVersionMetadata(
        sender.id,
        dishId,
        baseVersionId,
        { description: null, imageAssetId: null },
      );

      await declineDirectShare(recipient.id, directShareId);

      const freedStorageKey = await prisma.$transaction((tx) =>
        deleteImageAssetIfOrphaned(tx, asset.id),
      );
      expect(freedStorageKey).toBe(asset.storageKey);
      expect(
        await prisma.imageAsset.findUnique({ where: { id: asset.id } }),
      ).toBeNull();
    });

    it("does not let an unrelated user preview or access the image at any status", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const outsider = await newUser();
      const { asset, directShareId } = await sendWithImage(sender, recipient);

      await expect(
        getDirectSharePreview(outsider.id, directShareId),
      ).rejects.toThrow(AuthorizationError);
      expect(
        await isImageAssetVisibleViaDirectShare(
          outsider.id,
          directShareId,
          asset.id,
        ),
      ).toBe(false);

      await declineDirectShare(recipient.id, directShareId);

      await expect(
        getDirectSharePreview(outsider.id, directShareId),
      ).rejects.toThrow(AuthorizationError);
      expect(
        await isImageAssetVisibleViaDirectShare(
          outsider.id,
          directShareId,
          asset.id,
        ),
      ).toBe(false);
    });
  });

  describe("listSentDirectShares / listReceivedDirectShares", () => {
    it("shows the /share page's Sent and Received rows with the expected fields", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        sender.id,
        "RECIPE",
        content({ title: "Ramen" }),
      );
      await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: "Enjoy",
      });

      const sent = await listSentDirectShares(sender.id);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        dishKind: "RECIPE",
        dishTitleSnapshot: "Ramen",
        recipientName: recipient.name,
        note: "Enjoy",
        status: "PENDING",
      });

      const received = await listReceivedDirectShares(recipient.id);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        dishKind: "RECIPE",
        dishTitleSnapshot: "Ramen",
        senderName: sender.name,
        note: "Enjoy",
        status: "PENDING",
        createdDishId: null,
      });
    });
  });

  describe("isImageAssetVisibleViaDirectShare", () => {
    it("authorizes the sender and intended recipient, not an unrelated user, and not once the source is deleted", async () => {
      const sender = await newUser();
      const recipient = await newUser();
      const outsider = await newUser();
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
      const { directShareId } = await sendDirectShare(sender.id, {
        dishId,
        recipientEmail: recipient.email,
        note: null,
      });

      expect(
        await isImageAssetVisibleViaDirectShare(
          recipient.id,
          directShareId,
          asset.id,
        ),
      ).toBe(true);
      expect(
        await isImageAssetVisibleViaDirectShare(
          sender.id,
          directShareId,
          asset.id,
        ),
      ).toBe(true);
      expect(
        await isImageAssetVisibleViaDirectShare(
          outsider.id,
          directShareId,
          asset.id,
        ),
      ).toBe(false);

      await deleteDish(sender.id, dishId, "RECIPE");
      expect(
        await isImageAssetVisibleViaDirectShare(
          recipient.id,
          directShareId,
          asset.id,
        ),
      ).toBe(false);
    });
  });
});
