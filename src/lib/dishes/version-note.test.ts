import { describe, it, expect } from "vitest";
import {
  seedMajorVersionNote,
  normalizeVersionNote,
} from "@/lib/dishes/version-note";

describe("seedMajorVersionNote", () => {
  it("seeds 'Revision' wording for an ordinary bump from the current line", () => {
    expect(seedMajorVersionNote(2, 0, 3, true)).toBe("V2.0 → V3.0: Revision");
  });

  it("seeds 'Revival' wording for a major created from a historical direction", () => {
    expect(seedMajorVersionNote(1, 4, 3, false)).toBe("V1.4 → V3.0: Revival");
  });

  it("handles multi-digit version segments without decimal confusion", () => {
    expect(seedMajorVersionNote(1, 10, 11, true)).toBe(
      "V1.10 → V11.0: Revision",
    );
  });
});

describe("normalizeVersionNote", () => {
  it("strips the trailing colon from a bare generated relationship stamp", () => {
    expect(normalizeVersionNote("V1.0 → V2.0:")).toBe("V1.0 → V2.0");
  });

  it("trims surrounding whitespace before checking the generated-prefix shape", () => {
    expect(normalizeVersionNote("  V1.0 → V2.0:  ")).toBe("V1.0 → V2.0");
  });

  it("leaves a fully-authored generated note (with its Revision/Revival suffix) untouched", () => {
    expect(normalizeVersionNote("V1.0 → V2.0: Revision")).toBe(
      "V1.0 → V2.0: Revision",
    );
  });

  it("does not strip a colon that is part of ordinary authored prose", () => {
    expect(normalizeVersionNote("Note: tried a substitution here.")).toBe(
      "Note: tried a substitution here.",
    );
  });

  it("does not strip a colon from prose that happens to start with a version-looking label", () => {
    expect(normalizeVersionNote("V1.0 → V2.0: swapped the sauce base")).toBe(
      "V1.0 → V2.0: swapped the sauce base",
    );
  });

  it("returns null for blank or whitespace-only input", () => {
    expect(normalizeVersionNote(null)).toBeNull();
    expect(normalizeVersionNote("   ")).toBeNull();
  });
});
