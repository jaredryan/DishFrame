import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  isGoogleAuthConfigured: false,
}));

describe("sign-in page metadata", () => {
  it("is noindex, nofollow", async () => {
    const { metadata } = await import("./page");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("uses the locked sign-in title and description", async () => {
    const { metadata } = await import("./page");
    expect(metadata.title).toBe("Sign in");
    expect(metadata.description).toBe(
      "Sign in to access your DishFrame recipes, reusable parts, and cooking history.",
    );
  });
});
