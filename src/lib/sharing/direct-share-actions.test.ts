import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/lib/errors";

/**
 * Slice 17: proves the action layer's `requireUserId()` gate rejects every
 * direct-share entry point before it ever reaches the service/database —
 * "logged-out users cannot access direct-share details" and "unauthorized
 * users cannot query recipient information through service calls directly."
 * Mirrors `nutrition/actions.test.ts`'s mocking pattern (mocked
 * `requireUserId`, mocked service module) rather than a real DB.
 */

const mockRequireUserId = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireUserId: () => mockRequireUserId(),
  getServerSession: vi.fn(),
}));

const mockLookup = vi.fn();
const mockSend = vi.fn();
const mockCancel = vi.fn();
const mockDecline = vi.fn();
const mockAccept = vi.fn();
const mockPreview = vi.fn();
vi.mock("@/lib/sharing/service", () => ({
  lookupDirectShareRecipient: (...args: unknown[]) => mockLookup(...args),
  sendDirectShare: (...args: unknown[]) => mockSend(...args),
  cancelDirectShare: (...args: unknown[]) => mockCancel(...args),
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

  it("rejects an unauthenticated recipient lookup without calling the service", async () => {
    const { lookupDirectShareRecipient } = await importActions();
    const result = await lookupDirectShareRecipient({
      email: "a@example.invalid",
    });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated send without calling the service", async () => {
    const { sendDirectShare } = await importActions();
    const result = await sendDirectShare({
      dishId: "dish-1",
      recipientEmail: "a@example.invalid",
      note: null,
    });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated cancel without calling the service", async () => {
    const { cancelDirectShare } = await importActions();
    const result = await cancelDirectShare({ directShareId: "share-1" });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockCancel).not.toHaveBeenCalled();
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

  it("passes the signed-in user id through to sendDirectShare on success", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockSend.mockResolvedValue({ directShareId: "share-1" });
    const { sendDirectShare } = await importActions();

    const result = await sendDirectShare({
      dishId: "dish-1",
      recipientEmail: "a@example.invalid",
      note: null,
    });

    expect(result).toEqual({ status: "success", directShareId: "share-1" });
    expect(mockSend).toHaveBeenCalledWith("user-1", {
      dishId: "dish-1",
      recipientEmail: "a@example.invalid",
      note: null,
    });
  });
});
