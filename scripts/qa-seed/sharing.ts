import { prisma } from "@/lib/db/prisma";
import type {
  createShareLink as CreateShareLink,
  revokeShareLink as RevokeShareLink,
  saveSharedCopy as SaveSharedCopy,
  sendDirectShare as SendDirectShare,
  cancelDirectShare as CancelDirectShare,
  declineDirectShare as DeclineDirectShare,
  acceptDirectShare as AcceptDirectShare,
} from "@/lib/sharing/service";
import type {
  sendDirectShareCollection as SendDirectShareCollection,
  finalizeDirectShareCollectionDecision as FinalizeDirectShareCollectionDecision,
} from "@/lib/sharing/collections";
import type {
  createDish as CreateDish,
  deleteDish as DeleteDish,
} from "@/lib/dishes/service";
import type { DishContentInput } from "@/lib/dishes/schema";
import { section } from "./parts";

export type SharingServices = {
  createShareLink: typeof CreateShareLink;
  revokeShareLink: typeof RevokeShareLink;
  saveSharedCopy: typeof SaveSharedCopy;
  sendDirectShare: typeof SendDirectShare;
  cancelDirectShare: typeof CancelDirectShare;
  declineDirectShare: typeof DeclineDirectShare;
  acceptDirectShare: typeof AcceptDirectShare;
  sendDirectShareCollection: typeof SendDirectShareCollection;
  finalizeDirectShareCollectionDecision: typeof FinalizeDirectShareCollectionDecision;
  createDish: typeof CreateDish;
  deleteDish: typeof DeleteDish;
};

/**
 * `ShareLink`/`DirectShare`/`ShareLinkAcceptance` don't cascade away when
 * the Dish they reference is wiped and recreated each run — every FK from
 * them to a Dish/DishVersion is `onDelete: SetNull`, not `Cascade` (Slice
 * 16/17's own deliberate "survive source deletion" design). Unlike
 * `wipeExistingFixtures`'s Dish/GroceryList/MealPlan/Taster cleanup, these
 * rows need their own explicit pass scoped to the two dedicated QA accounts
 * or reruns would silently accumulate stale rows forever. Deleting
 * `ShareLink` cascades its own `ShareLinkAcceptance` rows automatically
 * (`onDelete: Cascade` on `shareLinkId`).
 */
export async function wipeSharingFixtures(
  primaryId: string,
  counterpartyId: string,
): Promise<void> {
  const accountIds = [primaryId, counterpartyId];
  await prisma.shareLink.deleteMany({
    where: { ownerId: { in: accountIds } },
  });
  // Slice 22: DirectShareCollection rows first — cascades their own
  // DirectShare children (`collectionId` is `onDelete: Cascade`), so the
  // ungrouped-only deleteMany below never re-touches them. An unclaimed
  // collection fixture (recipientId still null) is scoped by senderId only,
  // matching how it's actually addressed at this point in a rerun.
  await prisma.directShareCollection.deleteMany({
    where: {
      OR: [
        { senderId: { in: accountIds } },
        { recipientId: { in: accountIds } },
      ],
    },
  });
  await prisma.directShare.deleteMany({
    where: {
      OR: [
        { senderId: { in: accountIds } },
        { recipientId: { in: accountIds } },
      ],
    },
  });
}

export type ShareLinkFixtureSummary = {
  label: string;
  dishTitle: string;
  mode: "FIXED_SNAPSHOT" | "CURRENT";
  status: "active" | "expired" | "revoked";
  showCreatorName: boolean;
  url: string | null;
};

/**
 * The primary QA account's four owned `ShareLink`s (Slice 16). Reuses
 * already-seeded Recipes/Parts rather than creating new content — chosen for
 * a spread of real coverage: nested Parts (Peanut Noodle Salad nests Sauce,
 * which nests Seasoning), an image-empty item under CURRENT mode
 * (Weeknight Stir-Fry), and an already-archived Recipe under a revoked link
 * (Simple Garden Salad).
 */
export async function buildShareLinkFixtures(
  {
    createShareLink,
    revokeShareLink,
  }: Pick<SharingServices, "createShareLink" | "revokeShareLink">,
  primaryId: string,
  ids: {
    noodlesaladDishId: string;
    stirfryDishId: string;
    ricesidedishDishId: string;
    saladDishId: string;
  },
): Promise<ShareLinkFixtureSummary[]> {
  const results: ShareLinkFixtureSummary[] = [];

  const fixedActive = await createShareLink(primaryId, {
    dishId: ids.noodlesaladDishId,
    mode: "FIXED_SNAPSHOT",
    showCreatorName: false,
  });
  results.push({
    label: "Active fixed-snapshot, creator name hidden",
    dishTitle: "[QA] Peanut Noodle Salad",
    mode: "FIXED_SNAPSHOT",
    status: "active",
    showCreatorName: false,
    url: fixedActive.url,
  });

  const currentActive = await createShareLink(primaryId, {
    dishId: ids.stirfryDishId,
    mode: "CURRENT",
    showCreatorName: true,
  });
  results.push({
    label: "Active current, creator name shown",
    dishTitle: "[QA] Weeknight Stir-Fry",
    mode: "CURRENT",
    status: "active",
    showCreatorName: true,
    url: currentActive.url,
  });

  const expired = await createShareLink(primaryId, {
    dishId: ids.ricesidedishDishId,
    mode: "FIXED_SNAPSHOT",
    showCreatorName: false,
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  results.push({
    label: "Expired",
    dishTitle: "[QA] Rice Side Dish",
    mode: "FIXED_SNAPSHOT",
    status: "expired",
    showCreatorName: false,
    url: expired.url,
  });

  const toRevoke = await createShareLink(primaryId, {
    dishId: ids.saladDishId,
    mode: "CURRENT",
    showCreatorName: false,
  });
  await revokeShareLink(primaryId, toRevoke.shareLinkId);
  results.push({
    label: "Revoked",
    dishTitle: "[QA] Simple Garden Salad",
    mode: "CURRENT",
    status: "revoked",
    showCreatorName: false,
    url: null,
  });

  return results;
}

export type CrossAccountCopySummary = {
  dishId: string;
  dishKind: string;
} | null;

/**
 * Slice 16's "at least one accepted ShareLink copy owned by the primary QA
 * account" — the counterparty (who owns real, shareable content via
 * `counterparty.ts`) creates a link, and the primary account accepts it
 * through the real `saveSharedCopy` engine, landing a genuine independent
 * copy in the primary account's own library.
 */
export async function buildCrossAccountShareLinkCopy(
  {
    createShareLink,
    saveSharedCopy,
  }: Pick<SharingServices, "createShareLink" | "saveSharedCopy">,
  primaryId: string,
  counterpartyId: string,
  pastaDishId: string,
): Promise<CrossAccountCopySummary> {
  const link = await createShareLink(counterpartyId, {
    dishId: pastaDishId,
    mode: "FIXED_SNAPSHOT",
    showCreatorName: true,
  });
  const result = await saveSharedCopy(primaryId, link.url);
  if (result.outcome === "created" || result.outcome === "already_accepted") {
    return { dishId: result.dishId, dishKind: result.dishKind };
  }
  return null;
}

export type DirectShareFixtureSummary = {
  label: string;
  dishTitle: string;
  direction: "primary-to-counterparty" | "counterparty-to-primary";
  status: string;
};

/**
 * Slice 17's direct-share state coverage, in both directions. Reuses
 * existing primary-owned Recipes/Parts for the primary-to-counterparty
 * sends; the counterparty-to-primary sends all reuse the one counterparty-
 * owned Recipe (`counterparty.ts`) three times in sequence — each prior
 * send must be terminal (accepted twice, then left pending) before the next
 * begins, since at most one PENDING delivery may exist per
 * (sender, recipient, dish).
 */
export async function buildDirectShareFixtures(
  services: Pick<
    SharingServices,
    | "sendDirectShare"
    | "cancelDirectShare"
    | "declineDirectShare"
    | "acceptDirectShare"
    | "deleteDish"
  >,
  primaryId: string,
  primaryEmail: string,
  counterpartyId: string,
  counterpartyEmail: string,
  ids: {
    ricesidedishDishId: string;
    saladDishId: string;
    sauceDishId: string;
    ricebowlDishId: string;
    pastaDishId: string;
  },
): Promise<DirectShareFixtureSummary[]> {
  const {
    sendDirectShare,
    cancelDirectShare,
    declineDirectShare,
    acceptDirectShare,
    deleteDish,
  } = services;
  const summary: DirectShareFixtureSummary[] = [];

  await sendDirectShare(primaryId, {
    dishId: ids.ricesidedishDishId,
    recipientEmail: counterpartyEmail,
    note: "Can you try this one and tell me what you think?",
  });
  summary.push({
    label: "Pending sent",
    dishTitle: "[QA] Rice Side Dish",
    direction: "primary-to-counterparty",
    status: "PENDING",
  });

  const declineSend = await sendDirectShare(primaryId, {
    dishId: ids.saladDishId,
    recipientEmail: counterpartyEmail,
    note: null,
  });
  await declineDirectShare(counterpartyId, declineSend.directShareId);
  summary.push({
    label: "Declined",
    dishTitle: "[QA] Simple Garden Salad",
    direction: "primary-to-counterparty",
    status: "DECLINED",
  });

  const cancelSend = await sendDirectShare(primaryId, {
    dishId: ids.sauceDishId,
    recipientEmail: counterpartyEmail,
    note: null,
  });
  await cancelDirectShare(primaryId, cancelSend.directShareId);
  summary.push({
    label: "Canceled",
    dishTitle: "[QA] Peanut Dipping Sauce",
    direction: "primary-to-counterparty",
    status: "CANCELED",
  });

  const acceptedByCounterparty = await sendDirectShare(primaryId, {
    dishId: ids.ricebowlDishId,
    recipientEmail: counterpartyEmail,
    note: "Here's my go-to rice bowl.",
  });
  await acceptDirectShare(counterpartyId, acceptedByCounterparty.directShareId);
  summary.push({
    label: "Accepted (copy in counterparty's library)",
    dishTitle: "[QA] Rice Bowl Base",
    direction: "primary-to-counterparty",
    status: "ACCEPTED",
  });

  const acceptedByPrimary = await sendDirectShare(counterpartyId, {
    dishId: ids.pastaDishId,
    recipientEmail: primaryEmail,
    note: "You have to try this one.",
  });
  await acceptDirectShare(primaryId, acceptedByPrimary.directShareId);
  summary.push({
    label: "Accepted (copy in primary's library)",
    dishTitle: "[QA] Counterparty Pasta Night",
    direction: "counterparty-to-primary",
    status: "ACCEPTED",
  });

  const acceptedThenDeleted = await sendDirectShare(counterpartyId, {
    dishId: ids.pastaDishId,
    recipientEmail: primaryEmail,
    note: null,
  });
  const acceptResult = await acceptDirectShare(
    primaryId,
    acceptedThenDeleted.directShareId,
  );
  if (acceptResult.outcome === "accepted") {
    await deleteDish(primaryId, acceptResult.dishId, acceptResult.dishKind);
  }
  summary.push({
    label: "Accepted, copy later deleted",
    dishTitle: "[QA] Counterparty Pasta Night",
    direction: "counterparty-to-primary",
    status: "ACCEPTED (copy deleted)",
  });

  await sendDirectShare(counterpartyId, {
    dishId: ids.pastaDishId,
    recipientEmail: primaryEmail,
    note: "No rush — whenever you get a chance.",
  });
  summary.push({
    label: "Pending received",
    dishTitle: "[QA] Counterparty Pasta Night",
    direction: "counterparty-to-primary",
    status: "PENDING",
  });

  return summary;
}

/**
 * Optional Slice 17 bullet: a `PENDING` delivery auto-canceled by the
 * sender deleting its source Dish (`revokeSharesAndCancelPendingShares`,
 * called from inside `deleteDish`'s own transaction) — distinct from the
 * explicit sender-initiated cancel above. Uses one throwaway Recipe created
 * and deleted within this same function, so nothing persists in the
 * catalog beyond the resulting `CANCELED` `DirectShare` row.
 */
export async function buildSourceDeletionCancellationFixture(
  services: Pick<
    SharingServices,
    "createDish" | "sendDirectShare" | "deleteDish"
  >,
  primaryId: string,
  counterpartyEmail: string,
): Promise<void> {
  const { createDish, sendDirectShare, deleteDish } = services;
  const content: DishContentInput = {
    title: "[QA] Ephemeral Share Source",
    stage: "IDEA",
    cuisine: null,
    description: null,
    yieldQuantity: 1,
    yieldUnit: "serving",
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          {
            name: "Placeholder ingredient",
            quantity: 1,
            unit: "unit",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [{ text: "Not meant to be cooked." }],
      }),
    ],
    partLinks: [],
  };
  const dishId = await createDish(primaryId, "RECIPE", content);
  await sendDirectShare(primaryId, {
    dishId,
    recipientEmail: counterpartyEmail,
    note: null,
  });
  await deleteDish(primaryId, dishId, "RECIPE");
}

function collectionRecipeContent(title: string): DishContentInput {
  return {
    title,
    stage: "ACTIVE",
    cuisine: null,
    description: null,
    yieldQuantity: 2,
    yieldUnit: "servings",
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          {
            name: "Placeholder ingredient",
            quantity: 1,
            unit: "unit",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [{ text: "Not meant to be cooked." }],
      }),
    ],
    partLinks: [],
  };
}

export type DirectShareCollectionFixtureSummary = {
  label: string;
  recipientLookup: string;
  recipeTitles: string[];
  status: string;
};

/**
 * Slice 22: three representative `DirectShareCollection` states —
 * MANUAL_QA_SEED.md/SEED_REVIEW_GUIDE.md's compact fixture set for the
 * unified multi-Recipe sharing flow. Uses dedicated throwaway Recipes
 * (rather than reusing `buildRecipeFixtures`' set) so this function has no
 * ordering dependency on which of those Recipes' pending single-item
 * `DirectShare`s (built above) are still PENDING — a Recipe collection
 * would collide with the "no duplicate pending send" guarantee otherwise.
 */
export async function buildDirectShareCollectionFixtures(
  services: Pick<
    SharingServices,
    | "createDish"
    | "sendDirectShareCollection"
    | "finalizeDirectShareCollectionDecision"
  >,
  primaryId: string,
  counterpartyId: string,
  counterpartyEmail: string,
): Promise<DirectShareCollectionFixtureSummary[]> {
  const {
    createDish,
    sendDirectShareCollection,
    finalizeDirectShareCollectionDecision,
  } = services;
  const summary: DirectShareCollectionFixtureSummary[] = [];

  // 1. Pending multi-Recipe collection sent to the existing QA counterparty.
  const pendingTitles = [
    "[QA] Collection Recipe One",
    "[QA] Collection Recipe Two",
    "[QA] Collection Recipe Three",
  ];
  const pendingDishIds = await Promise.all(
    pendingTitles.map((title) =>
      createDish(primaryId, "RECIPE", collectionRecipeContent(title)),
    ),
  );
  await sendDirectShareCollection(primaryId, {
    recipientEmail: counterpartyEmail,
    dishIds: pendingDishIds,
    note: "A few for the weekend — no rush.",
  });
  summary.push({
    label: "Pending multi-Recipe collection",
    recipientLookup: counterpartyEmail,
    recipeTitles: pendingTitles,
    status: "PENDING x3",
  });

  // 2. Partially accepted/declined collection — counterparty finalizes a
  // subset immediately, matching the ordinary recipient-review action.
  const partialTitles = [
    "[QA] Collection Recipe Four",
    "[QA] Collection Recipe Five",
  ];
  const [acceptDishId, declineDishId] = await Promise.all(
    partialTitles.map((title) =>
      createDish(primaryId, "RECIPE", collectionRecipeContent(title)),
    ),
  );
  const { collectionId: partialCollectionId } = await sendDirectShareCollection(
    primaryId,
    {
      recipientEmail: counterpartyEmail,
      dishIds: [acceptDishId, declineDishId],
      note: "One of these is a repeat, one's new.",
    },
  );
  const acceptedChild = await prisma.directShare.findFirstOrThrow({
    where: { collectionId: partialCollectionId, dishId: acceptDishId },
    select: { id: true },
  });
  await finalizeDirectShareCollectionDecision(
    counterpartyId,
    partialCollectionId,
    [acceptedChild.id],
  );
  summary.push({
    label: "Partially accepted/declined collection",
    recipientLookup: counterpartyEmail,
    recipeTitles: partialTitles,
    status: "1 ACCEPTED, 1 DECLINED",
  });

  // 3. Unclaimed collection addressed to a deterministic invalid-domain
  // email with no User row — the not-yet-registered-recipient state.
  const unclaimedEmail = "not-yet-joined-qa@dishframe.invalid";
  const unclaimedTitle = "[QA] Collection Recipe Unclaimed";
  const unclaimedDishId = await createDish(
    primaryId,
    "RECIPE",
    collectionRecipeContent(unclaimedTitle),
  );
  await sendDirectShareCollection(primaryId, {
    recipientEmail: unclaimedEmail,
    dishIds: [unclaimedDishId],
    note: "You'll see this once you sign in.",
  });
  summary.push({
    label: "Unclaimed collection (no account yet)",
    recipientLookup: unclaimedEmail,
    recipeTitles: [unclaimedTitle],
    status: "PENDING, unclaimed",
  });

  return summary;
}
