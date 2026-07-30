export function printCatalog(input: {
  ownerEmail: string;
  imageAttached: boolean;
}): void {
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
    input.imageAttached
      ? "Image fixture: attached to [QA] Sunday Ramen Project. [QA] Weeknight Stir-Fry stays image-less for comparison."
      : "Image fixture: skipped (BLOB_READ_WRITE_TOKEN not set) — see docs/MANUAL_QA_SEED.md for the manual step.",
    "",
    "======================================",
    "",
  ];
  console.log(lines.join("\n"));
}
