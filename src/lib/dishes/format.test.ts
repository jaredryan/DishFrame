import { describe, expect, it } from "vitest";
import { formatYieldAmount } from "@/lib/dishes/format";

describe("formatYieldAmount", () => {
  it("uses singular 'serving' for a quantity of 1 with no authored unit", () => {
    expect(formatYieldAmount(1)).toBe("1 serving");
  });

  it("uses plural 'servings' for any other quantity with no authored unit", () => {
    expect(formatYieldAmount(2)).toBe("2 servings");
    expect(formatYieldAmount(0)).toBe("0 servings");
  });

  it("shows an authored unit as-is, regardless of quantity", () => {
    expect(formatYieldAmount(1, "cup")).toBe("1 cup");
    expect(formatYieldAmount(2, "cups")).toBe("2 cups");
  });
});
