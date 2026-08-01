import { prisma } from "@/lib/db/prisma";
import * as mealPlanService from "@/lib/mealplans/service";
import { endCookingSession } from "@/lib/cooking/service";
import * as listService from "@/lib/grocery/list-service";
import { ensureCategory } from "./grocery";
import type { PartFixtureIds } from "./parts";
import type { RecipeFixtureIds } from "./recipes";
import type { RamenFixture } from "./ramen";

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * A specific, named ingredient's contribution for one entry — not "any"
 * contribution. Several Plan1 entries share the same Part (Seasoning
 * Blend, via direct and nested inclusion alike), so an unnamed "first
 * contribution found" pick is non-deterministic about which
 * `GroceryListItem` it lands on: a shared ingredient like "Salt" combines
 * across every entry that produces it into one item, where losing a
 * single contributor doesn't necessarily flip the whole item's own
 * `syncFlag`. Naming the exact ingredient lets each call below guarantee
 * hitting an item this specific entry is the *sole* contributor to.
 */
async function itemForEntryIngredient(
  listId: string,
  entryId: string,
  ingredientName: string,
) {
  const contribution = await prisma.groceryItemContribution.findFirstOrThrow({
    where: {
      mealPlanEntryId: entryId,
      originalName: ingredientName,
      groceryListItem: { groceryListId: listId },
    },
  });
  return prisma.groceryListItem.findUniqueOrThrow({
    where: { id: contribution.groceryListItemId },
  });
}

/**
 * Meal Plans, planned meals, recommendations inputs, and live grocery
 * synchronization (Slice 15, PRODUCT_SPEC.md §76-81). Dates are computed
 * relative to the seed's own run time (`daysFromNow`) rather than fixed
 * calendar dates — the only way an "active" plan spanning today stays
 * meaningful across reseeds, matching this module's own "safely rerunnable"
 * contract (content/shape is deterministic; the literal dates are not, by
 * design).
 */
export async function buildMealPlanFixtures(
  ownerId: string,
  parts: PartFixtureIds,
  recipes: RecipeFixtureIds,
  ramen: RamenFixture,
): Promise<void> {
  const plan1Start = daysFromNow(-2);
  const plan1End = daysFromNow(6);
  const plan1Id = await mealPlanService.createMealPlan(ownerId, {
    title: "[QA] This Week",
    startDate: plan1Start,
    endDate: plan1End,
    notes: "Live grocery-sync fixture — see docs/SEED_REVIEW_GUIDE.md.",
  });

  // E1 — over-allocated (target 6 vs. authored 4), stays Planned: Weeknight
  // Stir-Fry already has an active Cooking Session (S1) elsewhere, so it
  // can't be started from this entry too (one-active-session-per-Dish).
  const e1 = await mealPlanService.addMealPlanEntry(ownerId, plan1Id, {
    dishId: recipes.stirfry.dishId,
    cookDate: daysFromNow(0),
    targetYieldQuantity: 6,
    targetYieldUnit: "servings",
    note: "Family dinner, doubling for leftovers.",
  });
  await mealPlanService.addPlannedMeal(ownerId, plan1Id, e1, {
    label: "Dinner",
    date: daysFromNow(0),
    servings: 6,
  });

  // E2 — over-allocated (target 3 vs. authored 2), linked + Cooked: the
  // one entry actually started from the plan (§78), producing a completed
  // session with no Review (contrast to the reviewed sessions in
  // reviews.ts) and a real target-yield scale factor (1.5x).
  const e2 = await mealPlanService.addMealPlanEntry(ownerId, plan1Id, {
    dishId: recipes.ricebowl.dishId,
    cookDate: daysFromNow(-1),
    targetYieldQuantity: 3,
    targetYieldUnit: "servings",
  });
  const e2Session = await mealPlanService.startSessionFromEntry(
    ownerId,
    plan1Id,
    e2,
  );
  await endCookingSession(ownerId, e2Session.id, "COMPLETED");

  // E3 — balanced (target 3 vs. authored 3), Skipped: unlinked, even
  // though Peanut Noodle Salad already has two completed sessions of its
  // own (cooking.ts) — those simply weren't started from this plan.
  const e3 = await mealPlanService.addMealPlanEntry(ownerId, plan1Id, {
    dishId: recipes.noodlesalad.dishId,
    cookDate: daysFromNow(1),
    targetYieldQuantity: 3,
    targetYieldUnit: "servings",
  });
  await mealPlanService.setMealPlanEntryStatus(ownerId, plan1Id, e3, "SKIPPED");

  // E4 — unknown allocation (no target set), Planned. A standard Recipe
  // entry with its own planned meal.
  const e4 = await mealPlanService.addMealPlanEntry(ownerId, plan1Id, {
    dishId: ramen.dishId,
    cookDate: daysFromNow(2),
  });
  await mealPlanService.addPlannedMeal(ownerId, plan1Id, e4, {
    label: "Weekend project",
    date: daysFromNow(2),
    servings: 2,
  });

  // E5 — standalone Part entry (Recipe and Part entries share one model,
  // §76.2), unknown allocation (no target, and the Part itself has no
  // authored yield either). Removed later below, once List C exists, to
  // leave a real REMOVED contribution + `syncFlag` mirror.
  const e5 = await mealPlanService.addMealPlanEntry(ownerId, plan1Id, {
    dishId: parts.seasoning.dishId,
    cookDate: daysFromNow(3),
  });

  // E6 — balanced (target 2 vs. authored 2), manually marked Cooked
  // (§78's "cooking that happened outside DishFrame") — deliberately not
  // linked to Rice Side Dish's own ENDED_EARLY session (S3, cooking.ts).
  const e6 = await mealPlanService.addMealPlanEntry(ownerId, plan1Id, {
    dishId: recipes.ricesidedish.dishId,
    cookDate: daysFromNow(-2),
    targetYieldQuantity: 2,
    targetYieldUnit: "servings",
  });
  await mealPlanService.setMealPlanEntryStatus(ownerId, plan1Id, e6, "COOKED");

  // E7 — under-allocated (target 1 vs. authored 2), In progress: linked to
  // a genuinely unfinished Cooking Session via the real
  // `startSessionFromEntry` domain flow (§78), then deliberately never
  // ended — the only way `IN_PROGRESS` is reachable at all (`setMealPlanEntryStatus`'s
  // own `EntryStatusValue` type excludes it). Covers all four statuses on
  // one Meal Plan without forcing a status field directly. Safe to start a
  // second Rice Bowl Base session here — E2's own session on the same
  // Recipe already completed, so this doesn't collide with the
  // one-active-session-per-Dish guard.
  const e7 = await mealPlanService.addMealPlanEntry(ownerId, plan1Id, {
    dishId: recipes.ricebowl.dishId,
    cookDate: daysFromNow(5),
    targetYieldQuantity: 1,
    targetYieldUnit: "servings",
  });
  await mealPlanService.startSessionFromEntry(ownerId, plan1Id, e7);

  // --- Live grocery synchronization -------------------------------------
  const listCId = await mealPlanService.generateGroceryListFromMealPlan(
    ownerId,
    plan1Id,
    { title: "[QA] This Week's Groceries" },
  );
  const listDId = await mealPlanService.generateGroceryListFromMealPlan(
    ownerId,
    plan1Id,
    { title: "[QA] This Week's Groceries (Frozen)" },
  );

  // A manual item + custom category on the active linked list, checked off
  // now so its survival through the resyncs below is a real, provable
  // fixture rather than an assertion left to the reviewer's trust.
  const extras = await ensureCategory(ownerId, "[QA] Extras");
  const sparklingWater = await listService.addManualGroceryItem(
    ownerId,
    listCId,
    { name: "Sparkling water", categoryId: extras.id },
  );
  await listService.toggleGroceryItem(ownerId, listCId, sparklingWater.id);

  // Reversible substitute selection on the Meal-Plan-linked list — a
  // second, independent instance of the same Bell pepper/Poblano
  // substitute List A (grocery.ts) already exercises on the standalone
  // list.
  const bellPepperC = await prisma.groceryListItem.findFirst({
    where: { groceryListId: listCId, name: "Bell pepper" },
  });
  if (bellPepperC) {
    await listService.selectGroceryItemVariant(
      ownerId,
      listCId,
      bellPepperC.id,
      "SUBSTITUTE",
    );
  }

  // Check an item tied to E1 before its target yield changes below — the
  // exact "checked item whose contribution later changed" fixture.
  // "Broccoli florets" is a direct Weeknight Stir-Fry ingredient no other
  // Plan1 entry produces and carries no substitute, so this item has
  // exactly one, plain contribution (E1's own) and is guaranteed to flip
  // fully to CHANGED — deliberately a different ingredient from Bell
  // pepper's substitute-selection fixture below, since stacking both on
  // one item left the substitute-selected item reading UNCHANGED instead
  // (worth an owner/architecture follow-up, not resolved here).
  const e1Item = await itemForEntryIngredient(listCId, e1, "Broccoli florets");
  await listService.toggleGroceryItem(ownerId, listCId, e1Item.id);

  // A second, independent single-contribution Stir-Fry-only ingredient
  // ("Chicken thigh" appears nowhere else in the seed's recipes/parts, so
  // this item is guaranteed to flip fully to CHANGED same as Broccoli
  // florets above) — checked off now, then deliberately left unacknowledged
  // after the mutation below, so the review dataset has one acknowledged
  // and one unacknowledged CHANGED example side by side (both keep showing
  // the "Plan changed" badge — acknowledgeGroceryItemSync only clears the
  // "Acknowledge" prompt, never the syncFlag itself; see
  // docs/SEED_REVIEW_GUIDE.md's "Linked-list sync states").
  const e1ItemUnacknowledged = await itemForEntryIngredient(
    listCId,
    e1,
    "Chicken thigh",
  );
  await listService.toggleGroceryItem(
    ownerId,
    listCId,
    e1ItemUnacknowledged.id,
  );

  // Check an item tied to E5 before it's removed below — the exact
  // "checked item whose contribution later disappeared" fixture (§81's
  // schema design this whole mechanism exists to prove, round-2
  // Correction 5). "Garlic powder" is quantity-less/approximate, which
  // `combine.ts` never auto-combines (§61.2) — every occurrence, including
  // E5's own, is already its own single-contribution item, so removing E5
  // is guaranteed to flip this exact item fully to REMOVED.
  const e5Item = await itemForEntryIngredient(listCId, e5, "Garlic powder");
  await listService.toggleGroceryItem(ownerId, listCId, e5Item.id);

  // Freeze List D now, before the mutations below — `resyncGroceryListFromMealPlan`
  // skips any list with `completedAt` set (§81.5), so List D stays a
  // stable pre-mutation snapshot for direct comparison against List C.
  const listDItems = await prisma.groceryListItem.findMany({
    where: { groceryListId: listDId },
  });
  for (const item of listDItems.slice(0, 3)) {
    await listService.toggleGroceryItem(ownerId, listDId, item.id);
  }
  await listService.completeGroceryList(ownerId, listDId);

  // Trigger the REMOVED flag first (checkoff kept, `syncFlag` mirrors it).
  // Order matters: `REMOVED` is sticky across later resyncs (an
  // already-REMOVED contribution is skipped, never re-flagged), but
  // `CHANGED` is recomputed fresh on every resync and reverts to ACTIVE
  // the moment nothing further differs — so the CHANGED-triggering
  // mutation below must run *last*, or this unrelated removal's own
  // resync would settle Broccoli florets back to ACTIVE before the seed
  // ever finishes.
  await mealPlanService.removeMealPlanEntry(ownerId, plan1Id, e5);
  // Trigger the CHANGED flag on every Stir-Fry-sourced item, including both
  // e1Item (Broccoli florets) and e1ItemUnacknowledged (Chicken thigh)
  // above — previous quantity preserved, checkoff kept.
  await mealPlanService.updateMealPlanEntry(ownerId, plan1Id, e1, {
    targetYieldQuantity: 8,
    targetYieldUnit: "servings",
  });

  // Acknowledge only Broccoli florets; Chicken thigh and the REMOVED Garlic
  // powder item above stay unacknowledged — three distinguishable sync
  // states reviewable side by side (acknowledged CHANGED, unacknowledged
  // CHANGED, unacknowledged REMOVED).
  await listService.acknowledgeGroceryItemSync(ownerId, listCId, e1Item.id);

  // --- Duplicated, independent plan --------------------------------------
  await mealPlanService.duplicateMealPlan(ownerId, plan1Id, {
    title: "[QA] Duplicated Next Month",
    startDate: daysFromNow(28),
    endDate: daysFromNow(36),
  });
}
