import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getServerSession: vi.fn(),
}));

describe("(app) layout metadata", () => {
  it("is noindex, nofollow for the whole protected app shell", async () => {
    const { metadata } = await import("./layout");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
