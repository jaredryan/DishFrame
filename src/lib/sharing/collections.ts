import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  AuthorizationError,
} from "@/lib/errors";
import { normalizeEmail } from "@/lib/auth/email";
import { createIndependentCopyFromGraph } from "@/lib/dishes/service";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel } from "@/lib/dishes/version-note";
import {
  getPrincipalRatingsForDishes,
  type PrincipalRating,
} from "@/lib/reviews/queries";
import type { DishKindValue, StageValue } from "@/lib/dishes/schema";

/** `finalizeDirectShareCollectionDecision` may run `createIndependentCopyFromGraph`
 * (several sequential creates per item) for every accepted child in one
 * transaction — Prisma's 5000ms interactive-transaction default was
 * observed timing out (P2028) in production against Neon's per-statement
 * latency, even for a single accepted item. */
const FINALIZE_COLLECTION_TRANSACTION_TIMEOUT_MS = 45_000;
import {
  buildShareGraph,
  collectGraphImageAssetIds,
  serializeShareGraph,
  deserializeShareGraph,
} from "@/lib/sharing/graph";
import {
  DIRECT_SHARE_MAX_ITEMS,
  type SendOneDirectShareCollectionInput,
} from "@/lib/sharing/schema";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";

// ============================================================================
// Send-unification pass: one canonical Send flow for any mix of Recipes and
// Parts, plus pending invitations for a not-yet-registered recipient. One
// `DirectShare` row per shared item, grouped under a `DirectShareCollection`
// parent — reuses `buildShareGraph` + `createIndependentCopyFromGraph`
// exactly as Slice 16/17 do, never a second copy architecture. See
// schema.prisma's own doc comments on both models for the full design
// rationale (why `recipientId` stays synced onto every child, why the
// partial unique index is keyed by email).
// ============================================================================

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const DUPLICATE_PENDING_COLLECTION_MESSAGE =
  "One or more selected items already have a pending share to that person.";

// Send-time re-validation (picker resend-prevention pass): the picker's own
// eligibility check is client-driven and can lag a race or a manually
// submitted request, so Send re-validates authoritatively here using the
// exact same `getDirectShareHistoryForRecipient` eligibility semantics the
// picker calls — never a second, subtly different rule.
const ALREADY_SHARED_MESSAGE =
  "One or more selected items have already been shared with that person.";

export type ShareableItemSummary = {
  id: string;
  kind: DishKindValue;
  title: string;
  versionLabel: string;
  stage: StageValue;
  cuisineNames: string[];
  archivedAt: string | null;
  imageAssetId: string | null;
  tagNames: string[];
  rating: PrincipalRating;
};

/**
 * PRODUCT_SPEC.md §85 extension: the field list the unified send flow's item
 * selector renders — kind, title, Version, image, lifecycle/stage, cuisine,
 * custom tags, and rating, across both Recipes and Parts with a current
 * Version (via `currentVersionId: { not: null }`). Design pass (rich
 * selection-row unification): the selector now shares the same row
 * treatment as the Add/Edit Meal and `/cook` pickers, so this resolves the
 * same rating/tag data `dishes/queries.ts#queryDishLibrary` does rather than
 * staying deliberately minimal.
 */
export async function listShareableItemsForSender(
  ownerId: string,
): Promise<ShareableItemSummary[]> {
  const [preference, rows] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: ownerId },
      select: { primaryRatingDisplay: true },
    }),
    prisma.dish.findMany({
      where: { ownerId, currentVersionId: { not: null } },
      select: {
        id: true,
        kind: true,
        currentTitle: true,
        stage: true,
        archivedAt: true,
        currentVersionId: true,
        sourceKind: true,
        sourceAggregateRating: true,
        sourceRatingCount: true,
        sourceTitle: true,
        sourceDishVersionLabel: true,
        currentVersion: {
          select: {
            imageAssetId: true,
            majorVersion: true,
            minorVersion: true,
          },
        },
        tags: {
          select: { tag: { select: { displayName: true, isFavorite: true } } },
        },
        cuisines: {
          select: {
            cuisine: { select: { displayName: true, position: true } },
          },
        },
      },
      orderBy: { currentTitle: "asc" },
    }),
  ]);

  const ratings = await getPrincipalRatingsForDishes(
    rows.map((row) => ({
      id: row.id,
      currentVersionId: row.currentVersionId,
      sourceKind: row.sourceKind,
      sourceAggregateRating: decimalToNumber(row.sourceAggregateRating),
      sourceRatingCount: row.sourceRatingCount,
      sourceTitle: row.sourceTitle,
      sourceDishVersionLabel: row.sourceDishVersionLabel,
    })),
    preference?.primaryRatingDisplay ?? "GROUP_AVERAGE",
  );

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.currentTitle ?? "Untitled",
    versionLabel: row.currentVersion
      ? versionLabel(
          row.currentVersion.majorVersion,
          row.currentVersion.minorVersion,
        )
      : "",
    stage: row.stage,
    cuisineNames: row.cuisines
      .map((c) => c.cuisine)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.displayName),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    imageAssetId: row.currentVersion?.imageAssetId ?? null,
    tagNames: row.tags
      .filter((t) => !t.tag.isFavorite)
      .map((t) => t.tag.displayName),
    rating: ratings.get(row.id) ?? { kind: "none" },
  }));
}

export type DirectShareHistoryStatus = "ACCEPTED" | "PENDING";

/**
 * Sender-side dedup for the Send picker (direct-share picker resend-
 * prevention pass): for the given sender + candidate recipient email, which
 * of the sender's own source Dishes already have an ACCEPTED or PENDING
 * `DirectShare` to that exact recipient — the same `recipientLookup`
 * email-keyed matching `sendDirectShareCollection`'s own duplicate-pending
 * check already uses. Declined/canceled shares (or no share at all) leave a
 * Dish out of the result, i.e. still eligible. PENDING always wins over an
 * older ACCEPTED for the same Dish (a stronger, currently-blocking state),
 * regardless of row order.
 */
export async function getDirectShareHistoryForRecipient(
  senderId: string,
  recipientEmail: string,
  /** Scopes the query to these Dishes only — the Send-time re-validation
   * check passes its submitted `dishIds` here; the picker omits it to get
   * the sender's full history against this recipient. */
  dishIds?: string[],
): Promise<Record<string, DirectShareHistoryStatus>> {
  const recipientLookup = normalizeEmail(recipientEmail);
  const rows = await prisma.directShare.findMany({
    where: {
      senderId,
      recipientLookup,
      dishId: dishIds ? { in: dishIds } : { not: null },
      status: { in: ["ACCEPTED", "PENDING"] },
    },
    select: { dishId: true, status: true },
  });

  const history: Record<string, DirectShareHistoryStatus> = {};
  for (const row of rows) {
    if (!row.dishId) continue;
    if (row.status === "PENDING") {
      history[row.dishId] = "PENDING";
    } else if (history[row.dishId] !== "PENDING") {
      history[row.dishId] = "ACCEPTED";
    }
  }
  return history;
}

export async function sendDirectShareCollection(
  senderId: string,
  input: SendOneDirectShareCollectionInput,
): Promise<{ collectionId: string }> {
  // Dedupe by dishId (last explicit Version choice for a given item wins) —
  // the picker only ever produces one entry per selected item, this just
  // guards defensively against a malformed/replayed request.
  const itemByDishId = new Map(input.items.map((item) => [item.dishId, item]));
  const items = [...itemByDishId.values()];
  if (items.length > DIRECT_SHARE_MAX_ITEMS) {
    throw new ValidationError(
      `You can send at most ${DIRECT_SHARE_MAX_ITEMS} items at once.`,
    );
  }
  const dishIds = items.map((item) => item.dishId);

  const recipientEmail = normalizeEmail(input.recipientEmail);

  // Minor sharing-send optimization (docs/performance-architecture-audit.md):
  // none of these five reads depends on another's result, so they run
  // together instead of as five sequential round trips. Validation order
  // (and therefore which error message surfaces first when more than one
  // problem exists) stays exactly as before — only the fetching moved
  // earlier/parallel, not the throw order below.
  const [sender, dishes, chosenVersions, shareHistory, recipient] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: senderId },
        select: { email: true },
      }),
      prisma.dish.findMany({
        where: { id: { in: dishIds }, ownerId: senderId },
        select: { id: true, currentTitle: true },
      }),
      // Each explicit Version choice must actually belong to its own Dish.
      prisma.dishVersion.findMany({
        where: { id: { in: items.map((item) => item.dishVersionId) } },
        select: { id: true, dishId: true },
      }),
      getDirectShareHistoryForRecipient(senderId, recipientEmail, dishIds),
      prisma.user.findFirst({
        where: { email: { equals: recipientEmail, mode: "insensitive" } },
        select: { id: true },
      }),
    ]);

  if (sender && normalizeEmail(sender.email) === recipientEmail) {
    throw new ValidationError("You can't send a share to yourself.");
  }

  if (dishes.length !== dishIds.length) {
    throw new NotFoundError(
      "One or more selected items are not available to share.",
    );
  }
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));

  const dishIdByVersionId = new Map(
    chosenVersions.map((v) => [v.id, v.dishId]),
  );
  for (const item of items) {
    if (dishIdByVersionId.get(item.dishVersionId) !== item.dishId) {
      throw new NotFoundError(
        "One or more selected items' chosen Versions are no longer available.",
      );
    }
  }

  const alreadySharedDishId = dishIds.find((id) => shareHistory[id]);
  if (alreadySharedDishId) {
    throw new ConflictError(ALREADY_SHARED_MESSAGE);
  }

  // Freeze every selected graph now, outside the transaction (pure reads) —
  // the exact content Preview/Accept will use, matching Slice 17's frozen-
  // delivery guarantee per item. Each freezes from its own explicitly
  // chosen Version, not necessarily the Dish's current one.
  const frozenChildren = await Promise.all(
    items.map(async (item) => {
      const dish = dishById.get(item.dishId)!;
      const graph = await buildShareGraph(item.dishId, item.dishVersionId);
      return {
        dishId: item.dishId,
        dishVersionId: item.dishVersionId,
        dishTitleSnapshot: dish.currentTitle ?? "Untitled",
        frozenGraph: serializeShareGraph(
          graph,
        ) as unknown as Prisma.InputJsonValue,
        frozenImageAssetIds: collectGraphImageAssetIds(graph),
      };
    }),
  );

  try {
    const collection = await prisma.$transaction(async (tx) => {
      const created = await tx.directShareCollection.create({
        data: {
          senderId,
          recipientId: recipient?.id ?? null,
          recipientLookup: recipientEmail,
          note: input.note && input.note.length > 0 ? input.note : null,
        },
      });
      // Minor sharing-send optimization: one `createMany` instead of one
      // individually-awaited `create` per child — nothing downstream needs
      // each child's generated id back, so there's no ordering dependency
      // to preserve here.
      await tx.directShare.createMany({
        data: frozenChildren.map((child) => ({
          senderId,
          recipientId: recipient?.id ?? null,
          recipientLookup: recipientEmail,
          dishId: child.dishId,
          dishVersionId: child.dishVersionId,
          dishTitleSnapshot: child.dishTitleSnapshot,
          frozenGraph: child.frozenGraph,
          frozenImageAssetIds: child.frozenImageAssetIds,
          collectionId: created.id,
        })),
      });
      return created;
    });
    return { collectionId: collection.id };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError(DUPLICATE_PENDING_COLLECTION_MESSAGE);
    }
    throw error;
  }
}

export type DirectShareCollectionChildSummary = {
  id: string;
  dishId: string | null;
  dishKind: DishKindValue | null;
  dishTitleSnapshot: string;
  status: DirectShareStatusValue;
  createdDishId: string | null;
};

export type SentDirectShareCollectionSummary = {
  id: string;
  recipientName: string | null;
  recipientLookup: string;
  hasJoined: boolean;
  note: string | null;
  createdAt: Date;
  children: DirectShareCollectionChildSummary[];
};

function toChildSummary(row: {
  id: string;
  dishId: string | null;
  dishTitleSnapshot: string;
  status: DirectShareStatusValue;
  createdDishId: string | null;
  dishVersion: { dish: { kind: DishKindValue } } | null;
  createdDish: { kind: DishKindValue } | null;
}): DirectShareCollectionChildSummary {
  return {
    id: row.id,
    dishId: row.dishId,
    dishKind: row.dishVersion?.dish.kind ?? row.createdDish?.kind ?? null,
    dishTitleSnapshot: row.dishTitleSnapshot,
    status: row.status,
    createdDishId: row.createdDishId,
  };
}

const childInclude = {
  dishVersion: { select: { dish: { select: { kind: true } } } },
  createdDish: { select: { kind: true } },
} as const;

export async function listSentDirectShareCollections(
  senderId: string,
): Promise<SentDirectShareCollectionSummary[]> {
  const rows = await prisma.directShareCollection.findMany({
    where: { senderId },
    orderBy: { createdAt: "desc" },
    include: {
      recipient: { select: { name: true } },
      children: { include: childInclude, orderBy: { createdAt: "asc" } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    recipientName: row.recipient?.name ?? null,
    recipientLookup: row.recipientLookup,
    hasJoined: row.recipientId !== null,
    note: row.note,
    createdAt: row.createdAt,
    children: row.children.map(toChildSummary),
  }));
}

export type ReceivedDirectShareCollectionSummary = {
  id: string;
  senderName: string;
  note: string | null;
  createdAt: Date;
  children: DirectShareCollectionChildSummary[];
};

/** Only collections already bound to this recipient — an unclaimed pending
 * invitation is visible only to its sender (PRODUCT_SPEC.md's security
 * boundary), and binding happens exactly once, at claim time. */
/**
 * Received-share toast notification: how many still-PENDING received items
 * (across single sends and collections alike — every `DirectShare` row
 * belongs to a collection regardless) arrived after `sinceExclusive`, i.e.
 * since the recipient last acknowledged the notification. `null` means
 * "never acknowledged" — every currently-pending item counts.
 */
export async function countNewReceivedShares(
  recipientId: string,
  sinceExclusive: Date | null,
): Promise<number> {
  return prisma.directShare.count({
    where: {
      recipientId,
      status: "PENDING",
      ...(sinceExclusive ? { createdAt: { gt: sinceExclusive } } : {}),
    },
  });
}

export async function listReceivedDirectShareCollections(
  recipientId: string,
): Promise<ReceivedDirectShareCollectionSummary[]> {
  const rows = await prisma.directShareCollection.findMany({
    where: { recipientId },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { name: true } },
      children: { include: childInclude, orderBy: { createdAt: "asc" } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    senderName: row.sender.name,
    note: row.note,
    createdAt: row.createdAt,
    children: row.children.map(toChildSummary),
  }));
}

/** Sender-only: cancels every remaining PENDING child of the collection —
 * works identically whether the collection is still unclaimed or already
 * claimed (PRODUCT_SPEC.md: sender may cancel "an entirely unclaimed
 * collection" or "all remaining pending items in a claimed collection").
 * Never overwrites an ACCEPTED/DECLINED child, and never touches another
 * sender's collection. */
export async function cancelDirectShareCollection(
  senderId: string,
  collectionId: string,
): Promise<void> {
  const collection = await prisma.directShareCollection.findFirst({
    where: { id: collectionId, senderId },
    select: { id: true },
  });
  if (!collection) throw new NotFoundError("Shared collection not found.");
  await prisma.directShare.updateMany({
    where: { collectionId, senderId, status: "PENDING" },
    data: { status: "CANCELED" },
  });
}

export type FinalizeDirectShareCollectionResult = {
  accepted: {
    directShareId: string;
    dishId: string;
    dishKind: DishKindValue;
  }[];
  declined: string[];
};

/**
 * Recipient-only. One transaction decides every still-PENDING child of the
 * collection: children whose id is in `acceptedShareIds` are accepted and
 * copied (reusing `createIndependentCopyFromGraph` inside this same shared
 * transaction — Gate 7's copy engine, not a reimplementation); every other
 * still-PENDING child is declined as part of this same action
 * (PRODUCT_SPEC.md's explicit "unselected items are declined" rule).
 * "Accept all" passes every pending id; "Decline all" passes none.
 *
 * Safe against retries/concurrency: each child's transition is a
 * conditional `status: "PENDING"` guard (the same pattern
 * `sharing/service.ts`'s single-item `acceptDirectShare` already uses) — a
 * retry of an already-finalized collection finds no PENDING children left
 * and simply reports the (already-decided) current state, never a second
 * copy or a changed decision.
 */
export async function finalizeDirectShareCollectionDecision(
  recipientId: string,
  collectionId: string,
  acceptedShareIds: string[],
): Promise<FinalizeDirectShareCollectionResult> {
  const collection = await prisma.directShareCollection.findFirst({
    where: { id: collectionId, recipientId },
    select: { id: true },
  });
  if (!collection) throw new NotFoundError("Shared collection not found.");

  const pendingChildren = await prisma.directShare.findMany({
    where: { collectionId, recipientId, status: "PENDING" },
    select: { id: true, frozenGraph: true },
  });

  const acceptedSet = new Set(acceptedShareIds);
  const result: FinalizeDirectShareCollectionResult = {
    accepted: [],
    declined: [],
  };
  if (pendingChildren.length === 0) return result;

  await prisma.$transaction(
    async (tx) => {
      for (const child of pendingChildren) {
        if (acceptedSet.has(child.id)) {
          if (!child.frozenGraph) {
            // Corrupt/legacy row with no frozen content — decline rather than
            // silently skip, so the collection never stays ambiguously
            // pending for this item.
            await tx.directShare.updateMany({
              where: { id: child.id, recipientId, status: "PENDING" },
              data: { status: "DECLINED" },
            });
            continue;
          }
          const graph = deserializeShareGraph(child.frozenGraph);
          const transition = await tx.directShare.updateMany({
            where: { id: child.id, recipientId, status: "PENDING" },
            data: { status: "ACCEPTED" },
          });
          if (transition.count === 0) continue;
          const copy = await createIndependentCopyFromGraph(
            tx,
            recipientId,
            graph,
          );
          await tx.directShare.update({
            where: { id: child.id },
            data: { createdDishId: copy.dishId },
          });
          result.accepted.push({
            directShareId: child.id,
            dishId: copy.dishId,
            dishKind: copy.dishKind,
          });
        } else {
          const transition = await tx.directShare.updateMany({
            where: { id: child.id, recipientId, status: "PENDING" },
            data: { status: "DECLINED" },
          });
          if (transition.count > 0) result.declined.push(child.id);
        }
      }
    },
    { timeout: FINALIZE_COLLECTION_TRANSACTION_TIMEOUT_MS },
  );

  return result;
}

// ============================================================================
// Claiming: integrates with the existing new-user initialization/auth
// lifecycle (`account/init.ts`'s `initializeNewUser`, itself run from Better
// Auth's `user.create.after` hook and — as a recovery path — the (app) shell
// layout) rather than a parallel authentication path. Never creates a
// placeholder Better Auth User/Account/Session; only binds a pending
// invitation to a real, already-created account.
// ============================================================================

/**
 * Binds every still-actionable pending collection addressed to `email` to
 * `userId` — transactionally and idempotently. Never claims for an
 * unverified email, never claims a fully-canceled collection (one with no
 * remaining PENDING child — `children: { some: { status: "PENDING" } } }`
 * excludes it, so it simply never becomes claimable, matching Slice 19's
 * "a canceled invitation must not become claimable by a future account
 * using the same email"), and never auto-accepts anything — binding only
 * makes the collection reachable through ordinary Received review.
 *
 * Safe under concurrency: the update's own `recipientId: null` predicate is
 * re-evaluated by Postgres at execution time, so a second concurrent/retried
 * call finds nothing left to bind and is a no-op.
 */
export async function claimPendingDirectShareCollections(
  userId: string,
  email: string,
  emailVerified: boolean,
): Promise<void> {
  if (!emailVerified) return;
  const normalized = normalizeEmail(email);

  await prisma.$transaction(async (tx) => {
    const claimable = await tx.directShareCollection.findMany({
      where: {
        recipientId: null,
        recipientLookup: normalized,
        children: { some: { status: "PENDING" } },
      },
      select: { id: true },
    });
    if (claimable.length === 0) return;
    const collectionIds = claimable.map((row) => row.id);

    await tx.directShareCollection.updateMany({
      where: { id: { in: collectionIds }, recipientId: null },
      data: { recipientId: userId },
    });
    await tx.directShare.updateMany({
      where: { collectionId: { in: collectionIds }, status: "PENDING" },
      data: { recipientId: userId },
    });
  });
}

/**
 * `/share` page wiring: reconciles this signed-in user's own pending
 * invitations before the page's Sent/Received queries run, closing a
 * narrow race (sender's exact-email lookup racing a few ms ahead of the recipient's own
 * account row becoming visible, stranding the invitation past the one-shot
 * `account/init.ts` claim window). `email`/`emailVerified` are read fresh
 * from `userId`'s own row here — never taken from a caller-supplied
 * argument or client input — so this only ever claims for an email
 * DishFrame itself has verified, exactly like `initializeNewUser` already
 * does. Delegates to `claimPendingDirectShareCollections`, so it inherits
 * the same idempotent, concurrency-safe, verified-email-only, never-
 * auto-accepts behavior rather than a second claim algorithm.
 */
export async function reconcilePendingDirectShareCollectionsForViewer(
  userId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });
  if (!user) return;
  await claimPendingDirectShareCollections(
    userId,
    user.email,
    user.emailVerified,
  );
}

export type DirectShareCollectionDetail = {
  id: string;
  senderId: string;
  senderName: string;
  recipientLookup: string;
  hasJoined: boolean;
  note: string | null;
  createdAt: Date;
  children: DirectShareCollectionChildSummary[];
};

/**
 * Either party (sender or the bound recipient) may fetch one collection's
 * detail — the sender's own cancel view and the recipient's Review dialog
 * both use this single function rather than duplicating the query.
 */
export async function getDirectShareCollectionDetail(
  userId: string,
  collectionId: string,
): Promise<DirectShareCollectionDetail> {
  const row = await prisma.directShareCollection.findUnique({
    where: { id: collectionId },
    include: {
      sender: { select: { name: true } },
      children: { include: childInclude, orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) throw new NotFoundError("Shared collection not found.");
  if (row.senderId !== userId && row.recipientId !== userId) {
    throw new AuthorizationError("You do not have access to this share.");
  }
  return {
    id: row.id,
    senderId: row.senderId,
    senderName: row.sender.name,
    recipientLookup: row.recipientLookup,
    hasJoined: row.recipientId !== null,
    note: row.note,
    createdAt: row.createdAt,
    children: row.children.map(toChildSummary),
  };
}
