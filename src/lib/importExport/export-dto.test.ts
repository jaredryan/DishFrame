import { describe, expect, it } from "vitest";
import {
  ingredientDto,
  versionContentDto,
} from "@/lib/importExport/export-dto";

/**
 * ARCHITECTURE_PROPOSAL.md §M.5's "poison field" regression test (named
 * explicitly by BUILD_PLAN.md's Slice 11 section): proves the DTO builders
 * construct their output with named properties only, so a
 * password/session/token field accidentally present on an underlying query
 * result — simulated here as extra properties on an otherwise-legitimate
 * row — can never reach an export payload. A real `Rating`/`Ingredient`/etc.
 * row can never actually carry a `password` field (they're different
 * tables), but the whitelisting *mechanism* under test is the same one that
 * protects every DTO builder in this module, including the account-backup
 * builder that never even queries `User`/`Account`/`Session`.
 */
describe("export DTO field whitelisting", () => {
  it("ingredientDto never serializes an unexpected field", () => {
    const poisoned = {
      name: "Salt",
      quantity: null,
      quantityEnd: null,
      isApproximate: false,
      unit: null,
      displayText: null,
      preparationNote: null,
      isOptional: false,
      originalImportedText: null,
      substituteForIngredientId: null,
      substitute: null,
      // Not a real Ingredient column — simulates a poisoned query result.
      password: "hunter2",
      sessionToken: "abc123",
    };

    const dto = ingredientDto(poisoned as never);

    expect(dto).not.toHaveProperty("password");
    expect(dto).not.toHaveProperty("sessionToken");
    expect(JSON.stringify(dto)).not.toMatch(/hunter2|abc123/);
    expect(dto.name).toBe("Salt");
  });

  it("versionContentDto never serializes an unexpected field, including a poisoned image storage key", () => {
    const poisoned = {
      id: "v1",
      majorVersion: 1,
      minorVersion: 0,
      title: "Test",
      description: null,
      yieldQuantity: null,
      yieldUnit: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      difficulty: null,
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      nutritionBasis: null,
      nutritionBasisQuantity: null,
      nutritionBasisUnit: null,
      moreNutrients: null,
      nutritionSourceProvider: null,
      nutritionSourceId: null,
      versionNote: null,
      createdAt: new Date("2024-01-01"),
      imageAssetId: "asset1",
      // Not a real DishVersion field — the ImageAsset's private Blob key
      // (images/service.ts never exposes this to clients either).
      storageKey: "private/blob/object-key",
      sections: [],
      partLinks: [],
    };

    const dto = versionContentDto(poisoned as never);

    expect(dto).not.toHaveProperty("storageKey");
    expect(JSON.stringify(dto)).not.toContain("private/blob/object-key");
    expect(dto.imageAssetId).toBe("asset1");
  });
});
