import { describe, expect, it } from "vitest";

describe("(share) layout metadata", () => {
  it("is noindex, nofollow for public token-based share pages", async () => {
    const { metadata } = await import("./layout");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
