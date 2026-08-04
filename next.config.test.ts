import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config security headers", () => {
  it("disables the X-Powered-By header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sets a conservative baseline of security headers on every route", async () => {
    expect(nextConfig.headers).toBeDefined();
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source === "/:path*");
    const keys = rule?.headers.map((h) => h.key) ?? [];

    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );

    const byKey = Object.fromEntries(
      (rule?.headers ?? []).map((h) => [h.key, h.value]),
    );
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("does not set an enforcing Content-Security-Policy", async () => {
    const rules = await nextConfig.headers!();
    const allKeys = rules.flatMap((r) => r.headers.map((h) => h.key));
    expect(allKeys).not.toContain("Content-Security-Policy");
  });

  /**
   * Slice 16 correction pass: the public share token lives in the URL path
   * (`/s/[token]`), not a cookie — a same-origin `Referer` header on
   * outbound navigation from that page would otherwise carry it into
   * DishFrame's own access logs (the site-wide
   * `strict-origin-when-cross-origin` default already strips it for
   * cross-origin destinations, but still sends the full URL same-origin).
   */
  it("sends no Referer at all from the public share route", async () => {
    const rules = await nextConfig.headers!();
    const shareRule = rules.find((r) => r.source === "/s/:token*");
    expect(shareRule).toBeDefined();
    const byKey = Object.fromEntries(
      (shareRule?.headers ?? []).map((h) => [h.key, h.value]),
    );
    expect(byKey["Referrer-Policy"]).toBe("no-referrer");
  });
});
