import { afterEach, describe, expect, it, vi } from "vitest";
import {
  searchFdcFoods,
  getFdcFoodDetail,
  FdcRateLimitError,
  FdcTimeoutError,
  FdcUpstreamError,
  FdcShapeError,
} from "@/lib/nutrition/fdc-client";

/**
 * BUILD_PLAN.md Slice 13: `fdc-client.ts` is the one place raw USDA FDC
 * responses are shaped/whitelisted — these tests never make a live network
 * call (`global.fetch` is always mocked), matching the owner's explicit
 * "no live USDA requests in automated tests" constraint.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockFetch(response: Response | (() => Promise<Response>)) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => (typeof response === "function" ? response() : response)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchFdcFoods", () => {
  it("shapes generic and branded results, dropping a malformed hit", async () => {
    mockFetch(
      jsonResponse({
        totalHits: 3,
        foods: [
          {
            fdcId: 1001,
            description: "Rice, white, cooked",
            dataType: "SR Legacy",
          },
          {
            fdcId: 1002,
            description: "Rice Krispies",
            dataType: "Branded",
            brandName: "Kellogg's",
            brandOwner: "Kellogg Company",
          },
          // Missing fdcId — malformed, must be dropped rather than surfaced.
          { description: "Broken row", dataType: "Branded" },
        ],
      }),
    );

    const result = await searchFdcFoods("fake-key", "rice");

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      fdcId: 1001,
      description: "Rice, white, cooked",
      dataType: "SR Legacy",
      brandName: null,
      brandOwner: null,
    });
    expect(result.items[1]).toEqual({
      fdcId: 1002,
      description: "Rice Krispies",
      dataType: "Branded",
      brandName: "Kellogg's",
      brandOwner: "Kellogg Company",
    });
  });

  it("never sends the API key anywhere but the request URL", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        capturedUrl = url;
        return jsonResponse({ totalHits: 0, foods: [] });
      }),
    );

    await searchFdcFoods("super-secret-key", "rice");

    expect(capturedUrl).toContain("api_key=super-secret-key");
  });
});

describe("getFdcFoodDetail", () => {
  it("shapes a generic food's primary nutrients and only the recognized More-nutrients whitelist, per-100g basis", async () => {
    mockFetch(
      jsonResponse({
        fdcId: 2001,
        description: "Rice, white, cooked",
        dataType: "SR Legacy",
        foodNutrients: [
          { nutrient: { id: 1008, unitName: "KCAL" }, amount: 130 },
          { nutrient: { id: 1003, unitName: "G" }, amount: 2.7 },
          { nutrient: { id: 1005, unitName: "G" }, amount: 28.2 },
          { nutrient: { id: 1004, unitName: "G" }, amount: 0.3 },
          { nutrient: { id: 1079, unitName: "G" }, amount: 0.4 }, // fiber
          { nutrient: { id: 1093, unitName: "MG" }, amount: 1 }, // sodium
          // Not on the whitelist — must never surface.
          { nutrient: { id: 1092, unitName: "MG" }, amount: 76 }, // potassium
        ],
      }),
    );

    const detail = await getFdcFoodDetail("fake-key", 2001);

    expect(detail).toEqual({
      fdcId: 2001,
      sourceName: "Rice, white, cooked",
      calories: 130,
      protein: 2.7,
      carbs: 28.2,
      fat: 0.3,
      nutritionBasis: "PER_OUTPUT_UNIT",
      nutritionBasisQuantity: 100,
      nutritionBasisUnit: "g",
      moreNutrients: [
        { key: "fiber", label: "Fiber", value: 0.4, unit: "g" },
        { key: "sodium", label: "Sodium", value: 1, unit: "mg" },
      ],
    });
  });

  it("converts kJ-only energy to kcal", async () => {
    mockFetch(
      jsonResponse({
        fdcId: 2002,
        description: "kJ-only food",
        dataType: "Foundation",
        foodNutrients: [
          { nutrient: { id: 1062, unitName: "KJ" }, amount: 418.4 },
        ],
      }),
    );

    const detail = await getFdcFoodDetail("fake-key", 2002);

    expect(detail.calories).toBe(100); // 418.4 kJ / 4.184 = 100 kcal
  });

  it("uses per-serving labelNutrients for a Branded food with a declared serving size", async () => {
    mockFetch(
      jsonResponse({
        fdcId: 2003,
        description: "Rice Krispies",
        dataType: "Branded",
        servingSize: 30,
        servingSizeUnit: "g",
        foodNutrients: [
          // Per-100g values — must NOT be used once labelNutrients basis applies.
          { nutrient: { id: 1008, unitName: "KCAL" }, amount: 400 },
        ],
        labelNutrients: {
          calories: { value: 120 },
          protein: { value: 2 },
          carbohydrates: { value: 28 },
          fat: { value: 0 },
          sodium: { value: 200 },
        },
      }),
    );

    const detail = await getFdcFoodDetail("fake-key", 2003);

    expect(detail.nutritionBasis).toBe("PER_OUTPUT_UNIT");
    expect(detail.nutritionBasisQuantity).toBe(30);
    expect(detail.nutritionBasisUnit).toBe("g");
    expect(detail.calories).toBe(120);
    expect(detail.moreNutrients).toEqual([
      { key: "sodium", label: "Sodium", value: 200, unit: "mg" },
    ]);
  });

  it("falls back to the per-100g basis for a Branded food with no label data", async () => {
    mockFetch(
      jsonResponse({
        fdcId: 2004,
        description: "Generic branded item",
        dataType: "Branded",
        foodNutrients: [
          { nutrient: { id: 1008, unitName: "KCAL" }, amount: 250 },
        ],
      }),
    );

    const detail = await getFdcFoodDetail("fake-key", 2004);

    expect(detail.nutritionBasis).toBe("PER_OUTPUT_UNIT");
    expect(detail.nutritionBasisQuantity).toBe(100);
    expect(detail.nutritionBasisUnit).toBe("g");
    expect(detail.calories).toBe(250);
  });

  it("leaves a missing primary nutrient null rather than guessing", async () => {
    mockFetch(
      jsonResponse({
        fdcId: 2005,
        description: "Incomplete food",
        dataType: "SR Legacy",
        foodNutrients: [
          { nutrient: { id: 1008, unitName: "KCAL" }, amount: 50 },
        ],
      }),
    );

    const detail = await getFdcFoodDetail("fake-key", 2005);

    expect(detail.calories).toBe(50);
    expect(detail.protein).toBeNull();
    expect(detail.carbs).toBeNull();
    expect(detail.fat).toBeNull();
    expect(detail.moreNutrients).toEqual([]);
  });

  it("throws FdcShapeError for a response missing fdcId/description", async () => {
    mockFetch(jsonResponse({ dataType: "SR Legacy", foodNutrients: [] }));

    await expect(getFdcFoodDetail("fake-key", 9999)).rejects.toThrow(
      FdcShapeError,
    );
  });
});

describe("upstream error handling", () => {
  it("throws FdcRateLimitError on a 429 response", async () => {
    mockFetch(jsonResponse({}, 429));

    await expect(searchFdcFoods("fake-key", "rice")).rejects.toThrow(
      FdcRateLimitError,
    );
  });

  it("throws FdcUpstreamError on a non-ok, non-429 response", async () => {
    mockFetch(jsonResponse({}, 500));

    await expect(searchFdcFoods("fake-key", "rice")).rejects.toThrow(
      FdcUpstreamError,
    );
  });

  it("throws FdcTimeoutError when the request aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }),
    );

    await expect(searchFdcFoods("fake-key", "rice")).rejects.toThrow(
      FdcTimeoutError,
    );
  });

  it("throws FdcUpstreamError when fetch itself fails (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(searchFdcFoods("fake-key", "rice")).rejects.toThrow(
      FdcUpstreamError,
    );
  });
});
