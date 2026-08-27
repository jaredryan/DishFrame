import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { versionLabel } from "@/lib/dishes/version-note";
import { decimalToNumber } from "@/lib/dishes/format";
import type { PrimaryRatingDisplayValue } from "@/lib/preferences/schema";

/**
 * Session Review + Rating reads (PRODUCT_SPEC.md §31-42, §48-49).
 * Ownership guard pattern matches `cooking/queries.ts`'s
 * `getOwnedSessionOrThrow` (ARCHITECTURE_PROPOSAL.md §K.6).
 */

// Wrapped in React's `cache()`: the Session Review page's `generateMetadata`
// and page component both call this with identical args in one request.
export const getOwnedSessionForReview = cache(
  async function getOwnedSessionForReview(ownerId: string, sessionId: string) {
    const session = await prisma.cookingSession.findFirst({
      where: { id: sessionId, ownerId },
      include: {
        units: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            label: true,
            removedAt: true,
            completedAt: true,
            checklistItems: {
              select: {
                id: true,
                kind: true,
                displayText: true,
                checkedAt: true,
              },
            },
          },
        },
        review: true,
        ratings: {
          include: {
            taster: { select: { id: true, name: true, archivedAt: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundError("Cooking Session not found.");

    const dish = await prisma.dish.findFirst({
      where: { id: session.dishId },
      select: {
        id: true,
        kind: true,
        currentTitle: true,
        currentVersionId: true,
        stage: true,
      },
    });

    return { session, dish };
  },
);
export type OwnedSessionForReview = Awaited<
  ReturnType<typeof getOwnedSessionForReview>
>;

/**
 * Active Tasters in the user's own display order (§34.4a), plus any
 * archived Taster already rated on this session — an editable Review must
 * keep showing (and allow removing) an existing rating from a since-
 * archived Taster (§34.5: "preserves historical ratings"), even though
 * archived Tasters are hidden from ordinary new selection (§34.5).
 */
export async function listReviewTasterOptions(
  ownerId: string,
  sessionId: string,
) {
  const [active, ratedTasterIds] = await Promise.all([
    prisma.taster.findMany({
      where: { ownerId, archivedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, isOwner: true },
    }),
    prisma.rating.findMany({
      where: { sessionId },
      select: { tasterId: true },
    }),
  ]);

  const activeIds = new Set(active.map((t) => t.id));
  const extraArchivedIds = [
    ...new Set(
      ratedTasterIds.map((r) => r.tasterId).filter((id) => !activeIds.has(id)),
    ),
  ];
  const archived = extraArchivedIds.length
    ? await prisma.taster.findMany({
        where: { id: { in: extraArchivedIds }, ownerId },
        select: { id: true, name: true, isOwner: true },
      })
    : [];

  return [...active, ...archived];
}

export type EditorSessionEvidence = {
  sessionId: string;
  dishId: string;
  outcome: "COMPLETED" | "ENDED_EARLY";
  endedAt: Date | null;
  cookedVersionLabel: string;
  cookingNotes: string | null;
  review: {
    whatWentWell: string | null;
    whatDidNotGoWell: string | null;
    anythingElse: string | null;
    actualAmountQuantity: number | null;
    actualAmountUnit: string | null;
    reviewAdjustedDurationSeconds: number | null;
  } | null;
  ratings: Array<{ tasterName: string; isOwner: boolean; value: number }>;
};

/**
 * PRODUCT_SPEC.md §39.4/§39.5 — the evidence bundle the editor's evidence
 * Sheet shows when opened from a Cooking Session or Review's "Edit
 * Recipe"/"Edit Part" action. Returns null for an in-progress session (a
 * Review isn't available yet, §33.1) or one the owner doesn't own.
 */
export async function getSessionEvidenceForEditor(
  ownerId: string,
  sessionId: string,
): Promise<EditorSessionEvidence | null> {
  const session = await prisma.cookingSession.findFirst({
    where: { id: sessionId, ownerId },
    select: {
      id: true,
      dishId: true,
      dishVersionId: true,
      state: true,
      endedAt: true,
      cookingNotes: true,
      review: true,
      ratings: {
        select: {
          value: true,
          taster: { select: { name: true, isOwner: true } },
        },
      },
    },
  });
  if (!session || session.state === "IN_PROGRESS") return null;

  const version = await prisma.dishVersion.findFirst({
    where: { id: session.dishVersionId },
    select: { majorVersion: true, minorVersion: true },
  });

  return {
    sessionId: session.id,
    dishId: session.dishId,
    outcome: session.state as "COMPLETED" | "ENDED_EARLY",
    endedAt: session.endedAt,
    cookedVersionLabel: version
      ? versionLabel(version.majorVersion, version.minorVersion)
      : "—",
    cookingNotes: session.cookingNotes,
    review: session.review
      ? {
          whatWentWell: session.review.whatWentWell,
          whatDidNotGoWell: session.review.whatDidNotGoWell,
          anythingElse: session.review.anythingElse,
          actualAmountQuantity: decimalToNumber(
            session.review.actualAmountQuantity,
          ),
          actualAmountUnit: session.review.actualAmountUnit,
          reviewAdjustedDurationSeconds:
            session.review.reviewAdjustedDurationSeconds,
        }
      : null,
    ratings: session.ratings.map((r) => ({
      tasterName: r.taster.name,
      isOwner: r.taster.isOwner,
      value: r.value,
    })),
  };
}

// ============================================================================
// Rating aggregates — computed at read time (ARCHITECTURE_PROPOSAL.md §I:
// "this proposal recommends computing rating summaries at read time... not
// maintaining denormalized running totals"). At personal/family data
// volumes, fetching every Rating row for a Dish and reducing in JS is fast,
// simple, and always correct by construction.
// ============================================================================

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export type RatingSummary = {
  allTimeAverage: number | null;
  ratingCount: number;
  ratedSessionCount: number;
  distinctTasterCount: number;
  min: number | null;
  max: number | null;
  currentVersionGroupAverage: number | null;
  currentVersionRatingCount: number;
  ownerCurrentVersionAverage: number | null;
  ownerCurrentVersionRatingCount: number;
  ownerLatestRating: {
    value: number;
    dishVersionId: string;
    versionLabel: string;
  } | null;
  latestRatedSessionAverage: number | null;
  perTaster: Array<{
    tasterId: string;
    name: string;
    average: number;
    count: number;
  }>;
  historyByVersion: Array<{
    dishVersionId: string;
    versionLabel: string;
    average: number;
    count: number;
  }>;
};

const ratingRowSelect = {
  id: true,
  value: true,
  sessionId: true,
  dishId: true,
  dishVersionId: true,
  tasterId: true,
  createdAt: true,
  taster: { select: { id: true, name: true, isOwner: true } },
  dishVersion: { select: { id: true, majorVersion: true, minorVersion: true } },
  session: { select: { endedAt: true, startedAt: true, state: true } },
} as const;

type RawRatingRow = {
  id: string;
  value: number;
  sessionId: string;
  dishId: string | null;
  dishVersionId: string | null;
  tasterId: string;
  createdAt: Date;
  taster: { id: string; name: string; isOwner: boolean };
  dishVersion: {
    id: string;
    majorVersion: number;
    minorVersion: number;
  } | null;
  session: { endedAt: Date | null; startedAt: Date; state: string };
};

// `toRatingRow` below narrows `dishVersionId` to non-null (filtering out the
// rows it returns null for), so `RatingRow` derives from `RawRatingRow`
// rather than redeclaring the same shape with `dishVersionId` left nullable.
type RatingRow = Omit<RawRatingRow, "dishId" | "dishVersionId"> & {
  dishVersionId: string;
};

// Round-3 Correction 11: dishVersionId (and dishId, for the Tier-2 nested-
// Part rating path) is SET NULL if a rated item is later deleted — not
// reachable in Tier 1, since `dishId` here always equals the still-alive
// Dish being queried, but filtered defensively rather than assumed
// impossible.
function toRatingRow(r: RawRatingRow): RatingRow | null {
  if (r.dishVersionId == null) return null;
  return { ...r, dishVersionId: r.dishVersionId };
}

/** Fetches every Rating row belonging to a Dish, owner-scoped through the
 * caller's own prior `getOwnedDishOrThrow` (a `dishId` only ever reaches
 * here once ownership is already established). */
async function fetchDishRatings(dishId: string): Promise<RatingRow[]> {
  const rows = await prisma.rating.findMany({
    where: { dishId },
    orderBy: { createdAt: "desc" },
    select: ratingRowSelect,
  });
  return rows.map(toRatingRow).filter((r): r is RatingRow => r != null);
}

export function computeRatingSummary(
  ratings: RatingRow[],
  currentVersionId: string | null,
): RatingSummary {
  const values = ratings.map((r) => r.value);
  const currentVersionRatings = ratings.filter(
    (r) => r.dishVersionId === currentVersionId,
  );
  const ownerRatings = ratings.filter((r) => r.taster.isOwner);
  const ownerCurrentVersionRatings = ownerRatings.filter(
    (r) => r.dishVersionId === currentVersionId,
  );

  const perTasterMap = new Map<string, { name: string; values: number[] }>();
  for (const r of ratings) {
    const entry = perTasterMap.get(r.tasterId) ?? {
      name: r.taster.name,
      values: [],
    };
    entry.values.push(r.value);
    perTasterMap.set(r.tasterId, entry);
  }

  const historyMap = new Map<
    string,
    { majorVersion: number; minorVersion: number; values: number[] }
  >();
  for (const r of ratings) {
    if (!r.dishVersion) continue;
    const entry = historyMap.get(r.dishVersionId) ?? {
      majorVersion: r.dishVersion.majorVersion,
      minorVersion: r.dishVersion.minorVersion,
      values: [],
    };
    entry.values.push(r.value);
    historyMap.set(r.dishVersionId, entry);
  }

  const sessionGroups = new Map<
    string,
    { values: number[]; endedAt: Date | null; startedAt: Date; state: string }
  >();
  for (const r of ratings) {
    const entry = sessionGroups.get(r.sessionId) ?? {
      values: [],
      endedAt: r.session.endedAt,
      startedAt: r.session.startedAt,
      state: r.session.state,
    };
    entry.values.push(r.value);
    sessionGroups.set(r.sessionId, entry);
  }
  let latestRatedSessionAverage: number | null = null;
  let latestSessionTime = -Infinity;
  for (const entry of sessionGroups.values()) {
    const time = (entry.endedAt ?? entry.startedAt).getTime();
    if (time > latestSessionTime) {
      latestSessionTime = time;
      latestRatedSessionAverage = average(entry.values);
    }
  }

  const ownerLatest = ownerRatings[0]; // already ordered desc by createdAt
  const ownerLatestRating = ownerLatest
    ? {
        value: ownerLatest.value,
        dishVersionId: ownerLatest.dishVersionId,
        versionLabel: ownerLatest.dishVersion
          ? versionLabel(
              ownerLatest.dishVersion.majorVersion,
              ownerLatest.dishVersion.minorVersion,
            )
          : "—",
      }
    : null;

  return {
    allTimeAverage: average(values),
    ratingCount: ratings.length,
    ratedSessionCount: sessionGroups.size,
    distinctTasterCount: perTasterMap.size,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    currentVersionGroupAverage: average(
      currentVersionRatings.map((r) => r.value),
    ),
    currentVersionRatingCount: currentVersionRatings.length,
    ownerCurrentVersionAverage: average(
      ownerCurrentVersionRatings.map((r) => r.value),
    ),
    ownerCurrentVersionRatingCount: ownerCurrentVersionRatings.length,
    ownerLatestRating,
    latestRatedSessionAverage,
    perTaster: [...perTasterMap.entries()]
      .map(([tasterId, entry]) => ({
        tasterId,
        name: entry.name,
        average: average(entry.values)!,
        count: entry.values.length,
      }))
      .sort((a, b) => b.count - a.count),
    historyByVersion: [...historyMap.entries()]
      .sort(([, a], [, b]) =>
        a.majorVersion !== b.majorVersion
          ? b.majorVersion - a.majorVersion
          : b.minorVersion - a.minorVersion,
      )
      .map(([dishVersionId, entry]) => ({
        dishVersionId,
        versionLabel: versionLabel(entry.majorVersion, entry.minorVersion),
        average: average(entry.values)!,
        count: entry.values.length,
      })),
  };
}

export async function getRatingSummary(
  dishId: string,
  currentVersionId: string | null,
): Promise<RatingSummary> {
  const ratings = await fetchDishRatings(dishId);
  return computeRatingSummary(ratings, currentVersionId);
}

export type PrincipalRating =
  | { kind: "none" }
  | { kind: "actual"; value: number; count: number }
  | {
      kind: "provisional";
      value: number;
      source:
        | { type: "previous-version"; versionLabel: string }
        | {
            type: "duplicate-source";
            title: string;
            versionLabel: string;
            count: number | null;
          };
    };

/**
 * PRODUCT_SPEC.md §36.5/§48.4/§49.3: the one restrained value a card/header
 * shows. Honors the user's Group-average-vs-Your-rating preference (§49.1)
 * for both the actual and provisional cases, then falls back through the
 * provisional evidence hierarchy — most relevant previous rated Version,
 * then a duplicated source snapshot — never both.
 */
export function computePrincipalRating(
  summary: RatingSummary,
  currentVersionId: string | null,
  preference: PrimaryRatingDisplayValue,
  duplicateSource: {
    sourceKind: string;
    sourceAggregateRating: number | null;
    sourceRatingCount: number | null;
    sourceTitle: string | null;
    sourceDishVersionLabel: string | null;
  },
): PrincipalRating {
  if (preference === "YOUR_RATING") {
    if (
      summary.ownerCurrentVersionAverage != null &&
      currentVersionId != null
    ) {
      return {
        kind: "actual",
        value: summary.ownerCurrentVersionAverage,
        count: summary.ownerCurrentVersionRatingCount,
      };
    }
    if (
      summary.ownerLatestRating &&
      summary.ownerLatestRating.dishVersionId !== currentVersionId
    ) {
      return {
        kind: "provisional",
        value: summary.ownerLatestRating.value,
        source: {
          type: "previous-version",
          versionLabel: summary.ownerLatestRating.versionLabel,
        },
      };
    }
  } else {
    if (summary.currentVersionGroupAverage != null) {
      return {
        kind: "actual",
        value: summary.currentVersionGroupAverage,
        count: summary.currentVersionRatingCount,
      };
    }
    const previousVersion = summary.historyByVersion.find(
      (v) => v.dishVersionId !== currentVersionId,
    );
    if (previousVersion) {
      return {
        kind: "provisional",
        value: previousVersion.average,
        source: {
          type: "previous-version",
          versionLabel: previousVersion.versionLabel,
        },
      };
    }
  }

  if (
    summary.ratingCount === 0 &&
    duplicateSource.sourceKind === "DUPLICATE" &&
    duplicateSource.sourceAggregateRating != null
  ) {
    return {
      kind: "provisional",
      value: duplicateSource.sourceAggregateRating,
      source: {
        type: "duplicate-source",
        title: duplicateSource.sourceTitle ?? "the source item",
        versionLabel: duplicateSource.sourceDishVersionLabel ?? "—",
        count: duplicateSource.sourceRatingCount,
      },
    };
  }

  return { kind: "none" };
}

/**
 * Batched sibling of `computePrincipalRating` for a library grid/list — one
 * query for every card's ratings instead of N round trips.
 */
export async function getPrincipalRatingsForDishes(
  dishes: Array<{
    id: string;
    currentVersionId: string | null;
    sourceKind: string;
    sourceAggregateRating: number | null;
    sourceRatingCount: number | null;
    sourceTitle: string | null;
    sourceDishVersionLabel: string | null;
  }>,
  preference: PrimaryRatingDisplayValue,
): Promise<Map<string, PrincipalRating>> {
  if (dishes.length === 0) return new Map();

  const rows = await prisma.rating.findMany({
    where: { dishId: { in: dishes.map((d) => d.id) } },
    orderBy: { createdAt: "desc" },
    select: ratingRowSelect,
  });

  const byDish = new Map<string, RatingRow[]>();
  for (const raw of rows) {
    const row = toRatingRow(raw);
    if (row == null || raw.dishId == null) continue;
    const list = byDish.get(raw.dishId) ?? [];
    list.push(row);
    byDish.set(raw.dishId, list);
  }

  const result = new Map<string, PrincipalRating>();
  for (const dish of dishes) {
    const summary = computeRatingSummary(
      byDish.get(dish.id) ?? [],
      dish.currentVersionId,
    );
    result.set(
      dish.id,
      computePrincipalRating(summary, dish.currentVersionId, preference, dish),
    );
  }
  return result;
}

/** Duplication-time snapshot (PRODUCT_SPEC.md §19.1) — captured once, does
 * not drift with the source's later evidence (§19.2). */
export async function getDuplicationRatingSnapshot(dishId: string) {
  const [ratingAgg, sessionCount] = await Promise.all([
    prisma.rating.aggregate({
      where: { dishId },
      _avg: { value: true },
      _count: true,
    }),
    prisma.cookingSession.count({
      where: { dishId, state: { in: ["COMPLETED", "ENDED_EARLY"] } },
    }),
  ]);
  return {
    aggregateRating:
      ratingAgg._avg.value != null ? Number(ratingAgg._avg.value) : null,
    ratingCount: ratingAgg._count > 0 ? ratingAgg._count : null,
    sessionCount: sessionCount > 0 ? sessionCount : null,
  };
}
