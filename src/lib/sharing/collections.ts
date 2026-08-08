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
import type { DishKindValue, StageValue } from "@/lib/dishes/schema";
import {
  buildShareGraph,
  collectGraphImageAssetIds,
  serializeShareGraph,
  deserializeShareGraph,
} from "@/lib/sharing/graph";
import {
  DIRECT_SHARE_COLLECTION_MAX_RECIPES,
  type SendDirectShareCollectionInput,
} from "@/lib/sharing/schema";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";

// ============================================================================
// Slice 22: unified single-/multi-Recipe direct sharing, plus pending
// invitations for a not-yet-registered recipient. Builds directly on Slice
// 17's `DirectShare` (one row per shared Recipe, unchanged) grouped under a
// new `DirectShareCollection` parent — reuses `buildShareGraph` +
// `createIndependentCopyFromGraph` exactly as Slice 16/17 do, never a second
// copy architecture. See schema.prisma's own doc comments on both models for
// the full design rationale (why `recipientId` stays synced onto every
// child, why the new partial unique index is keyed by email).
// ============================================================================

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const DUPLICATE_PENDING_COLLECTION_MESSAGE =
  "One or more selected Recipes already have a pending share to that person.";

export type ShareableRecipeSummary = {
  id: string;
  title: string;
  stage: StageValue;
  archivedAt: string | null;
  imageAssetId: string | null;
};

/**
 * PRODUCT_SPEC.md §85 extension: the minimal-field list the unified send
 * flow's Recipe selector renders — title, image, lifecycle/stage, and
 * (via the `currentVersionId: { not: null }` filter) current-Version
 * existence. Deliberately not `dishes/queries.ts`'s `dishCardSelect` or
 * `queryDishLibrary` — those resolve tags/Flavor profiles/ratings/last-
 * cooked data the selector never renders, which would load real content
 * weight this slice's product decision explicitly says to avoid.
 */
export async function listShareableRecipesForSender(
  ownerId: string,
): Promise<ShareableRecipeSummary[]> {
  const rows = await prisma.dish.findMany({
    where: { ownerId, kind: "RECIPE", currentVersionId: { not: null } },
    select: {
      id: true,
      currentTitle: true,
      stage: true,
      archivedAt: true,
      currentVersion: { select: { imageAssetId: true } },
    },
    orderBy: { currentTitle: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.currentTitle ?? "Untitled",
    stage: row.stage,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    imageAssetId: row.currentVersion?.imageAssetId ?? null,
  }));
}

export async function sendDirectShareCollection(
  senderId: string,
  input: SendDirectShareCollectionInput,
): Promise<{ collectionId: string }> {
  const dishIds = [...new Set(input.dishIds)];
  if (dishIds.length > DIRECT_SHARE_COLLECTION_MAX_RECIPES) {
    throw new ValidationError(
      `You can send at most ${DIRECT_SHARE_COLLECTION_MAX_RECIPES} Recipes at once.`,
    );
  }

  const recipientEmail = normalizeEmail(input.recipientEmail);

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { email: true },
  });
  if (sender && normalizeEmail(sender.email) === recipientEmail) {
    throw new ValidationError("You can't send a share to yourself.");
  }

  const dishes = await prisma.dish.findMany({
    where: { id: { in: dishIds }, ownerId: senderId, kind: "RECIPE" },
    select: { id: true, currentVersionId: true, currentTitle: true },
  });
  if (dishes.length !== dishIds.length) {
    throw new NotFoundError(
      "One or more selected Recipes are not available to share.",
    );
  }
  for (const dish of dishes) {
    if (!dish.currentVersionId) {
      throw new NotFoundError(
        "One or more selected Recipes have no saved content to share yet.",
      );
    }
  }

  const existingPending = await prisma.directShare.findFirst({
    where: {
      senderId,
      dishId: { in: dishIds },
      recipientLookup: recipientEmail,
      status: "PENDING",
      collectionId: { not: null },
    },
    select: { id: true },
  });
  if (existingPending) {
    throw new ConflictError(DUPLICATE_PENDING_COLLECTION_MESSAGE);
  }

  const recipient = await prisma.user.findFirst({
    where: { email: { equals: recipientEmail, mode: "insensitive" } },
    select: { id: true },
  });

  // Freeze every selected graph now, outside the transaction (pure reads) —
  // the exact content Preview/Accept will use, matching Slice 17's frozen-
  // delivery guarantee per Recipe.
  const frozenChildren = await Promise.all(
    dishes.map(async (dish) => {
      const graph = await buildShareGraph(dish.id, dish.currentVersionId!);
      return {
        dishId: dish.id,
        dishVersionId: dish.currentVersionId!,
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
      for (const child of frozenChildren) {
        await tx.directShare.create({
          data: {
            senderId,
            recipientId: recipient?.id ?? null,
            recipientLookup: recipientEmail,
            dishId: child.dishId,
            dishVersionId: child.dishVersionId,
            dishTitleSnapshot: child.dishTitleSnapshot,
            frozenGraph: child.frozenGraph,
            frozenImageAssetIds: child.frozenImageAssetIds,
            collectionId: created.id,
          },
        });
      }
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
 * (PRODUCT_SPEC.md's explicit "unselected Recipes are declined" rule).
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

  await prisma.$transaction(async (tx) => {
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
  });

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
