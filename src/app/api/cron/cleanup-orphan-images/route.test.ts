import { describe, expect, it, vi } from "vitest";

const cleanupAbandonedImageAssets = vi.fn();
vi.mock("@/lib/images/service", () => ({
  cleanupAbandonedImageAssets: (...args: unknown[]) =>
    cleanupAbandonedImageAssets(...args),
}));

function request(headers?: Record<string, string>) {
  return new Request("http://localhost/api/cron/cleanup-orphan-images", {
    headers,
  });
}

describe("GET /api/cron/cleanup-orphan-images", () => {
  it("responds 503 without running cleanup when CRON_SECRET isn't configured", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env/server", () => ({ env: { CRON_SECRET: undefined } }));
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(cleanupAbandonedImageAssets).not.toHaveBeenCalled();
  });

  it("rejects a request with a missing or wrong bearer token", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env/server", () => ({ env: { CRON_SECRET: "secret" } }));
    const { GET } = await import("./route");

    const missing = await GET(request());
    expect(missing.status).toBe(401);

    const wrong = await GET(request({ authorization: "Bearer nope" }));
    expect(wrong.status).toBe(401);
    expect(cleanupAbandonedImageAssets).not.toHaveBeenCalled();
  });

  it("runs cleanup and returns its result for a correctly authorized request", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env/server", () => ({ env: { CRON_SECRET: "secret" } }));
    cleanupAbandonedImageAssets.mockResolvedValueOnce({
      candidateCount: 2,
      deletedCount: 1,
      retainedForRetryCount: 1,
    });
    const { GET } = await import("./route");

    const response = await GET(request({ authorization: "Bearer secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      candidateCount: 2,
      deletedCount: 1,
      retainedForRetryCount: 1,
    });
  });
});
