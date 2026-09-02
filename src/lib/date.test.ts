import { describe, it, expect } from "vitest";
import { formatDateOnly, parseTypedDateInput } from "@/lib/date";

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

// Meal Plan QA redesign §1 — backs `DatePickerField`'s directly-typeable
// text field.
describe("parseTypedDateInput", () => {
  it("accepts an ISO yyyy-mm-dd string", () => {
    expect(parseTypedDateInput("2026-09-01")).toBe("2026-09-01");
  });

  it("accepts US-style m/d/yyyy, zero-padded or not", () => {
    expect(parseTypedDateInput("9/1/2026")).toBe("2026-09-01");
    expect(parseTypedDateInput("09/01/2026")).toBe("2026-09-01");
  });

  it("rejects a non-existent calendar date rather than rolling it forward", () => {
    expect(parseTypedDateInput("2/30/2026")).toBeNull();
  });

  it("rejects an out-of-range month or day", () => {
    expect(parseTypedDateInput("13/1/2026")).toBeNull();
    expect(parseTypedDateInput("1/32/2026")).toBeNull();
  });

  it("rejects unparsable text", () => {
    expect(parseTypedDateInput("next Tuesday")).toBeNull();
    expect(parseTypedDateInput("")).toBeNull();
  });
});
