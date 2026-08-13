import { prisma } from "@/lib/db/prisma";
import type {
  createShareLink as CreateShareLink,
  revokeShareLink as RevokeShareLink,
  saveSharedCopy as SaveSharedCopy,
  declineDirectShare as DeclineDirectShare,
  acceptDirectShare as AcceptDirectShare,
} from "@/lib/sharing/service";
import type {
  sendDirectShareCollection as SendDirectShareCollection,
  cancelDirectShareCollection as CancelDirectShareCollection,
  finalizeDirectShareCollectionDecision as FinalizeDirectShareCollectionDecision,
  claimPendingDirectShareCollections as ClaimPendingDirectShareCollections,
} from "@/lib/sharing/collections";
import type {
  createDish as CreateDish,
  deleteDish as DeleteDish,
} from "@/lib/dishes/service";
import type { DishContentInput } from "@/lib/dishes/schema";
import type { initializeNewUser as InitializeNewUser } from "@/lib/account/init";
import type { resolveSeedOwner as ResolveSeedOwner } from "./owner";
import { section } from "./parts";

export type SharingServices = {
  createShareLink: typeof CreateShareLink;
  revokeShareLink: typeof RevokeShareLink;
  saveSharedCopy: typeof SaveSharedCopy;
  declineDirectShare: typeof DeclineDirectShare;
  acceptDirectShare: typeof AcceptDirectShare;
  sendDirectShareCollection: typeof SendDirectShareCollection;
  cancelDirectShareCollection: typeof CancelDirectShareCollection;
  finalizeDirectShareCollectionDecision: typeof FinalizeDirectShareCollectionDecision;
  claimPendingDirectShareCollections: typeof ClaimPendingDirectShareCollections;
  createDish: typeof CreateDish;
  deleteDish: typeof DeleteDish;
};

/**
 * `ShareLink`/`DirectShare`/`DirectShareCollection`/`ShareLinkAcceptance`
 * don't cascade away when the Dish they reference is wiped and recreated
 * each run — every FK from them to a Dish/DishVersion is `onDelete:
 * SetNull`, not `Cascade` (the deliberate "survive source deletion"
 * design). Unlike `wipeExistingFixtures`'s Dish/GroceryList/MealPlan/Taster
 * cleanup, these rows need their own explicit pass scoped to the QA
 * accounts or reruns would silently accumulate stale rows forever. Deleting
 * `ShareLink` cascades its own `ShareLinkAcceptance` rows automatically
 * (`onDelete: Cascade` on `shareLinkId`); deleting `DirectShareCollection`
 * cascades its own `DirectShare` children the same way. The deterministic
 * claim-demo account (below) is never wiped here — its only sharing rows
 * are sent BY the primary account, so the senderId scope already covers
 * them.
 */
export async function wipeSharingFixtures(
  primaryId: string,
  counterpartyId: string,
): Promise<void> {
  const accountIds = [primaryId, counterpartyId];
  await prisma.shareLink.deleteMany({
    where: { ownerId: { in: accountIds } },
  });
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
 * The primary QA account's four owned `ShareLink`s. Reuses already-seeded
 * Recipes/Parts rather than creating new content — chosen for a spread of
 * real coverage: nested Parts (Peanut Noodle Salad nests Sauce, which nests
 * Seasoning), an image-empty item under CURRENT mode (Weeknight Stir-Fry),
 * and an already-archived Recipe under a revoked link (Simple Garden
 * Salad).
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
 * "At least one accepted ShareLink copy owned by the primary QA account" —
 * the counterparty (who owns real, shareable content via `counterparty.ts`)
 * creates a link, and the primary account accepts it through the real
 * `saveSharedCopy` engine, landing a genuine independent copy in the
 * primary account's own library.
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

// ============================================================================
// Send-unification pass: every Send (Recipe and/or Part, to an existing
// account or a not-yet-registered email alike) is a `DirectShareCollection`
// envelope with one or more children — there is no separate ungrouped
// single-item send shape anymore. `sendOneItem` below is a thin one-item
// convenience wrapper around `sendDirectShareCollection`, purely so the
// single-item fixtures below don't each have to re-derive their own child's
// `directShareId` from the returned `collectionId`.
// ============================================================================

async function sendOneItem(
  {
    sendDirectShareCollection,
  }: Pick<SharingServices, "sendDirectShareCollection">,
  senderId: string,
  input: { dishId: string; recipientEmail: string; note: string | null },
): Promise<{ directShareId: string; collectionId: string }> {
  const { collectionId } = await sendDirectShareCollection(senderId, {
    recipientEmail: input.recipientEmail,
    dishIds: [input.dishId],
    note: input.note,
  });
  const child = await prisma.directShare.findFirstOrThrow({
    where: { collectionId, dishId: input.dishId },
  });
  return { directShareId: child.id, collectionId };
}

export type DirectShareFixtureSummary = {
  label: string;
  recipientLookup: string;
  itemTitles: string[];
  status: string;
};

function collectionFixtureContent(
  title: string,
  overrides: Partial<DishContentInput> = {},
): DishContentInput {
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
    ...overrides,
  };
}

const CLAIM_DEMO_EMAIL = "qa-claim-demo@dishframe.invalid";
const CLAIM_DEMO_NAME = "[QA] Claim Demo";

/**
 * The full state coverage for the unified Send/delivery model — every
 * lifecycle status (pending/declined/canceled/accepted, in both directions
 * between the primary and counterparty QA accounts), both item kinds
 * (Recipe and Part) sent individually, a mixed Recipe+Part send in one
 * envelope, an unclaimed pending invitation for each item kind, and the
 * claimed transition itself (a pending invitation whose target email only
 * gains a DishFrame account after the Send already exists — mirrors
 * `direct-share-collections.integration.test.ts`'s own claim coverage).
 * Uses dedicated throwaway Recipes/Parts (rather than reusing
 * `buildRecipeFixtures`'/`buildPartFixtures`' sets) so this function has no
 * ordering dependency on any of those items' own pending sends elsewhere in
 * this file — a duplicate pending send to the same recipient would collide
 * with the "no duplicate pending send" guarantee otherwise.
 */
export async function buildDirectShareFixtures(
  services: Pick<
    SharingServices,
    | "createDish"
    | "deleteDish"
    | "sendDirectShareCollection"
    | "cancelDirectShareCollection"
    | "declineDirectShare"
    | "acceptDirectShare"
    | "finalizeDirectShareCollectionDecision"
    | "claimPendingDirectShareCollections"
  >,
  resolveSeedOwner: typeof ResolveSeedOwner,
  initializeNewUser: typeof InitializeNewUser,
  primaryId: string,
  primaryEmail: string,
  counterpartyId: string,
  counterpartyEmail: string,
  // Reuses the one Recipe `counterparty.ts`'s `buildCounterpartyContentFixtures`
  // already created (also used by the cross-account ShareLink copy fixture)
  // rather than creating a second "[QA] Counterparty Pasta Night" — the
  // counterparty-to-primary fixtures below just need something the
  // counterparty already owns to send.
  counterpartyPastaDishId: string,
): Promise<DirectShareFixtureSummary[]> {
  const {
    createDish,
    deleteDish,
    sendDirectShareCollection,
    cancelDirectShareCollection,
    declineDirectShare,
    acceptDirectShare,
    finalizeDirectShareCollectionDecision,
    claimPendingDirectShareCollections,
  } = services;
  const summary: DirectShareFixtureSummary[] = [];

  async function newRecipeOrPart(
    kind: "RECIPE" | "PART",
    title: string,
  ): Promise<string> {
    return createDish(primaryId, kind, collectionFixtureContent(title));
  }

  // 1. Pending sent (Recipe, primary -> counterparty).
  {
    const dishId = await newRecipeOrPart("RECIPE", "[QA] Pending Sent Recipe");
    await sendOneItem(services, primaryId, {
      dishId,
      recipientEmail: counterpartyEmail,
      note: "Can you try this one and tell me what you think?",
    });
    summary.push({
      label: "Pending sent (Recipe, to existing user)",
      recipientLookup: counterpartyEmail,
      itemTitles: ["[QA] Pending Sent Recipe"],
      status: "PENDING",
    });
  }

  // 2. Declined (Recipe, primary -> counterparty).
  {
    const dishId = await newRecipeOrPart("RECIPE", "[QA] Declined Recipe");
    const { directShareId } = await sendOneItem(services, primaryId, {
      dishId,
      recipientEmail: counterpartyEmail,
      note: null,
    });
    await declineDirectShare(counterpartyId, directShareId);
    summary.push({
      label: "Declined",
      recipientLookup: counterpartyEmail,
      itemTitles: ["[QA] Declined Recipe"],
      status: "DECLINED",
    });
  }

  // 3. Canceled (Recipe, primary -> counterparty).
  {
    const dishId = await newRecipeOrPart("RECIPE", "[QA] Canceled Recipe");
    const { collectionId } = await sendOneItem(services, primaryId, {
      dishId,
      recipientEmail: counterpartyEmail,
      note: null,
    });
    await cancelDirectShareCollection(primaryId, collectionId);
    summary.push({
      label: "Canceled",
      recipientLookup: counterpartyEmail,
      itemTitles: ["[QA] Canceled Recipe"],
      status: "CANCELED",
    });
  }

  // 4. Accepted (Recipe, primary -> counterparty) — copy in counterparty's
  // library.
  {
    const dishId = await newRecipeOrPart(
      "RECIPE",
      "[QA] Accepted By Counterparty Recipe",
    );
    const { directShareId } = await sendOneItem(services, primaryId, {
      dishId,
      recipientEmail: counterpartyEmail,
      note: "Here's my go-to for this.",
    });
    await acceptDirectShare(counterpartyId, directShareId);
    summary.push({
      label: "Accepted (copy in counterparty's library)",
      recipientLookup: counterpartyEmail,
      itemTitles: ["[QA] Accepted By Counterparty Recipe"],
      status: "ACCEPTED",
    });
  }

  // 5. Part sent to an existing user (primary -> counterparty).
  {
    const dishId = await newRecipeOrPart("PART", "[QA] Shared Part");
    await sendOneItem(services, primaryId, {
      dishId,
      recipientEmail: counterpartyEmail,
      note: null,
    });
    summary.push({
      label: "Pending sent (Part, to existing user)",
      recipientLookup: counterpartyEmail,
      itemTitles: ["[QA] Shared Part"],
      status: "PENDING",
    });
  }

  // 6. Part sent to a not-yet-registered email — unclaimed.
  {
    const dishId = await newRecipeOrPart(
      "PART",
      "[QA] Unclaimed Part Invitation",
    );
    const unclaimedPartEmail = "not-yet-joined-part-qa@dishframe.invalid";
    await sendDirectShareCollection(primaryId, {
      recipientEmail: unclaimedPartEmail,
      dishIds: [dishId],
      note: "You'll see this once you sign in.",
    });
    summary.push({
      label: "Unclaimed Part invitation (no account yet)",
      recipientLookup: unclaimedPartEmail,
      itemTitles: ["[QA] Unclaimed Part Invitation"],
      status: "PENDING, unclaimed",
    });
  }

  // 7. Mixed Recipe + Part collection, one envelope, sent to the existing
  // counterparty.
  {
    const recipeId = await newRecipeOrPart("RECIPE", "[QA] Mixed Send Recipe");
    const partId = await newRecipeOrPart("PART", "[QA] Mixed Send Part");
    await sendDirectShareCollection(primaryId, {
      recipientEmail: counterpartyEmail,
      dishIds: [recipeId, partId],
      note: "One Recipe and one Part in the same send.",
    });
    summary.push({
      label: "Mixed Recipe + Part collection (to existing user)",
      recipientLookup: counterpartyEmail,
      itemTitles: ["[QA] Mixed Send Recipe", "[QA] Mixed Send Part"],
      status: "PENDING x2",
    });
  }

  // 8. Multi-Recipe pending collection.
  {
    const titles = [
      "[QA] Collection Recipe One",
      "[QA] Collection Recipe Two",
      "[QA] Collection Recipe Three",
    ];
    const dishIds = await Promise.all(
      titles.map((title) => newRecipeOrPart("RECIPE", title)),
    );
    await sendDirectShareCollection(primaryId, {
      recipientEmail: counterpartyEmail,
      dishIds,
      note: "A few for the weekend — no rush.",
    });
    summary.push({
      label: "Pending multi-Recipe collection",
      recipientLookup: counterpartyEmail,
      itemTitles: titles,
      status: "PENDING x3",
    });
  }

  // 9. Partially accepted/declined collection — counterparty finalizes a
  // subset immediately, matching the ordinary recipient-review action.
  {
    const acceptTitle = "[QA] Collection Recipe Four";
    const declineTitle = "[QA] Collection Recipe Five";
    const [acceptDishId, declineDishId] = await Promise.all([
      newRecipeOrPart("RECIPE", acceptTitle),
      newRecipeOrPart("RECIPE", declineTitle),
    ]);
    const { collectionId } = await sendDirectShareCollection(primaryId, {
      recipientEmail: counterpartyEmail,
      dishIds: [acceptDishId, declineDishId],
      note: "One of these is a repeat, one's new.",
    });
    const acceptedChild = await prisma.directShare.findFirstOrThrow({
      where: { collectionId, dishId: acceptDishId },
      select: { id: true },
    });
    await finalizeDirectShareCollectionDecision(counterpartyId, collectionId, [
      acceptedChild.id,
    ]);
    summary.push({
      label: "Partially accepted/declined collection",
      recipientLookup: counterpartyEmail,
      itemTitles: [acceptTitle, declineTitle],
      status: "1 ACCEPTED, 1 DECLINED",
    });
  }

  // 10. Unclaimed Recipe collection — not-yet-registered email, stays
  // unclaimed for this seed run.
  {
    const title = "[QA] Collection Recipe Unclaimed";
    const dishId = await newRecipeOrPart("RECIPE", title);
    const unclaimedEmail = "not-yet-joined-qa@dishframe.invalid";
    await sendDirectShareCollection(primaryId, {
      recipientEmail: unclaimedEmail,
      dishIds: [dishId],
      note: "You'll see this once you sign in.",
    });
    summary.push({
      label: "Unclaimed Recipe collection (no account yet)",
      recipientLookup: unclaimedEmail,
      itemTitles: [title],
      status: "PENDING, unclaimed",
    });
  }

  // 11. Claimed transition — sent while `CLAIM_DEMO_EMAIL` has no account,
  // then a real (deterministic, idempotently upserted) account is created
  // for that exact email and the pending invitation is claimed, mirroring
  // `direct-share-collections.integration.test.ts`'s own claim coverage.
  // Demonstrates the "hasn't joined" -> "joined" transition the Sent list's
  // badge reflects.
  {
    const title = "[QA] Claimed Recipe";
    const dishId = await newRecipeOrPart("RECIPE", title);
    await sendDirectShareCollection(primaryId, {
      recipientEmail: CLAIM_DEMO_EMAIL,
      dishIds: [dishId],
      note: "Claim this once you're signed up.",
    });
    const claimDemo = await resolveSeedOwner(
      initializeNewUser,
      CLAIM_DEMO_EMAIL,
      CLAIM_DEMO_NAME,
    );
    await claimPendingDirectShareCollections(
      claimDemo.id,
      CLAIM_DEMO_EMAIL,
      true,
    );
    summary.push({
      label: "Claimed collection (recipient joined after Send)",
      recipientLookup: CLAIM_DEMO_EMAIL,
      itemTitles: [title],
      status: "PENDING, claimed",
    });
  }

  // 12. Accepted (Recipe, counterparty -> primary) — copy in primary's
  // library; and 13. accepted then copy deleted; and 14. pending received
  // — reuses one counterparty-owned Recipe three times in sequence, each
  // prior send terminal before the next begins (at most one PENDING
  // delivery may exist per sender/dish/recipient-email).
  {
    const pastaDishId = counterpartyPastaDishId;

    const acceptedByPrimary = await sendOneItem(services, counterpartyId, {
      dishId: pastaDishId,
      recipientEmail: primaryEmail,
      note: "You have to try this one.",
    });
    await acceptDirectShare(primaryId, acceptedByPrimary.directShareId);
    summary.push({
      label: "Accepted (copy in primary's library)",
      recipientLookup: primaryEmail,
      itemTitles: ["[QA] Counterparty Pasta Night"],
      status: "ACCEPTED",
    });

    const acceptedThenDeleted = await sendOneItem(services, counterpartyId, {
      dishId: pastaDishId,
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
      recipientLookup: primaryEmail,
      itemTitles: ["[QA] Counterparty Pasta Night"],
      status: "ACCEPTED (copy deleted)",
    });

    await sendOneItem(services, counterpartyId, {
      dishId: pastaDishId,
      recipientEmail: primaryEmail,
      note: "No rush — whenever you get a chance.",
    });
    summary.push({
      label: "Pending received",
      recipientLookup: primaryEmail,
      itemTitles: ["[QA] Counterparty Pasta Night"],
      status: "PENDING",
    });
  }

  return summary;
}

/**
 * A `PENDING` delivery auto-canceled by the sender deleting its source Dish
 * (`revokeSharesAndCancelPendingShares`, called from inside `deleteDish`'s
 * own transaction) — distinct from the explicit sender-initiated cancel
 * above. Uses one throwaway Recipe created and deleted within this same
 * function, so nothing persists in the catalog beyond the resulting
 * `CANCELED` `DirectShare` row.
 */
export async function buildSourceDeletionCancellationFixture(
  services: Pick<
    SharingServices,
    "createDish" | "sendDirectShareCollection" | "deleteDish"
  >,
  primaryId: string,
  counterpartyEmail: string,
): Promise<void> {
  const { createDish, deleteDish } = services;
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
  await sendOneItem(services, primaryId, {
    dishId,
    recipientEmail: counterpartyEmail,
    note: null,
  });
  await deleteDish(primaryId, dishId, "RECIPE");
}
