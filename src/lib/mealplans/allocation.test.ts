import { describe, it, expect } from "vitest";
import { remainingServings } from "@/lib/mealplans/allocation";

describe("remainingServings", () => {
  it("is null when the Meal has no target yield to cap against", () => {
    expect(remainingServings(null, 3)).toBeNull();
  });

  it("is the target yield minus what's already scheduled", () => {
    expect(remainingServings(6, 2)).toBe(4);
  });

  it("never goes negative", () => {
    expect(remainingServings(6, 9)).toBe(0);
  });
});
