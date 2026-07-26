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

export const DEFAULT_GROCERY_CATEGORIES = [
  "Produce",
  "Meat and Seafood",
  "Dairy",
  "Pantry",
  "Frozen",
  "Bakery",
  "Other",
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
