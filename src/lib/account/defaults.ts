/**
 * Seed values for new-account initialization (PRODUCT_SPEC.md §45.9, §63.1,
 * §79.3, §34.2). Display names are what the user sees; normalizedName is the
 * trimmed-lowercase identity used for owner-scoped uniqueness, matching the
 * dedup rule Tag/FlavorProfileValue/GroceryCategory all share.
 */

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export const FAVORITE_TAG_DISPLAY_NAME = "Favorite";

export const OWNER_TASTER_DISPLAY_NAME = "You";

// Ordinary, user-mutable starter categories — seeded once, on first
// initialization only (PRODUCT_SPEC.md §63.1's example list). Distinct from
// the protected fallback category below: a user who deletes or renames one
// of these is never "repaired" back by a later initializeNewUser call.
export const ORDINARY_DEFAULT_GROCERY_CATEGORIES = [
  "Produce",
  "Meat and Seafood",
  "Dairy",
  "Pantry",
  "Frozen",
  "Bakery",
] as const;

// The account's single protected fallback Grocery Category (PRODUCT_SPEC.md
// §63.4). Identified behaviorally via GroceryCategory.isFallback, not by
// this name — a user may rename it and it remains the fallback. Repaired
// (never duplicated) on every initializeNewUser call, unlike the ordinary
// defaults above.
export const FALLBACK_GROCERY_CATEGORY_NAME = "Other";

export const DEFAULT_GROCERY_CATEGORIES = [
  ...ORDINARY_DEFAULT_GROCERY_CATEGORIES,
  FALLBACK_GROCERY_CATEGORY_NAME,
] as const;

export const STARTER_FLAVOR_PROFILES = [
  "Sweet",
  "Savory",
  "Spicy",
  "Tangy",
  "Smoky",
  "Rich",
  "Fresh",
  "Umami",
] as const;
