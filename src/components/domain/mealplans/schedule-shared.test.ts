import { describe, it, expect } from "vitest";
import {
  formatServings,
  groupScheduleByDate,
} from "@/components/domain/mealplans/schedule-shared";

describe("formatServings", () => {
  it("uses singular for exactly 1 serving", () => {
    expect(formatServings(1)).toBe("1 serving");
  });

  it("uses plural for 0 and for more than 1", () => {
    expect(formatServings(0)).toBe("0 servings");
    expect(formatServings(2)).toBe("2 servings");
  });
});

// §4/§5/§10 — Create/Edit/Details all group the same underlying
// scheduled-meal data by date this way.
describe("groupScheduleByDate", () => {
  it("groups by date and orders groups earliest → latest, regardless of input order", () => {
    const groups = groupScheduleByDate([
      { dateIso: "2026-09-02", id: "b" },
      { dateIso: "2026-09-01", id: "a1" },
      { dateIso: "2026-09-01", id: "a2" },
    ]);

    expect(groups.map((g) => g.dateIso)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a1", "a2"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b"]);
  });

  it("preserves each date's existing item order (user-defined within a day)", () => {
    const groups = groupScheduleByDate([
      { dateIso: "2026-09-01", id: "dinner" },
      { dateIso: "2026-09-01", id: "breakfast" },
      { dateIso: "2026-09-01", id: "lunch" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual([
      "dinner",
      "breakfast",
      "lunch",
    ]);
  });

  it("returns an empty list for no items", () => {
    expect(groupScheduleByDate([])).toEqual([]);
  });
});
