import { prisma } from "@/lib/db/prisma";
import * as listService from "@/lib/grocery/list-service";
import type { RecipeFixtureIds } from "./recipes";
import type { RamenFixture } from "./ramen";

async function itemsFor(listId: string) {
  return prisma.groceryListItem.findMany({
    where: { groceryListId: listId },
    orderBy: { position: "asc" },
  });
}

/**
 * `createGroceryCategory` (grocery/service.ts) only ever creates — it
 * throws `ConflictError` on a normalized-name collision, which a rerun of
 * this idempotent seed would hit immediately since `wipeExistingFixtures`
 * doesn't touch `GroceryCategory` rows (they aren't `"[QA] "`-Dish-scoped,
 * and deleting them isn't necessary — an upsert here is simpler than
 * adding a third wipe convention). Mirrors `tags-flavor.ts`'s own
 * `ensureTag`/`ensureFlavorProfile` upsert pattern.
 */
export async function ensureCategory(ownerId: string, displayName: string) {
  const normalizedName = displayName.toLowerCase();
  const highestPosition = await prisma.groceryCategory.aggregate({
    where: { ownerId },
    _max: { position: true },
  });
  return prisma.groceryCategory.upsert({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
    update: {},
    create: {
      ownerId,
      normalizedName,
      displayName,
      position: (highestPosition._max.position ?? -1) + 1,
    },
  });
}

/**
 * Standalone grocery lists (Slice 12, PRODUCT_SPEC.md §60-65). List A stays
 * active — every post-generation control gets exercised on it (manual
 * combine across differing optionality, substitute selection, manual
 * items/custom category, recategorization, checkoffs, reordering) so a
 * reviewer can also use it to test refresh behavior later (edit Weeknight
 * Stir-Fry or Rice Bowl Base, then preview/apply a source refresh) without
 * the seed itself performing that refresh. List B is a plain single-source
 * list, fully checked and completed/frozen — the simple contrast case.
 */
export async function buildGroceryFixtures(
  ownerId: string,
  recipes: RecipeFixtureIds,
  ramen: RamenFixture,
): Promise<void> {
  const household = await ensureCategory(ownerId, "[QA] Household");
  const freezer = await ensureCategory(ownerId, "[QA] Bulk & Freezer");

  const listAId = await listService.generateGroceryList(ownerId, {
    title: "[QA] Weeknight Shopping",
    sources: [
      { dishId: recipes.stirfry.dishId, scaleFactor: 1 },
      { dishId: recipes.ricebowl.dishId, scaleFactor: 1.5 },
    ],
  });

  // Manual merge across differing optionality (§61.5) — Rice's optional
  // Salt and the Seasoning Blend's required Salt each auto-combine with
  // their own matching occurrence, landing as two separate "Salt" items
  // (required never auto-combines with optional) with incompatible units
  // (tsp vs. tbsp) — deliberately merged anyway to exercise the
  // concatenated-quantity + "Total (with optional)" display fallback.
  const saltItems = await prisma.groceryListItem.findMany({
    where: { groceryListId: listAId, name: "Salt" },
  });
  if (saltItems.length === 2) {
    await listService.combineGroceryItems(
      ownerId,
      listAId,
      saltItems.map((i) => i.id),
    );
  }

  // Reversible substitute selection (§62.2) — Bell pepper carries the
  // Poblano pepper substitute added in tags-flavor.ts's Stir-Fry edit.
  const bellPepper = await prisma.groceryListItem.findFirst({
    where: { groceryListId: listAId, name: "Bell pepper" },
  });
  if (bellPepper) {
    await listService.selectGroceryItemVariant(
      ownerId,
      listAId,
      bellPepper.id,
      "SUBSTITUTE",
    );
  }

  const paperTowels = await listService.addManualGroceryItem(ownerId, listAId, {
    name: "Paper towels",
    categoryId: household.id,
  });
  await listService.addManualGroceryItem(ownerId, listAId, {
    name: "Aluminum foil",
    categoryId: household.id,
  });
  await listService.toggleGroceryItem(ownerId, listAId, paperTowels.id);

  const chickenThigh = await prisma.groceryListItem.findFirst({
    where: { groceryListId: listAId, name: "Chicken thigh" },
  });
  if (chickenThigh) {
    await listService.recategorizeGroceryItem(
      ownerId,
      listAId,
      chickenThigh.id,
      freezer.id,
    );
    await listService.toggleGroceryItem(ownerId, listAId, chickenThigh.id);
  }

  const broccoli = await prisma.groceryListItem.findFirst({
    where: { groceryListId: listAId, name: "Broccoli florets" },
  });
  if (broccoli) {
    await listService.toggleGroceryItem(ownerId, listAId, broccoli.id);
  }

  // Reorder — reverse the final item set so the list isn't left in plain
  // generation order.
  const finalItems = await itemsFor(listAId);
  await listService.reorderGroceryListItems(
    ownerId,
    listAId,
    finalItems.map((i) => i.id).reverse(),
  );

  // List B — a plain single-source list, fully checked off and completed.
  const listBId = await listService.generateGroceryList(ownerId, {
    title: "[QA] Pantry Restock",
    sources: [{ dishId: ramen.dishId, scaleFactor: 1 }],
  });
  const listBItems = await itemsFor(listBId);
  for (const item of listBItems) {
    await listService.toggleGroceryItem(ownerId, listBId, item.id);
  }
  await listService.completeGroceryList(ownerId, listBId);
}
