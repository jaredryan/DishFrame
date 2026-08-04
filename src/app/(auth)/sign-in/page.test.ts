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

/**
 * Slice 16, PRODUCT_SPEC.md §84.1: a logged-out share viewer is redirected
 * to sign in with `?redirectTo=/s/{token}` and back afterward — the target
 * must be validated as a same-origin relative path first, or a malicious
 * `redirectTo` could send a signed-in user off-site (open redirect).
 */
describe("sign-in page redirectTo handling", () => {
  async function renderWithParams(
    params: Record<string, string | string[] | undefined>,
  ) {
    const { default: SignInPage } = await import("./page");
    return SignInPage({ searchParams: Promise.resolve(params) });
  }

  it("passes a legitimate relative redirectTo through to SignInCard", async () => {
    const element = await renderWithParams({ redirectTo: "/s/abc123" });
    expect(element.props.callbackURL).toBe("/s/abc123");
  });

  it("falls back to /home for an absolute or scheme-relative redirectTo", async () => {
    for (const malicious of [
      "https://evil.example/phish",
      "//evil.example/phish",
      "javascript:alert(1)",
    ]) {
      const element = await renderWithParams({ redirectTo: malicious });
      expect(element.props.callbackURL).toBe("/home");
    }
  });

  it("falls back to /home when redirectTo is absent", async () => {
    const element = await renderWithParams({});
    expect(element.props.callbackURL).toBe("/home");
  });
});
