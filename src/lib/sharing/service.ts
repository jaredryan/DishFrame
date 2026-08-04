import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import { createIndependentCopyFromGraph } from "@/lib/dishes/service";
import type { DishKindValue } from "@/lib/dishes/schema";
import {
  generateTokenId,
  buildShareToken,
  parseShareToken,
} from "@/lib/sharing/tokens";
import {
  buildShareGraph,
  collectGraphImageAssetIds,
} from "@/lib/sharing/graph";
import {
  buildPublicShareContent,
  collectPublicContentImageAssetIds,
  type PublicShareContent,
} from "@/lib/sharing/public-dto";
import type {
  CreateShareLinkInput,
  UpdateShareLinkInput,
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
  return buildShareToken(shareLink.tokenId);
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
 */
export async function regenerateShareLink(
  ownerId: string,
  shareLinkId: string,
): Promise<string> {
  const shareLink = await getOwnedShareLinkOrThrow(ownerId, shareLinkId);
  const tokenId = generateTokenId();
  await prisma.shareLink.update({
    where: { id: shareLink.id },
    data: { tokenId },
  });
  return buildShareToken(tokenId);
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
