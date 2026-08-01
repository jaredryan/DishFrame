export function printCatalog(input: {
  ownerEmail: string;
  image: {
    requested: boolean;
    attachedCount: number;
    skippedReason: string | null;
  };
  imageCleanupDeletedCount: number;
}): void {
  const imageLine = !input.image.requested
    ? 'Image fixtures: skipped — SEED_UPLOAD_BLOB_IMAGES is not "true" (ordinary pnpm db:seed never contacts Vercel Blob). Run "pnpm db:seed-images" for the image-enabled review seed.'
    : input.image.attachedCount > 0
      ? `Image fixtures: attached to ${input.image.attachedCount} Recipes/Parts (see docs/SEED_REVIEW_GUIDE.md). [QA] Toasted Sesame Oil Drizzle and [QA] Weeknight Stir-Fry stay image-less for the image-empty UI states.${input.imageCleanupDeletedCount > 0 ? ` Cleaned up ${input.imageCleanupDeletedCount} orphaned image asset(s) from a prior run.` : ""}`
      : `Image fixtures: skipped — ${input.image.skippedReason}`;
  const lines = [
    "",
    "===== DishFrame QA seed catalog =====",
    `QA owner: ${input.ownerEmail}`,
    "",
    "Parts:",
    "  [QA] Steamed White Rice",
    "  [QA] All-Purpose Seasoning Blend",
    "  [QA] Peanut Dipping Sauce",
    "  [QA] Cauliflower Rice",
    "  [QA] Garlic Confit  <- deletion target",
    "  [QA] Toasted Sesame Oil Drizzle",
    "",
    "Recipes:",
    "  [QA] Simple Garden Salad",
    "  [QA] Rice Bowl Base",
    "  [QA] Weeknight Stir-Fry",
    "  [QA] Peanut Noodle Salad",
    "  [QA] Rice Side Dish  <- propagation targets (outdated on Rice + Sauce)",
    "  [QA] Sunday Ramen Project  <- version comparison + materialized-snapshot history",
    "  [QA] Confit Toast Plate  <- deletion-target usage + historical pinned-Version fixture",
    "",
    "Propagation:",
    "  Rice — already current: [QA] Rice Bowl Base",
    "  Rice — outdated: [QA] Weeknight Stir-Fry, [QA] Rice Side Dish",
    "  Sauce — already current: [QA] Weeknight Stir-Fry",
    "  Sauce — outdated: [QA] Peanut Noodle Salad, [QA] Rice Side Dish",
    "",
    "Deletion target: [QA] Garlic Confit",
    "  Current usages: [QA] Sunday Ramen Project, [QA] Confit Toast Plate",
    "  Historical parent Version pinned to the older target Version: [QA] Confit Toast Plate's V1",
    "  Replace-flow candidate: [QA] Cauliflower Rice",
    "",
    "Materialized/deleted-Part snapshot: open [QA] Sunday Ramen Project's Version history and view V2.0.",
    "",
    imageLine,
    "",
    "Nutrition:",
    "  Manual/WHOLE/primary-only: [QA] All-Purpose Seasoning Blend",
    "  Manual/PER_OUTPUT_UNIT/primary+more: [QA] Peanut Dipping Sauce",
    "  USDA FDC (non-branded): [QA] Cauliflower Rice",
    "  USDA FDC (branded-style): [QA] Garlic Confit",
    "  Manual/WHOLE/detached-no-source: [QA] Weeknight Stir-Fry",
    "  No nutrition: [QA] Steamed White Rice, [QA] Simple Garden Salad",
    "",
    "Tasters: You (owner), [QA] Partner, [QA] Kid, [QA] Former Roommate (archived)",
    "",
    "Cooking Sessions:",
    "  In progress (standalone): [QA] Weeknight Stir-Fry",
    "  In progress (Meal-Plan-linked, entry E7): [QA] Rice Bowl Base",
    "  Ended early: [QA] Rice Side Dish",
    "  Completed + full Review: [QA] Peanut Noodle Salad (#1, nested Part included), [QA] Sunday Ramen Project",
    "  Completed, rating only: [QA] Peanut Noodle Salad (#2, nested Part omitted)",
    "",
    "Grocery lists:",
    "  Active standalone: [QA] Weeknight Shopping",
    "  Completed/frozen standalone: [QA] Pantry Restock",
    "  Active Meal-Plan-linked: [QA] This Week's Groceries",
    "  Completed/frozen Meal-Plan-linked: [QA] This Week's Groceries (Frozen)",
    "",
    "Meal Plans: [QA] This Week (6 live entries — Planned/In progress/Cooked/Skipped all covered), [QA] Duplicated Next Month",
    "",
    "See docs/SEED_REVIEW_GUIDE.md for the full coverage matrix.",
    "",
    "======================================",
    "",
  ];
  console.log(lines.join("\n"));
}
