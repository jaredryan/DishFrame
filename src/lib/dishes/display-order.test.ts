import { describe, expect, it } from "vitest";
import { orderSectionsAndTopLevelPartLinks } from "@/lib/dishes/display-order";

// Sections and top-level PartLinks share one interleaved persisted
// `position` sequence (schema.prisma's `Section.position` comment) — this
// is the one shared merge every read-only Section/PartLink renderer
// (current-Version detail, Version History, print/public share) reuses
// rather than each re-implementing its own sort.
describe("orderSectionsAndTopLevelPartLinks", () => {
  it("interleaves Sections and PartLinks by position, not by which array each came from", () => {
    const result = orderSectionsAndTopLevelPartLinks(
      [
        { position: 2, value: "section-last" },
        { position: 0, value: "section-first" },
      ],
      [{ position: 1, value: "partLink-middle" }],
    );

    expect(
      result.map((item) =>
        item.type === "section" ? item.section : item.partLink,
      ),
    ).toEqual(["section-first", "partLink-middle", "section-last"]);
    expect(result.map((item) => item.type)).toEqual([
      "section",
      "partLink",
      "section",
    ]);
  });

  it("returns an empty list when both inputs are empty", () => {
    expect(orderSectionsAndTopLevelPartLinks([], [])).toEqual([]);
  });
});
