import { describe, expect, it } from "vitest";

describe("(cook) layout metadata", () => {
  it("is noindex, nofollow for the full-bleed cooking session shell", async () => {
    const { metadata } = await import("./layout");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
