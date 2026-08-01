import { describe, it, expect } from "vitest";
import {
  rankMealPlanRecommendations,
  type RecommendationCandidate,
} from "@/lib/mealplans/recommendations";

const NOW = new Date("2026-08-01T00:00:00.000Z");

function candidate(
  overrides: Partial<RecommendationCandidate> = {},
): RecommendationCandidate {
  return {
    dishId: "dish-1",
    title: "Untitled",
    stage: "ACTIVE",
    lastCookedAt: null,
    ratingValue: null,
    isFavorite: false,
    flavorProfiles: [],
    ...overrides,
  };
}

describe("rankMealPlanRecommendations", () => {
  it("orders by Stage priority: Active, Proven, Experimental, Idea (§80.1)", () => {
    const result = rankMealPlanRecommendations(
      [
        candidate({ dishId: "idea", stage: "IDEA", title: "Idea Dish" }),
        candidate({ dishId: "proven", stage: "PROVEN", title: "Proven Dish" }),
        candidate({
          dishId: "experimental",
          stage: "EXPERIMENTAL",
          title: "Experimental Dish",
        }),
        candidate({ dishId: "active", stage: "ACTIVE", title: "Active Dish" }),
      ],
      { includeExperimental: true, includeIdea: true },
      NOW,
    );
    expect(result.map((r) => r.dishId)).toEqual([
      "active",
      "proven",
      "experimental",
      "idea",
    ]);
  });

  it("excludes Archived by default, and Experimental/Idea unless explicitly included", () => {
    const candidates = [
      candidate({ dishId: "archived", stage: "ARCHIVED" }),
      candidate({ dishId: "experimental", stage: "EXPERIMENTAL" }),
      candidate({ dishId: "idea", stage: "IDEA" }),
      candidate({ dishId: "active", stage: "ACTIVE" }),
    ];
    const result = rankMealPlanRecommendations(candidates, {}, NOW);
    expect(result.map((r) => r.dishId)).toEqual(["active"]);
  });

  it("within a Stage, ranks least-recently-cooked first, never-cooked as oldest", () => {
    const result = rankMealPlanRecommendations(
      [
        candidate({
          dishId: "cooked-recent",
          lastCookedAt: new Date("2026-07-30T00:00:00.000Z"),
        }),
        candidate({ dishId: "never-cooked", lastCookedAt: null }),
        candidate({
          dishId: "cooked-old",
          lastCookedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      ],
      {},
      NOW,
    );
    expect(result.map((r) => r.dishId)).toEqual([
      "never-cooked",
      "cooked-old",
      "cooked-recent",
    ]);
  });

  it("Favorite never overrides Stage — an Experimental Favorite does not outrank an Active non-favorite (§80.3)", () => {
    const result = rankMealPlanRecommendations(
      [
        candidate({
          dishId: "experimental-favorite",
          stage: "EXPERIMENTAL",
          isFavorite: true,
        }),
        candidate({
          dishId: "active-plain",
          stage: "ACTIVE",
          isFavorite: false,
        }),
      ],
      { includeExperimental: true },
      NOW,
    );
    expect(result.map((r) => r.dishId)).toEqual([
      "active-plain",
      "experimental-favorite",
    ]);
  });

  it("Favorite breaks ties within the same Stage/recency", () => {
    const result = rankMealPlanRecommendations(
      [
        candidate({ dishId: "plain", isFavorite: false }),
        candidate({ dishId: "favorite", isFavorite: true }),
      ],
      {},
      NOW,
    );
    expect(result.map((r) => r.dishId)).toEqual(["favorite", "plain"]);
  });

  it("favoritesOnly filters to Favorite candidates explicitly", () => {
    const result = rankMealPlanRecommendations(
      [
        candidate({ dishId: "plain", isFavorite: false }),
        candidate({ dishId: "favorite", isFavorite: true }),
      ],
      { favoritesOnly: true },
      NOW,
    );
    expect(result.map((r) => r.dishId)).toEqual(["favorite"]);
  });

  it("builds the §80.2 explanation format: Stage · recency · rating · Flavor profiles", () => {
    const result = rankMealPlanRecommendations(
      [
        candidate({
          dishId: "dish-1",
          stage: "ACTIVE",
          lastCookedAt: new Date("2026-07-04T00:00:00.000Z"),
          ratingValue: 4.7,
          flavorProfiles: ["Sweet", "Spicy", "Tangy"],
        }),
      ],
      {},
      NOW,
    );
    expect(result[0].explanation).toBe(
      "Active · not cooked in 28 days · 4.7/5 · Sweet + Spicy",
    );
  });

  it("omits rating and Flavor profiles from the explanation when absent", () => {
    const result = rankMealPlanRecommendations(
      [candidate({ dishId: "dish-1", stage: "PROVEN", lastCookedAt: null })],
      {},
      NOW,
    );
    expect(result[0].explanation).toBe("Proven · never cooked");
  });
});
