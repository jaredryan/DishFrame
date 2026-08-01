// Run via `NODE_OPTIONS="--conditions=react-server" tsx scripts/seed.ts`
// (package.json's db:seed script sets this) — several domain modules this
// script needs (dishes/service.ts, dishes/queries.ts, account/init.ts)
// start with `import "server-only"`, which throws under plain Node/tsx
// unless the process sets Node's "react-server" export condition. Static
// imports of those modules must not appear at the top of this file for
// the same reason `tests/e2e/seed-session.ts` loads env vars first and
// dynamically imports everything else inside main().
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

async function main() {
  const { assertLocalDatabaseEnv } = await import("@/lib/db/local-guard");
  assertLocalDatabaseEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    DATABASE_DRIVER: process.env.DATABASE_DRIVER,
  });

  const seedUserEmail = process.env.SEED_USER_EMAIL;
  if (!seedUserEmail) {
    console.error(
      "[qa-seed] SEED_USER_EMAIL is required. Set it in .env.local or export it before running — see .env.example.",
    );
    process.exit(1);
  }
  const seedUserName = process.env.SEED_USER_NAME || "QA Seed Owner";

  const { prisma } = await import("@/lib/db/prisma");
  const dishService = await import("@/lib/dishes/service");
  const dishQueries = await import("@/lib/dishes/queries");
  const tasterService = await import("@/lib/tasters/service");
  const { initializeNewUser } = await import("@/lib/account/init");
  const { resolveSeedOwner, wipeExistingFixtures, ensureSeedTag } =
    await import("./qa-seed/owner");
  const { buildPartFixtures } = await import("./qa-seed/parts");
  const { buildRecipeFixtures } = await import("./qa-seed/recipes");
  const { buildRamenFixture } = await import("./qa-seed/ramen");
  const { createThrowawayGarnishPart, materializeAndDeleteGarnish } =
    await import("./qa-seed/materialized-fixture");
  const { buildToastPlateFixture } =
    await import("./qa-seed/deletion-fixtures");
  const { attachSeedImages, cleanupOrphanedSeedImageAssets } =
    await import("./qa-seed/image-fixture");
  const { applyDishMetadata, applyRamenMetadata } =
    await import("./qa-seed/tags-flavor");
  const { applyNutritionFixtures } = await import("./qa-seed/nutrition");
  const { buildTasterFixtures } = await import("./qa-seed/tasters");
  const { buildCookingFixtures } = await import("./qa-seed/cooking");
  const { applyReviewFixtures } = await import("./qa-seed/reviews");
  const { buildGroceryFixtures } = await import("./qa-seed/grocery");
  const { buildMealPlanFixtures } = await import("./qa-seed/mealplans");
  const { printCatalog } = await import("./qa-seed/catalog");

  const partServices = {
    createDish: dishService.createDish,
    editDish: dishService.editDish,
    getVersionContent: dishQueries.getVersionContent,
  };

  const owner = await resolveSeedOwner(
    initializeNewUser,
    seedUserEmail,
    seedUserName,
  );
  const wiped = await wipeExistingFixtures(owner.id);
  console.log(
    `[qa-seed] Wiped ${wiped.deletedDishCount} prior QA Dish row(s) for ${owner.email}.`,
  );
  const tagId = await ensureSeedTag(owner.id);

  const parts = await buildPartFixtures(partServices, owner.id, tagId);
  const recipes = await buildRecipeFixtures(
    {
      createDish: dishService.createDish,
      archiveDish: dishService.archiveDish,
    },
    owner.id,
    tagId,
    parts,
  );

  const libraryMetadata = await applyDishMetadata(
    partServices,
    owner.id,
    parts,
    recipes,
  );
  await applyNutritionFixtures(partServices, owner.id, parts, recipes);

  const garnish = await createThrowawayGarnishPart(
    { createDish: dishService.createDish },
    owner.id,
    tagId,
  );
  const ramen = await buildRamenFixture(
    partServices,
    owner.id,
    tagId,
    parts,
    garnish,
  );
  await materializeAndDeleteGarnish(
    garnish,
    ramen.garnishOccurrenceLineageId,
    ramen.v2_0Id,
  );
  await applyRamenMetadata(owner.id, libraryMetadata, ramen.dishId);

  const toastplate = await buildToastPlateFixture(
    {
      createDish: dishService.createDish,
      propagatePartUpdate: dishService.propagatePartUpdate,
      listCurrentPartUsages: dishQueries.listCurrentPartUsages,
    },
    owner.id,
    tagId,
    parts,
  );

  const tasters = await buildTasterFixtures(
    { createTaster: tasterService.createTaster },
    owner.id,
  );
  const cooking = await buildCookingFixtures(owner.id, recipes);
  await applyReviewFixtures(owner.id, cooking, tasters, ramen);
  await buildGroceryFixtures(owner.id, recipes, ramen);
  await buildMealPlanFixtures(owner.id, parts, recipes, ramen);

  // Opt-in image fixtures (SEED_UPLOAD_BLOB_IMAGES=true, "pnpm
  // db:seed-images") — a no-op under ordinary "pnpm db:seed", see
  // image-fixture.ts's own doc comments. "[QA] Toasted Sesame Oil
  // Drizzle" (Part) and "[QA] Weeknight Stir-Fry" (Recipe) deliberately
  // stay image-less for the image-empty UI states.
  const image = await attachSeedImages(
    dishService.updateVersionMetadata,
    owner.id,
    [
      {
        slug: "steamed-white-rice",
        dishId: parts.rice.dishId,
        kind: "PART",
        fileName: "steamed-white-rice.jpg",
      },
      {
        slug: "seasoning-blend",
        dishId: parts.seasoning.dishId,
        kind: "PART",
        fileName: "all-purpose-seasoning-blend.jpg",
      },
      {
        slug: "peanut-dipping-sauce",
        dishId: parts.sauce.dishId,
        kind: "PART",
        fileName: "peanut-dipping-sauce.jpeg",
      },
      {
        slug: "cauliflower-rice",
        dishId: parts.replacement.dishId,
        kind: "PART",
        fileName: "cauliflower-rice.jpeg",
      },
      {
        slug: "garlic-confit",
        dishId: parts.deleteme.dishId,
        kind: "PART",
        fileName: "garlic-confit.webp",
      },
      {
        slug: "simple-garden-salad",
        dishId: recipes.salad.dishId,
        kind: "RECIPE",
        fileName: "simple-garden-salad.jpg",
      },
      {
        slug: "rice-bowl-base",
        dishId: recipes.ricebowl.dishId,
        kind: "RECIPE",
        fileName: "rice-bowl-base.jpg",
      },
      {
        slug: "peanut-noodle-salad",
        dishId: recipes.noodlesalad.dishId,
        kind: "RECIPE",
        fileName: "peanut-noodle-salad.jpg",
      },
      {
        slug: "rice-side-dish",
        dishId: recipes.ricesidedish.dishId,
        kind: "RECIPE",
        fileName: "rice-side-dish.jpeg",
      },
      {
        slug: "sunday-ramen-project",
        dishId: ramen.dishId,
        kind: "RECIPE",
        fileName: "sunday-ramen-project.jpeg",
      },
      {
        slug: "confit-toast-plate",
        dishId: toastplate.dishId,
        kind: "RECIPE",
        fileName: "garlic-confit-toast.webp",
      },
    ],
  );
  const imageCleanup = await cleanupOrphanedSeedImageAssets(
    wiped.priorImageAssetIds,
  );

  printCatalog({
    ownerEmail: owner.email,
    image,
    imageCleanupDeletedCount: imageCleanup.deletedCount,
  });

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[qa-seed] Failed:", error);
  process.exit(1);
});
