import { describe, it, expect } from "vitest";
import { formatDateOnly } from "@/lib/date";

describe("formatDateOnly", () => {
  it("displays the selected calendar day, not the viewer-timezone-shifted one", () => {
    // UTC midnight of Aug 26 — the exact value a bare "2026-08-26" end date
    // is stored as. Built via Date.UTC so this assertion doesn't depend on
    // the test runner's own timezone.
    const endDate = new Date(Date.UTC(2026, 7, 26));
    const label = formatDateOnly(endDate, { month: "short", day: "numeric" });
    expect(label).toBe("Aug 26");
  });

  it("reads an ISO date-only string the same way", () => {
    expect(
      formatDateOnly("2026-08-26T00:00:00.000Z", {
        month: "short",
        day: "numeric",
      }),
    ).toBe("Aug 26");
  });
});
