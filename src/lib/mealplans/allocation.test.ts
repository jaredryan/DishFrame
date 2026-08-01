import { describe, it, expect } from "vitest";
import { computeAllocationStatus } from "@/lib/mealplans/allocation";

describe("computeAllocationStatus", () => {
  it("is unknown when the entry has no target yield to compare against", () => {
    expect(computeAllocationStatus(null, [{ servings: 3 }])).toBe("unknown");
  });

  it("is balanced when allocations exactly match the target yield", () => {
    expect(
      computeAllocationStatus(6, [
        { servings: 1 },
        { servings: 1 },
        { servings: 4 },
      ]),
    ).toBe("balanced");
  });

  it("is under when allocations leave yield unallocated (§77.2)", () => {
    expect(computeAllocationStatus(6, [{ servings: 2 }])).toBe("under");
  });

  it("is over when allocations exceed expected yield (§77.2)", () => {
    expect(computeAllocationStatus(6, [{ servings: 4 }, { servings: 4 }])).toBe(
      "over",
    );
  });

  it("treats no planned meals as fully unallocated", () => {
    expect(computeAllocationStatus(6, [])).toBe("under");
  });
});
