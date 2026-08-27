import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestUser, deleteTestUser } from "@/test/factories";

/**
 * Slice 11 correction pass: private download headers and terminology on the
 * real account-export Route Handler — mirrors the Dish export route's own
 * integration test.
 */
const mockGetServerSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getServerSession: () => mockGetServerSession(),
}));

describe("GET /api/export/account", () => {
  let userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds) {
      await deleteTestUser(id);
    }
    userIds = [];
    mockGetServerSession.mockReset();
  });

  it("rejects a request with no signed-in session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns private, non-cacheable JSON with a non-'backup'-worded filename and envelope", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const disposition = response.headers.get("Content-Disposition")!;
    expect(disposition).toMatch(
      /^attachment; filename="dishframe-account-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(disposition.toLowerCase()).not.toContain("backup");

    const dto = await response.json();
    expect(dto.format).toBe("dishframe.account-export");
    expect(dto.formatVersion).toBe(2);
    expect(dto.scope).toEqual({ exportType: "ACCOUNT" });
  });
});
