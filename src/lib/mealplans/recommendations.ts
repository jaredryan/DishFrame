import type { StageValue } from "@/lib/dishes/schema";

/**
 * Meal Plan recommendation ranking (PRODUCT_SPEC.md §80) — pure, DB-free
 * (Build Plan Slice 15's "implemented as a pure, unit-tested function"),
 * mirroring `dishes/library-filters.ts`'s existing precedent of keeping
 * ranking logic independent of the Prisma query that gathers candidates.
 */

export type RecommendationCandidate = {
  dishId: string;
  title: string;
  stage: StageValue;
  /** Most recent COMPLETED session's `endedAt` across this Recipe, or null
   * if never cooked (`cooking/queries.ts#getLastCookedAtForDishes`). */
  lastCookedAt: Date | null;
  /** The account's principal rating (§36 "primary rating"), out of 5, or
   * null when there is none yet. */
  ratingValue: number | null;
  isFavorite: boolean;
  /** Display names, in the account's own saved order. */
  flavorProfiles: string[];
};

export type RecommendationFilters = {
  /** §80.1: Experimental only ranks in "when development or variety is
   * desired" — an explicit opt-in, not a default inclusion. */
  includeExperimental?: boolean;
  /** §80.1: Idea only ranks "through deliberate exploration." */
  includeIdea?: boolean;
  /** §80.3: Favorite may be filtered explicitly. */
  favoritesOnly?: boolean;
};

export type Recommendation = {
  dishId: string;
  title: string;
  stage: StageValue;
  /** §80.2's explanation string, e.g. "Active · not cooked in 28 days ·
   * 4.7/5 · Sweet + Spicy". */
  explanation: string;
};

// §80.1's literal priority order. Archived is excluded by default and never
// appears in this map's candidate pool at all (filtered out unconditionally
// below, since nothing in §80 offers to opt back into it).
const STAGE_PRIORITY: Record<StageValue, number> = {
  ACTIVE: 0,
  PROVEN: 1,
  EXPERIMENTAL: 2,
  IDEA: 3,
  ARCHIVED: 4,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function stageLabel(stage: StageValue): string {
  return stage.charAt(0) + stage.slice(1).toLowerCase();
}

function recencyLabel(lastCookedAt: Date | null, now: Date): string {
  if (lastCookedAt == null) return "never cooked";
  const days = Math.max(
    0,
    Math.floor((now.getTime() - lastCookedAt.getTime()) / DAY_MS),
  );
  if (days === 0) return "cooked today";
  if (days === 1) return "not cooked in 1 day";
  return `not cooked in ${days} days`;
}

/** §80.2's explanation order: Stage; recency; rating; one or two Flavor
 * profiles. */
function buildExplanation(
  candidate: RecommendationCandidate,
  now: Date,
): string {
  const parts = [
    stageLabel(candidate.stage),
    recencyLabel(candidate.lastCookedAt, now),
  ];
  if (candidate.ratingValue != null) {
    parts.push(`${candidate.ratingValue.toFixed(1)}/5`);
  }
  if (candidate.flavorProfiles.length > 0) {
    parts.push(candidate.flavorProfiles.slice(0, 2).join(" + "));
  }
  return parts.join(" · ");
}

/**
 * Ranks and explains recommendation candidates per §80.1/§80.2. Priority
 * group (Stage) is always decided first; recency, Favorite, rating, and
 * title are tie-breakers *within* a Stage group only — §80.3's "Favorite
 * does not override Stage" falls directly out of that ordering (Favorite is
 * never compared before Stage).
 */
export function rankMealPlanRecommendations(
  candidates: RecommendationCandidate[],
  filters: RecommendationFilters = {},
  now: Date = new Date(),
): Recommendation[] {
  let pool = candidates.filter((c) => c.stage !== "ARCHIVED");
  if (!filters.includeExperimental) {
    pool = pool.filter((c) => c.stage !== "EXPERIMENTAL");
  }
  if (!filters.includeIdea) {
    pool = pool.filter((c) => c.stage !== "IDEA");
  }
  if (filters.favoritesOnly) {
    pool = pool.filter((c) => c.isFavorite);
  }

  const sorted = [...pool].sort((a, b) => {
    const stageDiff = STAGE_PRIORITY[a.stage] - STAGE_PRIORITY[b.stage];
    if (stageDiff !== 0) return stageDiff;

    // §80.1: "least recently cooked first" — never-cooked sorts as oldest.
    const aTime = a.lastCookedAt?.getTime() ?? -Infinity;
    const bTime = b.lastCookedAt?.getTime() ?? -Infinity;
    if (aTime !== bTime) return aTime - bTime;

    // §80.3: Favorite breaks ties (only reached once Stage and recency are
    // already equal — it never overrides either).
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;

    const aRating = a.ratingValue ?? -1;
    const bRating = b.ratingValue ?? -1;
    if (aRating !== bRating) return bRating - aRating;

    return a.title.localeCompare(b.title);
  });

  return sorted.map((candidate) => ({
    dishId: candidate.dishId,
    title: candidate.title,
    stage: candidate.stage,
    explanation: buildExplanation(candidate, now),
  }));
}
