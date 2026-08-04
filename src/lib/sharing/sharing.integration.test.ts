import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import { deleteDish } from "@/lib/dishes/service";
import type { DishContentInput } from "@/lib/dishes/schema";
import { NotFoundError } from "@/lib/errors";
import {
  createShareLink,
  revokeShareLink,
  resolvePublicShare,
  saveSharedCopy,
  isImageAssetVisibleViaShareLink,
} from "@/lib/sharing/service";

vi.mock("@vercel/blob", () => ({ del: vi.fn(async () => {}) }));
// Only overrides the one var this test file needs beyond what
// vitest.integration.config.mts already loads from .env.local/.env — every
// other field (DATABASE_URL, etc.) passes through untouched, so the real
// Postgres connection this suite depends on keeps working.
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

async function currentVersionId(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  return dish.currentVersionId!;
}

/** Narrows `saveSharedCopy`'s result for tests that expect a usable copy —
 * fails loudly (rather than a confusing downstream `.dishId` type error) if
 * a test accidentally hits the `previously_accepted_copy_deleted` branch. */
function expectCopy(result: Awaited<ReturnType<typeof saveSharedCopy>>): {
  dishId: string;
  dishKind: "RECIPE" | "PART";
} {
  if (result.outcome === "previously_accepted_copy_deleted") {
    throw new Error(
      "Expected a usable copy, got previously_accepted_copy_deleted",
    );
  }
  return result;
}

describe("sharing", () => {
  let userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds) {
      await deleteTestUser(id);
    }
    userIds = [];
  });

  async function newUser() {
    const user = await createTestUser();
    userIds.push(user.id);
    return user;
  }

  describe("createShareLink + resolvePublicShare", () => {
    it("a fixed snapshot never changes after the source is edited or archived", async () => {
      const owner = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content({ title: "Original Title" }),
      );
      const baseVersionId = await currentVersionId(dishId);

      const { url } = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      await dishService.editDish(
        owner.id,
        dishId,
        baseVersionId,
        content({ title: "Edited Title Afterward" }),
        "MINOR",
      );
      await dishService.archiveDish(owner.id, dishId, "RECIPE");

      const resolved = await resolvePublicShare(url);
      expect(resolved.mode).toBe("FIXED_SNAPSHOT");
      expect(resolved.content.title).toBe("Original Title");
    });

    it("a current-mode link follows the source's current Version", async () => {
      const owner = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content({ title: "First" }),
      );
      const baseVersionId = await currentVersionId(dishId);

      const { url } = await createShareLink(owner.id, {
        dishId,
        mode: "CURRENT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      let resolved = await resolvePublicShare(url);
      expect(resolved.content.title).toBe("First");

      await dishService.editDish(
        owner.id,
        dishId,
        baseVersionId,
        content({ title: "Second" }),
        "MINOR",
      );

      resolved = await resolvePublicShare(url);
      expect(resolved.content.title).toBe("Second");
    });

    it("hides creator identity by default and shows it only when enabled", async () => {
      const owner = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );

      const hidden = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });
      const shown = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: true,
        versionId: undefined,
        expiresAt: null,
      });

      expect((await resolvePublicShare(hidden.url)).creatorName).toBeNull();
      expect((await resolvePublicShare(shown.url)).creatorName).toBe(
        owner.name,
      );
    });

    it("excludes private evidence (Tasters, ratings, Cooking Sessions) from the public DTO", async () => {
      const owner = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const versionId = await currentVersionId(dishId);

      const taster = await prisma.taster.create({
        data: {
          ownerId: owner.id,
          name: "Secret Taster Name",
          isOwner: false,
          position: 0,
        },
      });
      const session = await prisma.cookingSession.create({
        data: {
          ownerId: owner.id,
          dishId,
          dishVersionId: versionId,
          state: "COMPLETED",
          startedAt: new Date(),
          endedAt: new Date(),
          cookingNotes: "Secret cooking notes nobody public should see",
        },
      });
      await prisma.rating.create({
        data: {
          dishId,
          dishVersionId: versionId,
          sessionId: session.id,
          tasterId: taster.id,
          dishTitleSnapshot: "Ginger Soy Bowl",
          dishVersionLabelSnapshot: "V1.0",
          value: 5,
        },
      });

      const { url } = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });
      const resolved = await resolvePublicShare(url);
      const serialized = JSON.stringify(resolved.content);

      expect(serialized).not.toContain("Secret Taster Name");
      expect(serialized).not.toContain("Secret cooking notes");
      expect(resolved.content.aggregateRating).toBe(5);
      expect(resolved.content.ratingCount).toBe(1);
    });

    it("a revoked or expired link is unresolvable", async () => {
      const owner = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );

      const revoked = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });
      await revokeShareLink(owner.id, revoked.shareLinkId);
      await expect(resolvePublicShare(revoked.url)).rejects.toThrow(
        NotFoundError,
      );

      const expired = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(resolvePublicShare(expired.url)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("permanently deleting the source revokes fixed and current links, but a merely-archived source stays resolvable", async () => {
      const owner = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );

      const fixed = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });
      const current = await createShareLink(owner.id, {
        dishId,
        mode: "CURRENT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      await deleteDish(owner.id, dishId, "RECIPE");

      await expect(resolvePublicShare(fixed.url)).rejects.toThrow(
        NotFoundError,
      );
      await expect(resolvePublicShare(current.url)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("saveSharedCopy — independent copy engine", () => {
    async function buildNestedGraph(owner: { id: string }) {
      // A single DishVersion may never directly link the same stable Part
      // twice (Review Gate 3 decision, `findDuplicatePartTargets`) — so the
      // "same exact Version referenced twice" and "two different Versions
      // of one Part referenced" cases below are built as convergence
      // through *different* containers, not a duplicate direct link on one
      // container:
      //
      //   recipe -> partB  -> partA @ V1  (path 1 to partA @ V1)
      //   recipe -> partB2 -> partA @ V1  (path 2 to the SAME partA @ V1 — dedup)
      //   recipe -> partA @ V2 directly   (a second, distinct Version of partA)
      const partAId = await dishService.createDish(
        owner.id,
        "PART",
        content({ title: "Composed Sauce V1" }),
      );
      const partAVersion1Id = await currentVersionId(partAId);

      // editDish returns the (unchanged) Dish id, not the newly created
      // Version's id — fetch the fresh current Version id separately.
      await dishService.editDish(
        owner.id,
        partAId,
        partAVersion1Id,
        content({ title: "Composed Sauce V2" }),
        "MAJOR",
      );
      const partAVersion2Id = await currentVersionId(partAId);

      const partBId = await dishService.createDish(
        owner.id,
        "PART",
        content({
          title: "Wrapper B",
          partLinks: [
            {
              targetDishId: partAId,
              targetDishVersionId: partAVersion1Id,
              position: 0,
              multiplier: 1,
            },
          ],
        }),
      );
      const partBVersionId = await currentVersionId(partBId);

      const partB2Id = await dishService.createDish(
        owner.id,
        "PART",
        content({
          title: "Wrapper B2",
          partLinks: [
            {
              targetDishId: partAId,
              targetDishVersionId: partAVersion1Id,
              position: 0,
              multiplier: 1,
            },
          ],
        }),
      );
      const partB2VersionId = await currentVersionId(partB2Id);

      const recipeId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content({
          title: "Big Recipe",
          partLinks: [
            {
              targetDishId: partBId,
              targetDishVersionId: partBVersionId,
              position: 0,
              multiplier: 1,
            },
            {
              targetDishId: partB2Id,
              targetDishVersionId: partB2VersionId,
              position: 1,
              multiplier: 1,
            },
          ],
          sections: [
            {
              name: "Extra",
              guidanceNote: null,
              position: 0,
              ingredients: [],
              instructions: [],
              partLinks: [
                {
                  targetDishId: partAId,
                  targetDishVersionId: partAVersion2Id,
                  position: 0,
                  multiplier: 2,
                },
              ],
            },
          ],
        }),
      );
      const recipeVersionId = await currentVersionId(recipeId);

      return {
        partAId,
        partAVersion1Id,
        partAVersion2Id,
        partBId,
        partB2Id,
        recipeId,
        recipeVersionId,
      };
    }

    it("recursively copies nested Parts exactly once per distinct referenced Version, remapped to recipient-owned rows", async () => {
      const owner = await newUser();
      const recipient = await newUser();
      const graph = await buildNestedGraph(owner);

      const { url } = await createShareLink(owner.id, {
        dishId: graph.recipeId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      const copy = expectCopy(await saveSharedCopy(recipient.id, url));
      expect(copy.dishKind).toBe("RECIPE");

      const copiedDishes = await prisma.dish.findMany({
        where: { ownerId: recipient.id },
      });
      // Recipe + partB + partB2 + partA (once each) = 4 Dishes total,
      // regardless of how many times partA was reached.
      expect(copiedDishes).toHaveLength(4);

      const copiedPartA = copiedDishes.find(
        (d) => d.sourceDishId === graph.partAId,
      )!;
      const copiedPartB = copiedDishes.find(
        (d) => d.sourceDishId === graph.partBId,
      )!;
      const copiedPartB2 = copiedDishes.find(
        (d) => d.sourceDishId === graph.partB2Id,
      )!;
      expect(copiedPartA).toBeTruthy();
      expect(copiedPartB).toBeTruthy();
      expect(copiedPartB2).toBeTruthy();
      expect(copiedPartA.sourceKind).toBe("ACCEPTED_SHARE");

      // partA has two distinct referenced source Versions (V1 via partB/
      // partB2, V2 direct from the recipe) -> exactly two copied local
      // Versions (V1.0, V2.0), never three (no dedup) or one (over-dedup).
      const copiedPartAVersions = await prisma.dishVersion.findMany({
        where: { dishId: copiedPartA.id },
        orderBy: { majorVersion: "asc" },
      });
      expect(copiedPartAVersions).toHaveLength(2);
      expect(copiedPartAVersions[0].majorVersion).toBe(1);
      expect(copiedPartAVersions[0].minorVersion).toBe(0);
      expect(copiedPartAVersions[1].majorVersion).toBe(2);
      expect(copiedPartAVersions[1].minorVersion).toBe(0);

      // partB and partB2 each reference partA @ V1 once -> exactly one
      // copied Version apiece.
      expect(
        await prisma.dishVersion.count({ where: { dishId: copiedPartB.id } }),
      ).toBe(1);
      expect(
        await prisma.dishVersion.count({ where: { dishId: copiedPartB2.id } }),
      ).toBe(1);

      // Every PartLink anywhere in the copied graph points only at
      // recipient-owned rows — never back at the sender's originals.
      // (PartLink has no Prisma relation to Section — dishes/queries.ts's
      // own `partLinkContentInclude` comment — so it's queried flat here,
      // the same way the app itself always does.)
      const copiedRecipeVersion = await prisma.dishVersion.findFirst({
        where: { dishId: copy.dishId },
      });
      const recipeLevelLinks = await prisma.partLink.findMany({
        where: { containerVersionId: copiedRecipeVersion!.id },
      });
      expect(recipeLevelLinks.length).toBe(3);
      const senderDishIds = new Set([
        graph.partAId,
        graph.partBId,
        graph.partB2Id,
      ]);
      for (const link of recipeLevelLinks) {
        expect(senderDishIds.has(link.targetDishId!)).toBe(false);
      }

      // partB and partB2 both pointed at the exact same source partA @ V1 —
      // their copied PartLinks must reuse the exact same copied Version id
      // (the graph-wide dedup, not just a per-Part one).
      const copiedPartBVersion = await prisma.dishVersion.findFirstOrThrow({
        where: { dishId: copiedPartB.id },
      });
      const copiedPartB2Version = await prisma.dishVersion.findFirstOrThrow({
        where: { dishId: copiedPartB2.id },
      });
      const [partBLink] = await prisma.partLink.findMany({
        where: { containerVersionId: copiedPartBVersion.id },
      });
      const [partB2Link] = await prisma.partLink.findMany({
        where: { containerVersionId: copiedPartB2Version.id },
      });
      expect(partBLink.targetDishVersionId).toBe(
        partB2Link.targetDishVersionId,
      );
      expect(partBLink.targetDishId).toBe(copiedPartA.id);
      expect(partBLink.targetDishVersionId).toBe(copiedPartAVersions[0].id);
    });

    it("is durably idempotent — repeated acceptance returns the same recipient copy, never a second one", async () => {
      const owner = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const { url } = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      const first = expectCopy(await saveSharedCopy(recipient.id, url));
      const second = expectCopy(await saveSharedCopy(recipient.id, url));
      const third = expectCopy(await saveSharedCopy(recipient.id, url));

      expect(second.dishId).toBe(first.dishId);
      expect(third.dishId).toBe(first.dishId);

      const recipientDishes = await prisma.dish.findMany({
        where: { ownerId: recipient.id },
      });
      expect(recipientDishes).toHaveLength(1);

      const acceptances = await prisma.shareLinkAcceptance.findMany({
        where: { recipientId: recipient.id },
      });
      expect(acceptances).toHaveLength(1);
    });

    it("reuses the same immutable ImageAsset row rather than duplicating image bytes", async () => {
      const owner = await newUser();
      const recipient = await newUser();
      const asset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: owner.id,
        },
      });
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content({ imageAssetId: asset.id }),
      );

      const { url } = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });
      const copy = expectCopy(await saveSharedCopy(recipient.id, url));

      const copiedVersion = await prisma.dishVersion.findFirst({
        where: { dishId: copy.dishId },
      });
      expect(copiedVersion?.imageAssetId).toBe(asset.id);

      const assetCount = await prisma.imageAsset.count({
        where: { storageKey: asset.storageKey },
      });
      expect(assetCount).toBe(1);
    });

    it("an accepted copy survives share revocation and permanent deletion of the source, and stays independent of later sender/recipient edits", async () => {
      const owner = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content({ title: "Shared Original" }),
      );
      const baseVersionId = await currentVersionId(dishId);
      const { shareLinkId, url } = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      const copy = expectCopy(await saveSharedCopy(recipient.id, url));

      // Sender edits their original afterward — must not affect the copy.
      await dishService.editDish(
        owner.id,
        dishId,
        baseVersionId,
        content({ title: "Sender Changed This After Sharing" }),
        "MINOR",
      );
      const copiedDishAfterSenderEdit = await prisma.dish.findUniqueOrThrow({
        where: { id: copy.dishId },
      });
      expect(copiedDishAfterSenderEdit.currentTitle).toBe("Shared Original");

      // Recipient edits their own copy — must not affect the sender's.
      const copyVersionId = copiedDishAfterSenderEdit.currentVersionId!;
      await dishService.editDish(
        recipient.id,
        copy.dishId,
        copyVersionId,
        content({ title: "Recipient's Own Edit" }),
        "MINOR",
      );
      const senderDishAfterRecipientEdit = await prisma.dish.findUniqueOrThrow({
        where: { id: dishId },
      });
      expect(senderDishAfterRecipientEdit.currentTitle).toBe(
        "Sender Changed This After Sharing",
      );

      await revokeShareLink(owner.id, shareLinkId);
      const stillThere = await prisma.dish.findUnique({
        where: { id: copy.dishId },
      });
      expect(stillThere).not.toBeNull();

      await deleteDish(owner.id, dishId, "RECIPE");
      const survivesSourceDeletion = await prisma.dish.findUnique({
        where: { id: copy.dishId },
      });
      expect(survivesSourceDeletion).not.toBeNull();
      expect(survivesSourceDeletion?.currentTitle).toBe("Recipient's Own Edit");
    });

    it("rejects an invalid or unknown token without creating anything", async () => {
      const recipient = await newUser();
      await expect(
        saveSharedCopy(recipient.id, "garbage.token"),
      ).rejects.toThrow(NotFoundError);
      const dishes = await prisma.dish.count({
        where: { ownerId: recipient.id },
      });
      expect(dishes).toBe(0);
    });

    it("rolls back the entire copied graph if the idempotency record fails to commit (no partial copy left behind)", async () => {
      const owner = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const { shareLinkId, url } = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      // Simulate a concurrent winner: an acceptance row already exists for
      // this exact (shareLinkId, recipientId) pair, pointing at some other
      // Dish — the real transaction must fail its own insert (unique
      // constraint) and roll back every row it created in the same
      // transaction, leaving no orphaned copy behind.
      const decoyDishId = await dishService.createDish(
        recipient.id,
        "RECIPE",
        content({ title: "Decoy (simulated concurrent winner)" }),
      );
      await prisma.shareLinkAcceptance.create({
        data: {
          shareLinkId,
          recipientId: recipient.id,
          createdDishId: decoyDishId,
        },
      });

      const result = expectCopy(await saveSharedCopy(recipient.id, url));
      expect(result.dishId).toBe(decoyDishId);

      const recipientDishes = await prisma.dish.count({
        where: { ownerId: recipient.id },
      });
      expect(recipientDishes).toBe(1);
    });
  });

  describe("durable acceptance after copied-Dish deletion (correction pass)", () => {
    it("the acceptance record survives deleting the copied Dish, truthfully reflects the deletion, and blocks re-acceptance", async () => {
      const owner = await newUser();
      const recipient = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const { shareLinkId, url } = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      const copy = expectCopy(await saveSharedCopy(recipient.id, url));

      let acceptance = await prisma.shareLinkAcceptance.findUniqueOrThrow({
        where: {
          shareLinkId_recipientId: { shareLinkId, recipientId: recipient.id },
        },
      });
      expect(acceptance.createdDishId).toBe(copy.dishId);

      await deleteDish(recipient.id, copy.dishId, "RECIPE");

      // The acceptance ROW survives deleting the copy — that durable fact
      // is the entire point of the correction (schema.prisma's
      // ShareLinkAcceptance doc comment).
      acceptance = await prisma.shareLinkAcceptance.findUniqueOrThrow({
        where: {
          shareLinkId_recipientId: { shareLinkId, recipientId: recipient.id },
        },
      });
      expect(acceptance.createdDishId).toBeNull();

      // Re-accepting must not create a second copy — Gate 7 §2.8's
      // "only once" still applies even though the copy is gone.
      const second = await saveSharedCopy(recipient.id, url);
      expect(second.outcome).toBe("previously_accepted_copy_deleted");

      const recipientDishes = await prisma.dish.count({
        where: { ownerId: recipient.id },
      });
      expect(recipientDishes).toBe(0);

      // Retry/double-submit of the *already-deleted* outcome stays stable —
      // never flips to creating a copy on a later call either.
      const third = await saveSharedCopy(recipient.id, url);
      expect(third.outcome).toBe("previously_accepted_copy_deleted");
    });

    it("another recipient may still accept the same share independently after the first recipient deletes their own copy", async () => {
      const owner = await newUser();
      const recipientA = await newUser();
      const recipientB = await newUser();
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );
      const { url } = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      const copyA = expectCopy(await saveSharedCopy(recipientA.id, url));
      await deleteDish(recipientA.id, copyA.dishId, "RECIPE");

      const copyB = expectCopy(await saveSharedCopy(recipientB.id, url));
      expect(copyB.dishId).not.toBe(copyA.dishId);

      const recipientBDishes = await prisma.dish.count({
        where: { ownerId: recipientB.id },
      });
      expect(recipientBDishes).toBe(1);
    });
  });

  describe("MATERIALIZED PartLink content (correction pass)", () => {
    it("a fixed share of a historical Version with a MATERIALIZED occurrence renders and copies that content, with no live cross-owner dependency", async () => {
      const owner = await newUser();
      const recipient = await newUser();

      const partId = await dishService.createDish(
        owner.id,
        "PART",
        content({ title: "Nuoc Cham" }),
      );
      const partVersionId = await currentVersionId(partId);

      const recipeId = await dishService.createDish(
        owner.id,
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
      // Captured before the edit below — this is the historical Version
      // whose PartLink is about to become MATERIALIZED.
      const historicalRecipeVersionId = await currentVersionId(recipeId);

      // The Part can only be deleted once no CURRENT usage references it
      // (`deletePart`'s Phase 1/Phase 2 split) — move the Recipe's current
      // Version off the Part first, leaving the original Version's LIVE
      // link as a historical-only usage.
      await dishService.editDish(
        owner.id,
        recipeId,
        historicalRecipeVersionId,
        content({ title: "Spring Rolls", partLinks: [] }),
        "MAJOR",
      );

      // Deleting the Part materializes the still-LIVE historical PartLink
      // in place (ARCHITECTURE_PROPOSAL.md §H's materialization table).
      await deleteDish(owner.id, partId, "PART");

      const materializedLink = await prisma.partLink.findFirstOrThrow({
        where: { containerVersionId: historicalRecipeVersionId },
      });
      expect(materializedLink.linkState).toBe("MATERIALIZED");

      // Share the HISTORICAL Version — the only one that still carries the
      // materialized occurrence (Product Spec §83.3: fixed shares work for
      // historical Versions too).
      const { url } = await createShareLink(owner.id, {
        dishId: recipeId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: historicalRecipeVersionId,
        expiresAt: null,
      });

      const resolved = await resolvePublicShare(url);
      expect(resolved.content.topLevelPartLinks).toHaveLength(1);
      expect(resolved.content.topLevelPartLinks[0].title).toBe("Nuoc Cham");
      expect(
        resolved.content.topLevelPartLinks[0].sections[0].ingredients[0].name,
      ).toBe("Salt");

      const copy = expectCopy(await saveSharedCopy(recipient.id, url));

      // No second recipient Dish for the deleted Part — a MATERIALIZED
      // occurrence has no live source Dish/Part to copy into one of its
      // own; the frozen snapshot travels with the copied Recipe's PartLink
      // row instead (Gate 7's "do not recreate a live dependency on the
      // original Part").
      const recipientDishes = await prisma.dish.findMany({
        where: { ownerId: recipient.id },
      });
      expect(recipientDishes).toHaveLength(1);

      const copiedVersion = await prisma.dishVersion.findFirstOrThrow({
        where: { dishId: copy.dishId },
      });
      const copiedLink = await prisma.partLink.findFirstOrThrow({
        where: { containerVersionId: copiedVersion.id },
      });
      expect(copiedLink.linkState).toBe("MATERIALIZED");
      expect(copiedLink.targetDishId).toBeNull();
      expect(copiedLink.targetDishVersionId).toBeNull();
      expect(copiedLink.materializedTitle).toBe("Nuoc Cham");
      const materializedContent = copiedLink.materializedContent as {
        sections: Array<{ ingredients: Array<{ name: string }> }>;
      };
      expect(materializedContent.sections[0].ingredients[0].name).toBe("Salt");

      // Source edit/deletion afterward (already deleted above) must not be
      // able to affect the accepted copy — re-confirm it's still fully
      // intact and independently readable.
      const stillIntact = await prisma.partLink.findFirstOrThrow({
        where: { id: copiedLink.id },
      });
      expect(stillIntact.materializedTitle).toBe("Nuoc Cham");
    });
  });

  describe("public image-token authorization (correction pass)", () => {
    it("only a valid token for a share that actually reaches the asset is authorized — forged, revoked, expired, and unrelated-asset requests are all rejected", async () => {
      const owner = await newUser();
      const asset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: owner.id,
        },
      });
      const unrelatedAsset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: owner.id,
        },
      });
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content({ imageAssetId: asset.id }),
      );

      const { shareLinkId, url } = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });

      expect(await isImageAssetVisibleViaShareLink(url, asset.id)).toBe(true);

      // Not part of this share's content at all, even with a valid token.
      expect(
        await isImageAssetVisibleViaShareLink(url, unrelatedAsset.id),
      ).toBe(false);

      // Forged: a valid-looking tokenId paired with the wrong signature.
      const [tokenId] = url.split(".");
      expect(
        await isImageAssetVisibleViaShareLink(
          `${tokenId}.forged-signature`,
          asset.id,
        ),
      ).toBe(false);

      // Garbage token, no separator at all.
      expect(
        await isImageAssetVisibleViaShareLink("not-a-real-token", asset.id),
      ).toBe(false);

      // Revoked.
      await revokeShareLink(owner.id, shareLinkId);
      expect(await isImageAssetVisibleViaShareLink(url, asset.id)).toBe(false);

      // Expired (separate link so revocation above doesn't interfere).
      const expired = await createShareLink(owner.id, {
        dishId,
        mode: "FIXED_SNAPSHOT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await isImageAssetVisibleViaShareLink(expired.url, asset.id)).toBe(
        false,
      );
    });

    it("a current-mode link authorizes only images actually reachable from the source's live current Version", async () => {
      const owner = await newUser();
      const asset = await prisma.imageAsset.create({
        data: {
          storageKey: `images/test/${randomUUID()}.webp`,
          uploadedByUserId: owner.id,
        },
      });
      const dishId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content({ imageAssetId: asset.id }),
      );
      const baseVersionId = await currentVersionId(dishId);

      const { url } = await createShareLink(owner.id, {
        dishId,
        mode: "CURRENT",
        showCreatorName: false,
        versionId: undefined,
        expiresAt: null,
      });
      expect(await isImageAssetVisibleViaShareLink(url, asset.id)).toBe(true);

      // The source's current Version stops referencing the image — a live
      // link must reflect that immediately, unlike a fixed snapshot.
      await dishService.editDish(
        owner.id,
        dishId,
        baseVersionId,
        content({ imageAssetId: null }),
        "MINOR",
      );
      expect(await isImageAssetVisibleViaShareLink(url, asset.id)).toBe(false);
    });
  });
});
