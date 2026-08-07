import { describe, expect, it } from "vitest";
import { APP_NAV_ITEMS } from "./nav-items";

// Slice 21 structural audit: Meal Plans, Grocery Lists, and Share were
// completed features with no primary-nav entry, reachable only by direct
// URL or an onboarding-guide replay. Regression coverage for that fix —
// not a general "does the array have items" test.
describe("APP_NAV_ITEMS", () => {
  it("includes every completed major product surface", () => {
    const hrefs = APP_NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toEqual([
      "/home",
      "/recipes",
      "/parts",
      "/cook",
      "/meal-plans",
      "/grocery-lists",
      "/share",
      "/settings",
      "/help",
    ]);
  });
});
