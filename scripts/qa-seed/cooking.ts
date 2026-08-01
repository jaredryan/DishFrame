import { prisma } from "@/lib/db/prisma";
import {
  getOwnedDishVersionOrThrow,
  buildCookableUnits,
} from "@/lib/cooking/queries";
import {
  startCookingSession,
  endCookingSession,
  toggleChecklistItem,
  removeSessionUnit,
  updateUnitScale,
} from "@/lib/cooking/service";
import type { RecipeFixtureIds } from "./recipes";

/**
 * Cooking Setup/Session lifecycle fixtures (Slices 7-8). Reuses the
 * existing compact Recipe/Part set rather than adding new ones — each
 * session below is chosen to leave a distinct, reviewable persisted state.
 */

// Always re-fetches the dish's own CURRENT `currentVersionId` rather than
// trusting a caller-held snapshot (e.g. `RecipeFixtureIds`) — tags-flavor.ts
// runs a real MINOR edit on Weeknight Stir-Fry after `recipes.ts` returns,
// so a session started here must resolve the version fresh or it would pin
// itself to a stale historical Version instead of the Recipe's real current
// one.
export async function currentVersionIdOf(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    select: { currentVersionId: true },
  });
  return dish.currentVersionId!;
}

export async function unitsFor(ownerId: string, dishId: string) {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  const { version } = await getOwnedDishVersionOrThrow(
    ownerId,
    dishId,
    dish.currentVersionId!,
  );
  return buildCookableUnits(ownerId, dish, version);
}

export async function sessionUnits(sessionId: string) {
  return prisma.cookingSessionUnit.findMany({
    where: { sessionId },
    include: { checklistItems: true },
  });
}

export async function checkItems(
  ownerId: string,
  sessionId: string,
  unitId: string,
  count: number,
) {
  const units = await sessionUnits(sessionId);
  const unit = units.find((u) => u.id === unitId)!;
  for (const item of unit.checklistItems.slice(0, count)) {
    await toggleChecklistItem(ownerId, sessionId, item.id, true);
  }
}

export type CookingFixtureIds = {
  stirfrySessionId: string;
  ricesidedishSessionId: string;
  noodlesaladSessionId: string;
  noodlesaladSessionId2: string;
};

export async function buildCookingFixtures(
  ownerId: string,
  recipes: RecipeFixtureIds,
): Promise<CookingFixtureIds> {
  // --- S1: Weeknight Stir-Fry — IN_PROGRESS ------------------------------
  // Whole-session scale (1.5x, natural target-output basis: yields
  // 4 servings), every cookable unit selected, mixed checkoffs, and one
  // per-unit rescale performed after a checkoff to leave a real
  // progress-conflict badge for review (PRODUCT_SPEC.md §24.5).
  const stirfryUnits = await unitsFor(ownerId, recipes.stirfry.dishId);
  const stirfrySession = await startCookingSession(ownerId, {
    dishId: recipes.stirfry.dishId,
    dishVersionId: await currentVersionIdOf(recipes.stirfry.dishId),
    scaleFactor: 1.5,
    units: stirfryUnits.map((u) => ({ unitKey: u.unitKey })),
  });
  const stirfryPersistedUnits = await sessionUnits(stirfrySession.id);
  const prepUnit = stirfryPersistedUnits.find(
    (u) => u.label === "Prepare vegetables",
  )!;
  const cookUnit = stirfryPersistedUnits.find(
    (u) => u.label === "Cook protein",
  )!;
  await checkItems(ownerId, stirfrySession.id, prepUnit.id, 1);
  await checkItems(ownerId, stirfrySession.id, cookUnit.id, 1);
  // Rescale the checked-against unit after checking it off — the checked
  // item's snapshot no longer matches the new effective quantity.
  await updateUnitScale(ownerId, stirfrySession.id, prepUnit.id, 2);

  // --- S3: Rice Side Dish — ENDED_EARLY, removedAfterProgress evidence --
  const ricesidedishUnits = await unitsFor(
    ownerId,
    recipes.ricesidedish.dishId,
  );
  const ricesidedishSession = await startCookingSession(ownerId, {
    dishId: recipes.ricesidedish.dishId,
    dishVersionId: await currentVersionIdOf(recipes.ricesidedish.dishId),
    units: ricesidedishUnits.map((u) => ({ unitKey: u.unitKey })),
  });
  const ricesidedishPersistedUnits = await sessionUnits(ricesidedishSession.id);
  const riceUnit = ricesidedishPersistedUnits.find(
    (u) => u.label === "[QA] Steamed White Rice",
  )!;
  const sauceUnit = ricesidedishPersistedUnits.find(
    (u) => u.label === "[QA] Peanut Dipping Sauce",
  )!;
  await checkItems(ownerId, ricesidedishSession.id, riceUnit.id, 2);
  // Removing a unit after checking off some of its items leaves
  // `removedAfterProgress: true` — real evidence, not just an empty removal.
  await removeSessionUnit(ownerId, ricesidedishSession.id, sauceUnit.id);
  await endCookingSession(ownerId, ricesidedishSession.id, "ENDED_EARLY");

  // --- S4: Peanut Noodle Salad #1 — COMPLETED, nested Part included -----
  // Noodles section + the directly-linked Sauce Part + Sauce's own nested
  // Seasoning Part, independently selected (SLICE_9.md refinement pass) at
  // differing per-unit scales.
  const noodlesaladUnits = await unitsFor(ownerId, recipes.noodlesalad.dishId);
  const noodlesaladSession = await startCookingSession(ownerId, {
    dishId: recipes.noodlesalad.dishId,
    dishVersionId: await currentVersionIdOf(recipes.noodlesalad.dishId),
    units: noodlesaladUnits.map((u) => ({
      unitKey: u.unitKey,
      scaleFactor:
        u.label === "[QA] Peanut Dipping Sauce"
          ? 1.5
          : u.label === "[QA] All-Purpose Seasoning Blend"
            ? 0.5
            : null,
    })),
  });
  const noodlesaladPersistedUnits = await sessionUnits(noodlesaladSession.id);
  for (const unit of noodlesaladPersistedUnits) {
    await checkItems(ownerId, noodlesaladSession.id, unit.id, 1);
  }
  await endCookingSession(ownerId, noodlesaladSession.id, "COMPLETED");

  // --- S4b: Peanut Noodle Salad #2 — COMPLETED, nested Part omitted -----
  // Same Recipe, a second historical session — only Noodles + the direct
  // Sauce unit selected, the nested Seasoning unit left out entirely, the
  // direct contrast to S4 above within one Recipe's own session history.
  const noodlesaladUnits2 = await unitsFor(ownerId, recipes.noodlesalad.dishId);
  const noodlesaladSession2 = await startCookingSession(ownerId, {
    dishId: recipes.noodlesalad.dishId,
    dishVersionId: await currentVersionIdOf(recipes.noodlesalad.dishId),
    units: noodlesaladUnits2
      .filter((u) => u.label !== "[QA] All-Purpose Seasoning Blend")
      .map((u) => ({ unitKey: u.unitKey })),
  });
  const noodlesaladPersistedUnits2 = await sessionUnits(noodlesaladSession2.id);
  for (const unit of noodlesaladPersistedUnits2) {
    await checkItems(ownerId, noodlesaladSession2.id, unit.id, 1);
  }
  await endCookingSession(ownerId, noodlesaladSession2.id, "COMPLETED");

  return {
    stirfrySessionId: stirfrySession.id,
    ricesidedishSessionId: ricesidedishSession.id,
    noodlesaladSessionId: noodlesaladSession.id,
    noodlesaladSessionId2: noodlesaladSession2.id,
  };
}
