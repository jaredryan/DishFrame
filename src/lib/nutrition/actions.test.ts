import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/lib/errors";

/**
 * BUILD_PLAN.md Slice 13's owner clarifications: FDC access must remain
 * server-side, require authentication, and never make a live network call
 * in automated tests — `fdc-client.ts` is mocked here, never `fetch`
 * directly.
 */

const mockRequireUserId = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireUserId: () => mockRequireUserId(),
}));

const mockSearchFdcFoods = vi.fn();
const mockGetFdcFoodDetail = vi.fn();
vi.mock("@/lib/nutrition/fdc-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/nutrition/fdc-client")
  >("@/lib/nutrition/fdc-client");
  return {
    ...actual,
    searchFdcFoods: (...args: unknown[]) => mockSearchFdcFoods(...args),
    getFdcFoodDetail: (...args: unknown[]) => mockGetFdcFoodDetail(...args),
  };
});

let fdcConfigured = true;
vi.mock("@/lib/env/server", () => ({
  get env() {
    return { FDC_API_KEY: fdcConfigured ? "fake-key" : undefined };
  },
  get isFdcConfigured() {
    return fdcConfigured;
  },
}));

async function importActions() {
  return import("@/lib/nutrition/actions");
}

describe("searchFdc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fdcConfigured = true;
    mockRequireUserId.mockResolvedValue("user-1");
  });

  it("requires authentication before proxying a search request", async () => {
    mockRequireUserId.mockRejectedValue(
      new AuthorizationError("You must be signed in to do that."),
    );
    const { searchFdc } = await importActions();

    const result = await searchFdc({ query: "rice" });

    expect(result).toEqual({
      status: "error",
      message: "You must be signed in to do that.",
    });
    expect(mockSearchFdcFoods).not.toHaveBeenCalled();
  });

  it("fails clearly without ever calling FDC when FDC_API_KEY is not configured", async () => {
    fdcConfigured = false;
    const { searchFdc } = await importActions();

    const result = await searchFdc({ query: "rice" });

    expect(result.status).toBe("error");
    expect(mockSearchFdcFoods).not.toHaveBeenCalled();
  });

  it("rejects a blank query without calling FDC", async () => {
    const { searchFdc } = await importActions();

    const result = await searchFdc({ query: "   " });

    expect(result.status).toBe("error");
    expect(mockSearchFdcFoods).not.toHaveBeenCalled();
  });

  it("returns shaped results on success, and the API key never appears in the response", async () => {
    mockSearchFdcFoods.mockResolvedValue({
      query: "rice",
      totalHits: 1,
      items: [
        {
          fdcId: 1,
          description: "Rice",
          dataType: "SR Legacy",
          brandName: null,
          brandOwner: null,
        },
      ],
    });
    const { searchFdc } = await importActions();

    const result = await searchFdc({ query: "rice" });

    expect(result.status).toBe("success");
    expect(JSON.stringify(result)).not.toContain("fake-key");
    expect(mockSearchFdcFoods).toHaveBeenCalledWith("fake-key", "rice");
  });

  it("maps an upstream rate-limit error to a friendly, non-leaking message", async () => {
    const { FdcRateLimitError } = await vi.importActual<
      typeof import("@/lib/nutrition/fdc-client")
    >("@/lib/nutrition/fdc-client");
    mockSearchFdcFoods.mockRejectedValue(new FdcRateLimitError("rate limited"));
    const { searchFdc } = await importActions();

    const result = await searchFdc({ query: "rice" });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).not.toContain("fake-key");
      expect(result.message.toLowerCase()).toContain("rate-limited");
    }
  });

  it("maps an upstream timeout to a friendly message", async () => {
    const { FdcTimeoutError } = await vi.importActual<
      typeof import("@/lib/nutrition/fdc-client")
    >("@/lib/nutrition/fdc-client");
    mockSearchFdcFoods.mockRejectedValue(new FdcTimeoutError("timed out"));
    const { searchFdc } = await importActions();

    const result = await searchFdc({ query: "rice" });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message.toLowerCase()).toContain("too long");
    }
  });

  it("maps a generic upstream failure to a manual-entry fallback message", async () => {
    const { FdcUpstreamError } = await vi.importActual<
      typeof import("@/lib/nutrition/fdc-client")
    >("@/lib/nutrition/fdc-client");
    mockSearchFdcFoods.mockRejectedValue(new FdcUpstreamError("down"));
    const { searchFdc } = await importActions();

    const result = await searchFdc({ query: "rice" });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message.toLowerCase()).toContain("manual entry");
    }
  });
});

describe("applyFdcResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fdcConfigured = true;
    mockRequireUserId.mockResolvedValue("user-1");
  });

  it("requires authentication", async () => {
    mockRequireUserId.mockRejectedValue(
      new AuthorizationError("You must be signed in to do that."),
    );
    const { applyFdcResult } = await importActions();

    const result = await applyFdcResult({ fdcId: 123 });

    expect(result.status).toBe("error");
    expect(mockGetFdcFoodDetail).not.toHaveBeenCalled();
  });

  it("fails clearly when FDC_API_KEY is not configured", async () => {
    fdcConfigured = false;
    const { applyFdcResult } = await importActions();

    const result = await applyFdcResult({ fdcId: 123 });

    expect(result.status).toBe("error");
    expect(mockGetFdcFoodDetail).not.toHaveBeenCalled();
  });

  it("returns the shaped nutrition detail on success", async () => {
    mockGetFdcFoodDetail.mockResolvedValue({
      fdcId: 123,
      sourceName: "Rice, white, cooked",
      calories: 130,
      protein: 2.7,
      carbs: 28.2,
      fat: 0.3,
      nutritionBasis: "PER_OUTPUT_UNIT",
      nutritionBasisQuantity: 100,
      nutritionBasisUnit: "g",
      moreNutrients: [],
    });
    const { applyFdcResult } = await importActions();

    const result = await applyFdcResult({ fdcId: 123 });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.nutrition.fdcId).toBe(123);
      expect(result.nutrition.sourceName).toBe("Rice, white, cooked");
    }
    expect(mockGetFdcFoodDetail).toHaveBeenCalledWith("fake-key", 123);
  });
});
