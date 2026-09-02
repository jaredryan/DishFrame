import "server-only";
import { headers } from "next/headers";
import { auth, SESSION_FRESH_AGE_SECONDS, type Session } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AuthorizationError } from "@/lib/errors";
import {
  deleteImageAssetIfOrphaned,
  bestEffortDeleteBlob,
} from "@/lib/images/service";

/**
 * `auth.ts`'s `session.freshAge` (PRODUCT_SPEC.md §91 — "recent
 * authentication or reauthentication where practical"), verified against
 * the installed better-auth version's own `freshSessionMiddleware`: it
 * compares `Date.now()` against `session.createdAt` — never `updatedAt`,
 * which Better Auth bumps on ordinary activity (`session.updateAge`) and
 * this module separately surfaces as "last active" display data
 * (`AuthSessionSummary.lastActiveAt`, below) — so routine activity must
 * never silently re-extend this window.
 *
 * `listSessions` enforces `freshAge` itself natively
 * (`freshSessionMiddleware`); `deleteAccount` has no Better-Auth-native gate
 * of its own (it bypasses Better Auth's `deleteUser` flow entirely, see
 * `deleteAccount` below), so this same imported constant — not an
 * independently hardcoded duration — is applied by hand for that one
 * operation, guaranteeing both stay in sync by construction.
 */
export function isSessionFresh(session: Session): boolean {
  return (
    Date.now() - session.session.createdAt.getTime() <
    SESSION_FRESH_AGE_SECONDS * 1000
  );
}

/** Coarse, best-effort label from a raw User-Agent string — ARCHITECTURE_PROPOSAL.md
 * §89 only asks for an approximate device/browser description, never the raw
 * string verbatim (and never a token), so precision beyond "Chrome on macOS"
 * isn't worth a dependency. */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /CriOS\//.test(userAgent)
        ? "Chrome"
        : /FxiOS\//.test(userAgent)
          ? "Firefox"
          : /Chrome\//.test(userAgent)
            ? "Chrome"
            : /Firefox\//.test(userAgent)
              ? "Firefox"
              : /Safari\//.test(userAgent) && /Version\//.test(userAgent)
                ? "Safari"
                : "Browser";

  const os = /iPhone|iPad|iPod/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;

  return os ? `${browser} on ${os}` : browser;
}

export type AuthSessionSummary = {
  id: string;
  isCurrent: boolean;
  description: string;
  createdAt: string;
  lastActiveAt: string;
};

// Reads `Session` directly rather than via Better Auth's `listSessions`
// endpoint, which bakes in `freshSessionMiddleware` and would force
// reauthentication just to view this read-only list (§89). Row id only,
// never the raw token.
export async function listAuthSessionsForDisplay(
  session: Session,
): Promise<AuthSessionSummary[]> {
  const rows = await prisma.session.findMany({
    where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    isCurrent: row.id === session.session.id,
    description: describeUserAgent(row.userAgent ?? null),
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.updatedAt.toISOString(),
  }));
}

/** Resolves `sessionId` to its token server-side only — the client never
 * sees or sends a raw session token (§89). Scoped by `requesterId` before
 * Better Auth's own ownership check runs (defense in depth, Arch §K.6). */
export async function revokeAuthSession(
  requesterId: string,
  sessionId: string,
): Promise<void> {
  const target = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { token: true, userId: true },
  });
  if (!target || target.userId !== requesterId) {
    throw new AuthorizationError("That session isn't available to revoke.");
  }
  await auth.api.revokeSession({
    headers: await headers(),
    body: { token: target.token },
  });
}

export async function revokeOtherAuthSessions(): Promise<void> {
  await auth.api.revokeOtherSessions({ headers: await headers() });
}

/**
 * Every distinct ImageAsset this account's own Versions reference, plus
 * every ImageAsset this account ever uploaded (even one never attached to
 * any saved Version — ordinarily left for the scheduled
 * `cleanupAbandonedImageAssets` sweep, `images/service.ts`, but account
 * deletion is a natural point to also do a full one-time sweep immediately
 * rather than wait for that job, in scope for PRODUCT_SPEC.md §91's
 * "images" bullet). Gathered before
 * the cascade below removes this account's own DishVersion rows —
 * `deleteImageAssetIfOrphaned`'s reference count needs a candidate list,
 * not a live query against rows that no longer exist.
 */
async function collectAccountImageAssetIds(ownerId: string): Promise<string[]> {
  const [versionRows, uploadedRows] = await Promise.all([
    prisma.dishVersion.findMany({
      where: { dish: { ownerId }, imageAssetId: { not: null } },
      select: { imageAssetId: true },
      distinct: ["imageAssetId"],
    }),
    prisma.imageAsset.findMany({
      where: { uploadedByUserId: ownerId },
      select: { id: true },
    }),
  ]);
  const ids = new Set<string>();
  for (const row of versionRows) {
    if (row.imageAssetId) ids.add(row.imageAssetId);
  }
  for (const row of uploadedRows) {
    ids.add(row.id);
  }
  return [...ids];
}

/**
 * PRODUCT_SPEC.md §91, ARCHITECTURE_PROPOSAL.md §I/§J "Account deletion":
 * a hybrid delete — Postgres `ON DELETE CASCADE` from `User` removes every
 * owned aggregate (Dishes/Versions, Cooking Sessions, Reviews, Tasters,
 * ratings, grocery lists, Meal Plans, preferences, and — critically,
 * unlike a single Dish's deletion — a genuine hard delete of every
 * ShareLink/DirectShare this account *sent*, not a soft revoke/cancel,
 * §H.1 point 6) once the `User` row itself is deleted; an explicit
 * compensating step (image cleanup, below) handles the one thing Postgres
 * cannot cascade into: external Blob storage.
 *
 * Two raw-SQL `Restrict` foreign keys would otherwise block the cascade if
 * left alone, so both are cleared first, in the same transaction, exactly
 * as `src/test/factories.ts`'s `deleteTestUser` already does for the first
 * one in test teardown:
 * - `PartLink.targetVersion` (a Part in use can only normally be removed
 *   through the deliberate two-phase `deletePart` flow, ARCHITECTURE_PROPOSAL.md
 *   §J) — account deletion isn't that flow; every PartLink targeting one of
 *   this account's own Part Versions is deleted outright (its containing
 *   Version is being destroyed in the same operation regardless).
 * - `GroceryList.linkedMealPlan` (Arch §I's Meal-Plan-deletion Restrict,
 *   §D — a list can only lose its live link via an explicit `STANDALONE`
 *   conversion) — every one of this account's own linked lists is
 *   converted the same way, immediately before the account itself goes.
 *
 * Other accounts' independent copies are untouched: `Dish.sourceDishId`
 * is `onDelete: SetNull` (provenance strings survive, no live join),
 * `ShareLinkAcceptance`/`DirectShare.createdDishId` are `SetNull` (already
 * proven durable against a *copy's* deletion in Slices 16/17 — this is the
 * same guarantee, just triggered by the *source* account's deletion), and
 * `ImageAsset.uploadedByUserId` is `SetNull` (an asset another account's
 * Version still references survives the reference-count check below,
 * §D.2a).
 */
export async function deleteAccount(userId: string): Promise<void> {
  const candidateImageAssetIds = await collectAccountImageAssetIds(userId);

  const orphanedStorageKeys = await prisma.$transaction(async (tx) => {
    await tx.partLink.deleteMany({
      where: { targetVersion: { dish: { ownerId: userId } } },
    });
    await tx.groceryList.updateMany({
      where: { ownerId: userId, linkedMealPlanId: { not: null } },
      data: { mode: "STANDALONE", linkedMealPlanId: null },
    });

    // A DirectShare this account only *received* survives the cascade below
    // (`recipientId` is SetNull, not Cascade) and must not stay actionable-
    // looking to the sender forever. Same terminalization the ordinary
    // Dish-deletion path already uses (`revokeSharesAndCancelPendingShares`,
    // dishes/service.ts) — CANCELED, PENDING-only, before the User row goes
    // so this can still filter by recipientId. Also releases this share's
    // `deleteImageAssetIfOrphaned` pending-retention protection (images/
    // service.ts), same as that existing path.
    await tx.directShare.updateMany({
      where: { recipientId: userId, status: "PENDING" },
      data: { status: "CANCELED" },
    });

    await tx.user.delete({ where: { id: userId } });

    const keys: string[] = [];
    for (const imageAssetId of candidateImageAssetIds) {
      const storageKey = await deleteImageAssetIfOrphaned(tx, imageAssetId);
      if (storageKey) keys.push(storageKey);
    }
    return keys;
  });

  // Best-effort, after-commit external side effect (Arch §I) — never
  // allowed to roll back the already-committed deletion above.
  await Promise.all(
    orphanedStorageKeys.map((key) => bestEffortDeleteBlob(key)),
  );
}
