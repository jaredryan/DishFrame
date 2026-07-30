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
  const { attachSeedImage } = await import("./qa-seed/image-fixture");
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
  await buildRecipeFixtures(
    {
      createDish: dishService.createDish,
      archiveDish: dishService.archiveDish,
    },
    owner.id,
    tagId,
    parts,
  );

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
  const image = await attachSeedImage(
    dishService.updateVersionMetadata,
    owner.id,
    ramen.dishId,
    ramen.currentVersionId,
    ramen.description,
  );

  await buildToastPlateFixture(
    {
      createDish: dishService.createDish,
      propagatePartUpdate: dishService.propagatePartUpdate,
      listCurrentPartUsages: dishQueries.listCurrentPartUsages,
    },
    owner.id,
    tagId,
    parts,
  );

  printCatalog({ ownerEmail: owner.email, imageAttached: image.attached });

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[qa-seed] Failed:", error);
  process.exit(1);
});
