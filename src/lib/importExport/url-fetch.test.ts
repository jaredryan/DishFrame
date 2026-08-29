import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHtmlSafely } from "@/lib/importExport/url-fetch";

/**
 * Website import's SSRF-sensitive fetch boundary (url-fetch.ts). These
 * tests never make a live network call — `global.fetch` and
 * `node:dns/promises`'s `lookup` are always mocked, matching the same
 * "no live requests in automated tests" discipline as fdc-client.test.ts.
 */

const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({
  default: { lookup: (...args: unknown[]) => lookupMock(...args) },
}));

function jsonHeaders(headers: Record<string, string>) {
  return {
    get: (key: string) => headers[key.toLowerCase()] ?? null,
  };
}

function htmlResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: jsonHeaders({ "content-type": "text/html; charset=utf-8" }),
    body: null,
    text: async () => body,
  } as unknown as Response;
}

function redirectResponse(location: string) {
  return {
    ok: false,
    status: 302,
    headers: jsonHeaders({ location }),
    body: null,
    text: async () => "",
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  lookupMock.mockReset();
});

describe("fetchHtmlSafely", () => {
  it("rejects a non-http(s) protocol", async () => {
    const result = await fetchHtmlSafely("ftp://example.com/recipe");
    expect(result.ok).toBe(false);
  });

  it("rejects a loopback IP literal", async () => {
    const result = await fetchHtmlSafely("http://127.0.0.1/recipe");
    expect(result.ok).toBe(false);
  });

  it("rejects a private-range IP literal", async () => {
    const result = await fetchHtmlSafely("http://192.168.1.5/recipe");
    expect(result.ok).toBe(false);
  });

  it("rejects the AWS/GCP metadata link-local address", async () => {
    const result = await fetchHtmlSafely("http://169.254.169.254/latest");
    expect(result.ok).toBe(false);
  });

  it("rejects a hostname that resolves to a private address", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    const result = await fetchHtmlSafely("http://internal.example.com/recipe");
    expect(result.ok).toBe(false);
  });

  it("fetches and returns HTML for a hostname resolving to a public address", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => htmlResponse("<html>recipe</html>")),
    );
    const result = await fetchHtmlSafely("http://example.com/recipe");
    expect(result).toEqual({ ok: true, html: "<html>recipe</html>" });
  });

  it("follows a redirect to another public address", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://example.com/final"))
      .mockResolvedValueOnce(htmlResponse("<html>final</html>"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchHtmlSafely("http://example.com/recipe");
    expect(result).toEqual({ ok: true, html: "<html>final</html>" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("blocks a redirect that resolves to a private address", async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.9", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        redirectResponse("http://internal.example.com/final"),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchHtmlSafely("http://example.com/recipe");
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a response larger than the size cap", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const oversized = "x".repeat(4 * 1024 * 1024);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => htmlResponse(oversized)),
    );
    const result = await fetchHtmlSafely("http://example.com/recipe");
    expect(result.ok).toBe(false);
  });

  it("rejects a non-HTML content type", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: jsonHeaders({ "content-type": "application/pdf" }),
        body: null,
        text: async () => "%PDF-1.4",
      })),
    );
    const result = await fetchHtmlSafely("http://example.com/recipe.pdf");
    expect(result.ok).toBe(false);
  });
});
