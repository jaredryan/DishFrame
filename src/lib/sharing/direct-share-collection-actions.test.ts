import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/lib/errors";

/**
 * Slice 22: mirrors direct-share-actions.test.ts's pattern for the new
 * unified-sharing action entry points — proves `requireUserId()` rejects
 * every one of them before the collections service is ever called.
 */

const mockRequireUserId = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireUserId: () => mockRequireUserId(),
  getServerSession: vi.fn(),
}));

const mockListShareable = vi.fn();
const mockSendCollection = vi.fn();
const mockCancelCollection = vi.fn();
const mockGetDetail = vi.fn();
const mockFinalize = vi.fn();
vi.mock("@/lib/sharing/collections", () => ({
  listShareableRecipesForSender: (...args: unknown[]) =>
    mockListShareable(...args),
  sendDirectShareCollection: (...args: unknown[]) =>
    mockSendCollection(...args),
  cancelDirectShareCollection: (...args: unknown[]) =>
    mockCancelCollection(...args),
  getDirectShareCollectionDetail: (...args: unknown[]) =>
    mockGetDetail(...args),
  finalizeDirectShareCollectionDecision: (...args: unknown[]) =>
    mockFinalize(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function importActions() {
  return import("@/lib/sharing/actions");
}

const NOT_SIGNED_IN = new AuthorizationError(
  "You must be signed in to do that.",
);

describe("sharing/actions.ts Slice 22 auth boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockRejectedValue(NOT_SIGNED_IN);
  });

  it("rejects an unauthenticated shareable-recipes list without calling the service", async () => {
    const { listShareableRecipesForSender } = await importActions();
    const result = await listShareableRecipesForSender();
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockListShareable).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated collection send without calling the service", async () => {
    const { sendDirectShareCollection } = await importActions();
    const result = await sendDirectShareCollection({
      recipientEmail: "a@example.invalid",
      dishIds: ["d1"],
      note: null,
    });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockSendCollection).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated collection cancel without calling the service", async () => {
    const { cancelDirectShareCollection } = await importActions();
    const result = await cancelDirectShareCollection({ collectionId: "c1" });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockCancelCollection).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated collection detail fetch without calling the service", async () => {
    const { getDirectShareCollectionDetail } = await importActions();
    const result = await getDirectShareCollectionDetail({ collectionId: "c1" });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockGetDetail).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated finalize without calling the service", async () => {
    const { finalizeDirectShareCollection } = await importActions();
    const result = await finalizeDirectShareCollection({
      collectionId: "c1",
      acceptedShareIds: [],
    });
    expect(result).toEqual({ status: "error", message: NOT_SIGNED_IN.message });
    expect(mockFinalize).not.toHaveBeenCalled();
  });

  it("passes the signed-in user id through to sendDirectShareCollection on success", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockSendCollection.mockResolvedValue({ collectionId: "c1" });
    const { sendDirectShareCollection } = await importActions();

    const result = await sendDirectShareCollection({
      recipientEmail: "a@example.invalid",
      dishIds: ["d1", "d2"],
      note: "Hi",
    });

    expect(result).toEqual({ status: "success", collectionId: "c1" });
    expect(mockSendCollection).toHaveBeenCalledWith("user-1", {
      recipientEmail: "a@example.invalid",
      dishIds: ["d1", "d2"],
      note: "Hi",
    });
  });

  it("enforces the server batch maximum before the service is ever called", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const { sendDirectShareCollection } = await importActions();

    const tooMany = Array.from({ length: 51 }, (_, i) => `d${i}`);
    const result = await sendDirectShareCollection({
      recipientEmail: "a@example.invalid",
      dishIds: tooMany,
      note: null,
    });

    expect(result.status).toBe("error");
    expect(mockSendCollection).not.toHaveBeenCalled();
  });
});
