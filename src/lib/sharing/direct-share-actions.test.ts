import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/lib/errors";

/**
 * Proves the action layer's `requireUserId()` gate rejects every per-item
 * direct-share entry point before it ever reaches the service/database —
 * "logged-out users cannot accept/decline/preview a share." Mirrors
 * `nutrition/actions.test.ts`'s mocking pattern (mocked `requireUserId`,
 * mocked service module) rather than a real DB. Send-time actions
 * (`sendDirectShareCollection` et al.) have their own auth-boundary test in
 * `direct-share-collection-actions.test.ts`.
 */

const mockRequireUserId = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireUserId: () => mockRequireUserId(),
  getServerSession: vi.fn(),
}));

const mockDecline = vi.fn();
const mockAccept = vi.fn();
const mockPreview = vi.fn();
vi.mock("@/lib/sharing/service", () => ({
  declineDirectShare: (...args: unknown[]) => mockDecline(...args),
  acceptDirectShare: (...args: unknown[]) => mockAccept(...args),
  getDirectSharePreview: (...args: unknown[]) => mockPreview(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function importActions() {
  return import("@/lib/sharing/actions");
}

const NOT_SIGNED_IN = new AuthorizationError(
  "You must be signed in to do that.",
);

describe("sharing/actions.ts direct-share auth boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockRejectedValue(NOT_SIGNED_IN);
  });

  it("rejects an unauthenticated decline without calling the service", async () => {
    const { declineDirectShare } = await importActions();
    const result = await declineDirectShare({ directShareId: "share-1" });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockDecline).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated accept without calling the service", async () => {
    const { acceptDirectShare } = await importActions();
    const result = await acceptDirectShare({ directShareId: "share-1" });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated preview fetch without calling the service", async () => {
    const { getDirectSharePreview } = await importActions();
    const result = await getDirectSharePreview({ directShareId: "share-1" });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockPreview).not.toHaveBeenCalled();
  });
});
