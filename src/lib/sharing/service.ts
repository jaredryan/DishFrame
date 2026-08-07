import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  AuthorizationError,
} from "@/lib/errors";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import { createIndependentCopyFromGraph } from "@/lib/dishes/service";
import type { DishKindValue } from "@/lib/dishes/schema";
import {
  generateTokenId,
  buildShareToken,
  buildShareUrl,
  parseShareToken,
} from "@/lib/sharing/tokens";
import {
  buildShareGraph,
  collectGraphImageAssetIds,
  serializeShareGraph,
  deserializeShareGraph,
} from "@/lib/sharing/graph";
import {
  buildPublicShareContent,
  collectPublicContentImageAssetIds,
  type PublicShareContent,
} from "@/lib/sharing/public-dto";
import type {
  CreateShareLinkInput,
  UpdateShareLinkInput,
  SendDirectShareInput,
  DirectShareStatusValue,
} from "@/lib/sharing/schema";
import { Prisma } from "@/generated/prisma/client";

/** Denormalized alongside the whitelisted content, purely so the image
 * route's share-token branch never has to walk the whole nested tree on
 * every request (ARCHITECTURE_PROPOSAL.md §D.2a). Not part of the public
 * content shape itself. */
type FrozenSnapshot = {
  content: PublicShareContent;
  imageAssetIds: string[];
};

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const PENDING_DIRECT_SHARE_INDEX_NAME =
  "one_pending_direct_share_per_sender_recipient_dish";

/**
 * Hardening pass: maps a P2002 to the duplicate-pending `ConflictError`
 * only when it's actually this partial index, not any P2002 `create`
 * could raise. Prisma exposes no `meta.target` for a hand-authored index
 * (verified against this codebase's Prisma/driver-adapter version) — the
 * name only survives in the raw Postgres message, so that's the signal
 * used here (a narrowly justified fallback, not a documented Prisma API).
 */
function isDuplicatePendingDirectShareViolation(error: unknown): boolean {
  if (!isUniqueConstraintViolation(error)) return false;
  const meta = (error as Prisma.PrismaClientKnownRequestError).meta as
    | { driverAdapterError?: { cause?: { originalMessage?: unknown } } }
    | undefined;
  const originalMessage = meta?.driverAdapterError?.cause?.originalMessage;
  return (
    typeof originalMessage === "string" &&
    originalMessage.includes(PENDING_DIRECT_SHARE_INDEX_NAME)
  );
}

async function resolveRootVersion(
  ownerId: string,
  dishId: string,
  versionId: string | undefined,
): Promise<{
  dishId: string;
  versionId: string;
  kind: DishKindValue;
  title: string | null;
}> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId);
  const targetVersionId = versionId ?? dish.currentVersionId;
  if (!targetVersionId) {
    throw new NotFoundError("This item has no saved content to share yet.");
  }
  const version = await prisma.dishVersion.findFirst({
    where: { id: targetVersionId, dishId: dish.id },
    select: { id: true },
  });
  if (!version) throw new NotFoundError("Version not found.");
  return {
    dishId: dish.id,
    versionId: version.id,
    kind: dish.kind,
    title: dish.currentTitle,
  };
}

export async function createShareLink(
  ownerId: string,
  input: CreateShareLinkInput,
): Promise<{ shareLinkId: string; url: string }> {
  const root = await resolveRootVersion(ownerId, input.dishId, input.versionId);
  const tokenId = generateTokenId();
  const dishTitle = root.title ?? "Untitled";

  if (input.mode === "CURRENT") {
    const shareLink = await prisma.shareLink.create({
      data: {
        ownerId,
        mode: "CURRENT",
        tokenId,
        currentDishId: root.dishId,
        dishTitleSnapshot: dishTitle,
        expiresAt: input.expiresAt ?? null,
        showCreatorName: input.showCreatorName,
      },
    });
    return { shareLinkId: shareLink.id, url: buildShareToken(tokenId) };
  }

  const graph = await buildShareGraph(root.dishId, root.versionId);
  const content = await buildPublicShareContent(graph);
  const frozenSnapshot: FrozenSnapshot = {
    content,
    imageAssetIds: collectPublicContentImageAssetIds(content),
  };

  const shareLink = await prisma.shareLink.create({
    data: {
      ownerId,
      mode: "FIXED_SNAPSHOT",
      tokenId,
      fixedDishId: root.dishId,
      fixedDishVersionId: root.versionId,
      frozenSnapshot: frozenSnapshot as unknown as Prisma.InputJsonValue,
      dishTitleSnapshot: dishTitle,
      expiresAt: input.expiresAt ?? null,
      showCreatorName: input.showCreatorName,
    },
  });
  return { shareLinkId: shareLink.id, url: buildShareToken(tokenId) };
}

async function getOwnedShareLinkOrThrow(ownerId: string, shareLinkId: string) {
  const shareLink = await prisma.shareLink.findFirst({
    where: { id: shareLinkId, ownerId },
  });
  if (!shareLink) throw new NotFoundError("Share link not found.");
  return shareLink;
}

export async function getShareLinkUrl(
  ownerId: string,
  shareLinkId: string,
): Promise<string> {
  const shareLink = await getOwnedShareLinkOrThrow(ownerId, shareLinkId);
  return buildShareUrl(shareLink.tokenId);
}

export async function revokeShareLink(
  ownerId: string,
  shareLinkId: string,
): Promise<void> {
  await getOwnedShareLinkOrThrow(ownerId, shareLinkId);
  await prisma.shareLink.update({
    where: { id: shareLinkId },
    data: { revokedAt: new Date() },
  });
}

/**
 * PRODUCT_SPEC.md §83.2: regenerating invalidates the replaced token. A
 * fresh `tokenId` alone does this — the old `tokenId` simply stops being
 * findable at lookup time, no separate revocation flag needed for the old
 * value (Build Plan's Slice 16 entry, "not because its old signature stops
 * verifying").
 *
 * If the link was already past its expiration, regenerating also clears
 * `expiresAt` — otherwise the freshly issued token would be dead on
 * arrival, which defeats the point of the owner replacing an expired link
 * with a working one.
 */
export async function regenerateShareLink(
  ownerId: string,
  shareLinkId: string,
): Promise<string> {
  const shareLink = await getOwnedShareLinkOrThrow(ownerId, shareLinkId);
  const tokenId = generateTokenId();
  const wasExpired =
    shareLink.expiresAt !== null && shareLink.expiresAt.getTime() < Date.now();
  await prisma.shareLink.update({
    where: { id: shareLink.id },
    data: { tokenId, ...(wasExpired ? { expiresAt: null } : {}) },
  });
  return buildShareUrl(tokenId);
}

export async function updateShareLinkSettings(
  ownerId: string,
  input: UpdateShareLinkInput,
): Promise<void> {
  await getOwnedShareLinkOrThrow(ownerId, input.shareLinkId);
  await prisma.shareLink.update({
    where: { id: input.shareLinkId },
    data: {
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.showCreatorName !== undefined
        ? { showCreatorName: input.showCreatorName }
        : {}),
    },
  });
}

export async function listOwnedShareLinks(ownerId: string) {
  return prisma.shareLink.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });
}

export type ResolvedPublicShare = {
  shareLinkId: string;
  mode: "FIXED_SNAPSHOT" | "CURRENT";
  content: PublicShareContent;
  creatorName: string | null;
};

/** Public, unauthenticated resolution — no session-based authorization at
 * all (intentional, PRODUCT_SPEC.md §83.1), only token verification and the
 * revoked/expired checks. */
export async function resolvePublicShare(
  token: string,
): Promise<ResolvedPublicShare> {
  const tokenId = parseShareToken(token);
  if (!tokenId) throw new NotFoundError("This share link is invalid.");

  const shareLink = await prisma.shareLink.findUnique({
    where: { tokenId },
    include: { owner: { select: { name: true } } },
  });
  if (!shareLink || shareLink.revokedAt) {
    throw new NotFoundError("This share link is no longer available.");
  }
  if (shareLink.expiresAt && shareLink.expiresAt.getTime() < Date.now()) {
    throw new NotFoundError("This share link has expired.");
  }

  const creatorName = shareLink.showCreatorName ? shareLink.owner.name : null;

  if (shareLink.mode === "FIXED_SNAPSHOT") {
    const snapshot = shareLink.frozenSnapshot as unknown as FrozenSnapshot;
    return {
      shareLinkId: shareLink.id,
      mode: "FIXED_SNAPSHOT",
      content: snapshot.content,
      creatorName,
    };
  }

  if (!shareLink.currentDishId) {
    throw new NotFoundError("This share link is no longer available.");
  }
  const dish = await prisma.dish.findUnique({
    where: { id: shareLink.currentDishId },
    select: { currentVersionId: true },
  });
  if (!dish || !dish.currentVersionId) {
    throw new NotFoundError("This item has no content to show yet.");
  }
  const graph = await buildShareGraph(
    shareLink.currentDishId,
    dish.currentVersionId,
  );
  const content = await buildPublicShareContent(graph);
  return { shareLinkId: shareLink.id, mode: "CURRENT", content, creatorName };
}

/**
 * Slice 16, Gate 7 §2.5/§2.8: authorizes the public image route's
 * share-token branch — an active, unrevoked, unexpired ShareLink whose
 * (frozen or live-current) content actually reaches `imageAssetId`.
 */
export async function isImageAssetVisibleViaShareLink(
  token: string,
  imageAssetId: string,
): Promise<boolean> {
  const tokenId = parseShareToken(token);
  if (!tokenId) return false;

  const shareLink = await prisma.shareLink.findUnique({ where: { tokenId } });
  if (!shareLink || shareLink.revokedAt) return false;
  if (shareLink.expiresAt && shareLink.expiresAt.getTime() < Date.now()) {
    return false;
  }

  if (shareLink.mode === "FIXED_SNAPSHOT") {
    const snapshot = shareLink.frozenSnapshot as unknown as FrozenSnapshot;
    return snapshot.imageAssetIds.includes(imageAssetId);
  }

  if (!shareLink.currentDishId) return false;
  const dish = await prisma.dish.findUnique({
    where: { id: shareLink.currentDishId },
    select: { currentVersionId: true },
  });
  if (!dish || !dish.currentVersionId) return false;
  const graph = await buildShareGraph(
    shareLink.currentDishId,
    dish.currentVersionId,
  );
  return collectGraphImageAssetIds(graph).includes(imageAssetId);
}

/**
 * Correction pass: three distinct outcomes, not two — Gate 7 §2.8's "one
 * recipient may accept a given share only once" is a fact about the
 * ACCEPTANCE, independent of whether the resulting copy still exists.
 * - `"created"` / `"already_accepted"`: a usable copy exists (freshly made,
 *   or the recipient's own earlier one) — `dishId`/`dishKind` are set.
 * - `"previously_accepted_copy_deleted"`: this recipient already accepted
 *   this exact share, but later deleted their copy — Gate 7's one-time rule
 *   still applies, so this is deliberately **not** a fresh acceptance; no
 *   new copy is created, and the caller must not offer a Save action.
 */
export type SaveSharedCopyResult =
  | {
      outcome: "created" | "already_accepted";
      dishId: string;
      dishKind: DishKindValue;
    }
  | { outcome: "previously_accepted_copy_deleted" };

/**
 * PRODUCT_SPEC.md §84.1/§84.2, Gate 7 §2.8: one durable idempotent
 * acceptance per recipient per share link — `ShareLinkAcceptance`'s
 * `@@unique([shareLinkId, recipientId])` is the authoritative guard. A
 * concurrent double-submit loses the unique-constraint race, its whole
 * transaction (including every copied Dish/DishVersion row) rolls back, and
 * this simply re-queries and returns the winner's copy — never a partial
 * graph, never two independent copies for the same acceptance.
 */
export async function saveSharedCopy(
  recipientId: string,
  token: string,
): Promise<SaveSharedCopyResult> {
  const tokenId = parseShareToken(token);
  if (!tokenId) throw new NotFoundError("This share link is invalid.");

  const shareLink = await prisma.shareLink.findUnique({ where: { tokenId } });
  if (!shareLink || shareLink.revokedAt) {
    throw new NotFoundError("This share link is no longer available.");
  }
  if (shareLink.expiresAt && shareLink.expiresAt.getTime() < Date.now()) {
    throw new NotFoundError("This share link has expired.");
  }

  const existing = await prisma.shareLinkAcceptance.findUnique({
    where: {
      shareLinkId_recipientId: { shareLinkId: shareLink.id, recipientId },
    },
    include: { createdDish: { select: { kind: true } } },
  });
  if (existing) {
    // `createdDishId` (and the relation) are null once the recipient
    // deletes their own copy (`onDelete: SetNull`) — the acceptance row
    // itself survives on purpose (see the model's own doc comment,
    // schema.prisma) so this branch can truthfully refuse a second copy.
    if (!existing.createdDishId || !existing.createdDish) {
      return { outcome: "previously_accepted_copy_deleted" };
    }
    return {
      outcome: "already_accepted",
      dishId: existing.createdDishId,
      dishKind: existing.createdDish.kind,
    };
  }

  let rootDishId: string;
  let rootVersionId: string;
  if (shareLink.mode === "CURRENT") {
    if (!shareLink.currentDishId) {
      throw new NotFoundError("This share link is no longer available.");
    }
    const dish = await prisma.dish.findUnique({
      where: { id: shareLink.currentDishId },
      select: { currentVersionId: true },
    });
    if (!dish || !dish.currentVersionId) {
      throw new NotFoundError("This item has no content to save.");
    }
    rootDishId = shareLink.currentDishId;
    rootVersionId = dish.currentVersionId;
  } else {
    if (!shareLink.fixedDishId || !shareLink.fixedDishVersionId) {
      throw new NotFoundError("This share link is no longer available.");
    }
    rootDishId = shareLink.fixedDishId;
    rootVersionId = shareLink.fixedDishVersionId;
  }

  const graph = await buildShareGraph(rootDishId, rootVersionId);

  try {
    // The copy and the idempotency record must commit together: if a
    // concurrent duplicate request wins the unique-constraint race on
    // ShareLinkAcceptance, this entire transaction (including every copied
    // Dish/DishVersion row) rolls back — never an untracked orphan copy.
    return await prisma.$transaction(async (tx) => {
      const copy = await createIndependentCopyFromGraph(tx, recipientId, graph);
      await tx.shareLinkAcceptance.create({
        data: {
          shareLinkId: shareLink.id,
          recipientId,
          createdDishId: copy.dishId,
        },
      });
      return { outcome: "created" as const, ...copy };
    });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
    // Lost the idempotency race — another concurrent request already
    // created (and recorded) the acceptance. Re-query and return it. (The
    // winner's copy cannot already be deleted — it was just created in the
    // transaction that won this exact race.)
    const winner = await prisma.shareLinkAcceptance.findUnique({
      where: {
        shareLinkId_recipientId: { shareLinkId: shareLink.id, recipientId },
      },
      include: { createdDish: { select: { kind: true } } },
    });
    if (!winner || !winner.createdDishId || !winner.createdDish) {
      throw new ConflictError(
        "This share could not be saved. Please try again.",
      );
    }
    return {
      outcome: "already_accepted",
      dishId: winner.createdDishId,
      dishKind: winner.createdDish.kind,
    };
  }
}

// ============================================================================
// Slice 17: Direct account-to-account sharing.
// Gate 7 §2.4/§2.10: reuses the exact same `buildShareGraph` +
// `createIndependentCopyFromGraph` engine Slice 16 built — no second copy
// architecture.
//
// Correction pass: a `DirectShare` is a genuinely frozen delivery, not a
// pinned-Version pointer re-read live. `sendDirectShare` resolves the
// complete shareable content graph exactly once and stores it
// (`DirectShare.frozenGraph`, `graph.ts`'s `serializeShareGraph`) — Preview
// and Accept both consume that stored graph, never `buildShareGraph` against
// the live `dishId`/`dishVersionId` again. This closes a real gap the
// pinned-Version-only design left open: DishFrame permits several
// Version-owned fields (description, image, yield, prep/cook time,
// difficulty, nutrition — PRODUCT_SPEC.md §13.2a's "no new Version" mutable-
// metadata category) to be edited in place on the *same* DishVersion row, so
// re-reading by id after Send could silently diverge from what the sender
// actually sent. `dishId`/`dishVersionId` remain on the row for provenance
// and the existing deletion-cancellation match
// (`revokeSharesAndCancelPendingShares`) — no longer for content resolution.
// ============================================================================

/**
 * PRODUCT_SPEC.md §85's "exact recipient lookup mechanism belongs in
 * implementation and privacy review" — settled here: exact, normalized
 * email match only (never a partial/prefix query), authenticated callers
 * only, at most one result (email is unique), and only the minimum fields
 * needed to identify the intended recipient (`id`/`name` — never
 * `emailVerified`, `image`, `createdAt`, or any other profile/account
 * field). The caller's own account is excluded so self-share never even
 * offers a match.
 */
export async function lookupDirectShareRecipient(
  requesterId: string,
  email: string,
): Promise<{ id: string; name: string } | null> {
  return prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      id: { not: requesterId },
    },
    select: { id: true, name: true },
  });
}

const DUPLICATE_PENDING_MESSAGE =
  "You already have a pending share of this item to that person.";

/**
 * Correction pass: the friendly pre-check below stays (fast, clear message
 * for the ordinary non-concurrent case), but the actual "at most one" rule
 * is now also enforced at the database boundary —
 * `one_pending_direct_share_per_sender_recipient_dish`, a partial unique
 * index over `(senderId, recipientId, dishId) WHERE status = 'PENDING'`
 * (migration `20260805010000_slice17_correction_frozen_delivery`). Two
 * genuinely concurrent sends can both pass the pre-check's `findFirst`
 * before either commits; the index then lets exactly one `directShare.create`
 * succeed and rejects the other with a `P2002` violation, caught below and
 * mapped to the same deterministic duplicate-pending error rather than a raw
 * database error reaching the caller.
 */
export async function sendDirectShare(
  senderId: string,
  input: SendDirectShareInput,
): Promise<{ directShareId: string }> {
  const dish = await getOwnedDishOrThrow(senderId, input.dishId);
  if (!dish.currentVersionId) {
    throw new NotFoundError("This item has no saved content to share yet.");
  }

  const recipient = await prisma.user.findFirst({
    where: { email: { equals: input.recipientEmail, mode: "insensitive" } },
    select: { id: true },
  });
  if (!recipient) {
    throw new NotFoundError("No DishFrame account found for that email.");
  }
  if (recipient.id === senderId) {
    throw new ValidationError("You can't send a share to yourself.");
  }

  const existingPending = await prisma.directShare.findFirst({
    where: {
      senderId,
      recipientId: recipient.id,
      dishId: dish.id,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (existingPending) {
    throw new ConflictError(DUPLICATE_PENDING_MESSAGE);
  }

  // Freeze the complete shareable content graph now — this is the exact
  // content Preview and Accept will use, regardless of any later edit to
  // the source (material, in-place metadata, or nested Part).
  const graph = await buildShareGraph(dish.id, dish.currentVersionId);
  const frozenGraph = serializeShareGraph(graph);
  const frozenImageAssetIds = collectGraphImageAssetIds(graph);

  try {
    const directShare = await prisma.directShare.create({
      data: {
        senderId,
        recipientId: recipient.id,
        recipientLookup: input.recipientEmail,
        dishId: dish.id,
        dishVersionId: dish.currentVersionId,
        dishTitleSnapshot: dish.currentTitle ?? "Untitled",
        note: input.note && input.note.length > 0 ? input.note : null,
        frozenGraph: frozenGraph as unknown as Prisma.InputJsonValue,
        frozenImageAssetIds,
      },
    });
    return { directShareId: directShare.id };
  } catch (error) {
    if (isDuplicatePendingDirectShareViolation(error)) {
      throw new ConflictError(DUPLICATE_PENDING_MESSAGE);
    }
    throw error;
  }
}

/** Cancelling an already-terminal share is a safe no-op — never overwrites
 * ACCEPTED/DECLINED back to CANCELED. */
export async function cancelDirectShare(
  senderId: string,
  directShareId: string,
): Promise<void> {
  const share = await prisma.directShare.findFirst({
    where: { id: directShareId, senderId },
  });
  if (!share) throw new NotFoundError("Direct share not found.");
  if (share.status !== "PENDING") return;
  await prisma.directShare.updateMany({
    where: { id: directShareId, senderId, status: "PENDING" },
    data: { status: "CANCELED" },
  });
}

export type DeclineDirectShareResult =
  | { outcome: "declined" }
  | { outcome: "not_actionable"; status: DirectShareStatusValue };

export async function declineDirectShare(
  recipientId: string,
  directShareId: string,
): Promise<DeclineDirectShareResult> {
  const share = await prisma.directShare.findFirst({
    where: { id: directShareId, recipientId },
  });
  if (!share) throw new NotFoundError("Direct share not found.");
  if (share.status === "DECLINED") return { outcome: "declined" };
  if (share.status !== "PENDING") {
    return { outcome: "not_actionable", status: share.status };
  }
  await prisma.directShare.updateMany({
    where: { id: directShareId, recipientId, status: "PENDING" },
    data: { status: "DECLINED" },
  });
  const resolved = await prisma.directShare.findUniqueOrThrow({
    where: { id: directShareId },
  });
  return resolved.status === "DECLINED"
    ? { outcome: "declined" }
    : { outcome: "not_actionable", status: resolved.status };
}

export type AcceptDirectShareResult =
  | { outcome: "accepted"; dishId: string; dishKind: DishKindValue }
  | { outcome: "accepted_copy_deleted" }
  | { outcome: "not_actionable"; status: DirectShareStatusValue };

/**
 * Gate 7 §2.8's "only once" invariant, applied to `DirectShare` directly
 * (per docs/GATE_7_ARCHITECTURE_REVIEW.md's Slice 17 note: "do not reuse
 * ShareLinkAcceptance blindly if the direct-share state model already
 * provides the required one-time invariant") — a `DirectShare` is already
 * one row per delivery, so the conditional `status: "PENDING"` guard on the
 * transition update IS the guard, no separate acceptance table needed.
 * Postgres row-level locking on the `UPDATE ... WHERE status = 'PENDING'`
 * serializes concurrent accepts: the loser's same statement re-evaluates
 * the WHERE clause against the winner's already-committed row and affects
 * zero rows, so it never reaches `createIndependentCopyFromGraph` — no
 * partial or duplicate graph is possible.
 */
export async function acceptDirectShare(
  recipientId: string,
  directShareId: string,
): Promise<AcceptDirectShareResult> {
  const share = await prisma.directShare.findFirst({
    where: { id: directShareId, recipientId },
  });
  if (!share) throw new NotFoundError("Direct share not found.");

  if (share.status === "ACCEPTED") {
    return resolveAcceptedDirectShare(share.createdDishId);
  }
  if (share.status !== "PENDING") {
    return { outcome: "not_actionable", status: share.status };
  }
  if (!share.frozenGraph) {
    throw new NotFoundError("This shared item is no longer available.");
  }

  // The frozen graph captured at Send time — never a live re-read of
  // `dishId`/`dishVersionId` (see module doc comment above). Permanent
  // source deletion still blocks acceptance: it cancels this row's
  // `status` in the same transaction (`revokeSharesAndCancelPendingShares`),
  // which the `status !== "PENDING"` check above already catches — a
  // stored graph is never, by itself, permission to accept.
  const graph = deserializeShareGraph(share.frozenGraph);

  const result = await prisma.$transaction(async (tx) => {
    const transition = await tx.directShare.updateMany({
      where: { id: directShareId, recipientId, status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    if (transition.count === 0) return null;

    const copy = await createIndependentCopyFromGraph(tx, recipientId, graph);
    await tx.directShare.update({
      where: { id: directShareId },
      data: { createdDishId: copy.dishId },
    });
    return { outcome: "accepted" as const, ...copy };
  });
  if (result) return result;

  // Lost the transition race to a concurrent accept — resolve the winner's
  // truthful state rather than creating a second copy.
  const resolved = await prisma.directShare.findUniqueOrThrow({
    where: { id: directShareId },
  });
  if (resolved.status === "ACCEPTED") {
    return resolveAcceptedDirectShare(resolved.createdDishId);
  }
  return { outcome: "not_actionable", status: resolved.status };
}

async function resolveAcceptedDirectShare(
  createdDishId: string | null,
): Promise<AcceptDirectShareResult> {
  if (!createdDishId) return { outcome: "accepted_copy_deleted" };
  const dish = await prisma.dish.findUnique({
    where: { id: createdDishId },
    select: { kind: true },
  });
  if (!dish) return { outcome: "accepted_copy_deleted" };
  return { outcome: "accepted", dishId: createdDishId, dishKind: dish.kind };
}

export type SentDirectShareSummary = {
  id: string;
  dishId: string | null;
  dishKind: DishKindValue | null;
  dishTitleSnapshot: string;
  recipientName: string | null;
  recipientLookup: string;
  hasJoined: boolean;
  note: string | null;
  status: DirectShareStatusValue;
  createdAt: Date;
};

export async function listSentDirectShares(
  senderId: string,
): Promise<SentDirectShareSummary[]> {
  // Slice 22: excludes grouped Recipe-collection children (`collectionId`
  // set) — those are listed separately by
  // `sharing/collections.ts`'s `listSentDirectShareCollections`. This list
  // stays scoped to ungrouped rows: ordinary Part sends (unaffected by this
  // slice) and any pre-Slice-22 Recipe sends.
  const rows = await prisma.directShare.findMany({
    where: { senderId, collectionId: null },
    orderBy: { createdAt: "desc" },
    include: {
      recipient: { select: { name: true } },
      dishVersion: { select: { dish: { select: { kind: true } } } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    dishId: row.dishId,
    dishKind: row.dishVersion?.dish.kind ?? null,
    dishTitleSnapshot: row.dishTitleSnapshot,
    recipientName: row.recipient?.name ?? null,
    recipientLookup: row.recipientLookup,
    hasJoined: row.recipientId !== null,
    note: row.note,
    status: row.status,
    createdAt: row.createdAt,
  }));
}

export type ReceivedDirectShareSummary = {
  id: string;
  dishId: string | null;
  dishKind: DishKindValue | null;
  dishTitleSnapshot: string;
  senderName: string;
  note: string | null;
  status: DirectShareStatusValue;
  createdAt: Date;
  createdDishId: string | null;
};

export async function listReceivedDirectShares(
  recipientId: string,
): Promise<ReceivedDirectShareSummary[]> {
  // Slice 22: same `collectionId: null` scoping as listSentDirectShares
  // above — grouped children are listed separately.
  const rows = await prisma.directShare.findMany({
    where: { recipientId, collectionId: null },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { name: true } },
      dishVersion: { select: { dish: { select: { kind: true } } } },
      createdDish: { select: { kind: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    dishId: row.dishId,
    dishKind: row.dishVersion?.dish.kind ?? row.createdDish?.kind ?? null,
    dishTitleSnapshot: row.dishTitleSnapshot,
    senderName: row.sender.name,
    note: row.note,
    status: row.status,
    createdAt: row.createdAt,
    createdDishId: row.createdDishId,
  }));
}

export type DirectSharePreview = {
  content: PublicShareContent;
  senderName: string;
  note: string | null;
  status: DirectShareStatusValue;
};

/**
 * Gate 7 §2.2's public-data whitelist, reused as-is for the recipient's
 * privacy-safe preview — same `buildPublicShareContent` DTO a public share
 * link renders, never a raw Dish/DishVersion serialization. Either party
 * (sender or the intended recipient) may call this; nobody else can
 * (`AuthorizationError`), and a signed-out caller never reaches this
 * function at all (the action layer requires a session first).
 *
 * Hardening pass: scoped to `PENDING` only — once terminal, an `ACCEPTED`
 * recipient has their own independent copy to view instead, and
 * `DECLINED`/`CANCELED` have released any claim on the frozen content.
 */
export async function getDirectSharePreview(
  requesterId: string,
  directShareId: string,
): Promise<DirectSharePreview> {
  const share = await prisma.directShare.findUnique({
    where: { id: directShareId },
    include: { sender: { select: { name: true } } },
  });
  if (!share) throw new NotFoundError("Direct share not found.");
  if (share.senderId !== requesterId && share.recipientId !== requesterId) {
    throw new AuthorizationError("You do not have access to this share.");
  }
  if (share.status !== "PENDING") {
    throw new NotFoundError("This shared item is no longer available.");
  }
  if (!share.frozenGraph) {
    throw new NotFoundError("This shared item is no longer available.");
  }
  // Renders through the same whitelist DTO a public ShareLink page uses,
  // but derived from the frozen graph rather than a live re-read — later
  // source edits (material, in-place metadata, or nested Part) never
  // change what Preview shows.
  const graph = deserializeShareGraph(share.frozenGraph);
  const content = await buildPublicShareContent(graph);
  return {
    content,
    senderName: share.sender.name,
    note: share.note,
    status: share.status,
  };
}

/**
 * Session-based counterpart to `isImageAssetVisibleViaShareLink` — a direct
 * share is never a public/unauthenticated surface, so authorization is
 * "the caller is the sender or the intended recipient of this exact
 * DirectShare," not a signed token. Checks the frozen
 * `frozenImageAssetIds` denormalization directly (no graph rebuild, no live
 * DB walk) — the same reason `ShareLink.frozenSnapshot` stores its own
 * `imageAssetIds` alongside the content, and correctly reflects what was
 * actually sent even after the source image is later replaced.
 *
 * Hardening pass: scoped to `PENDING` only, matching
 * `getDirectSharePreview`'s and `deleteImageAssetIfOrphaned`'s retention
 * scope — an `ACCEPTED` copy's image is authorized via ordinary owned-Dish
 * access instead (`/api/images/[assetId]`'s default branch).
 */
export async function isImageAssetVisibleViaDirectShare(
  userId: string,
  directShareId: string,
  imageAssetId: string,
): Promise<boolean> {
  const share = await prisma.directShare.findUnique({
    where: { id: directShareId },
  });
  if (!share) return false;
  if (share.senderId !== userId && share.recipientId !== userId) return false;
  if (share.status !== "PENDING") return false;
  return share.frozenImageAssetIds.includes(imageAssetId);
}
