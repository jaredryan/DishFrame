import { startCookingSession, endCookingSession } from "@/lib/cooking/service";
import { saveSessionReview, updateCookingNotes } from "@/lib/reviews/service";
import { archiveTaster } from "@/lib/tasters/service";
import type { SaveSessionReviewInput } from "@/lib/reviews/schema";
import { unitsFor, sessionUnits, checkItems } from "./cooking";
import type { CookingFixtureIds } from "./cooking";
import type { TasterFixtureIds } from "./tasters";
import type { RamenFixture } from "./ramen";

function reviewInput(
  sessionId: string,
  overrides: Partial<SaveSessionReviewInput> = {},
): SaveSessionReviewInput {
  return {
    sessionId,
    whatWentWell: null,
    whatDidNotGoWell: null,
    anythingElse: null,
    actualAmountQuantity: null,
    actualAmountUnit: null,
    reviewAdjustedDurationSeconds: null,
    ratings: [],
    ...overrides,
  };
}

/**
 * Builds "[QA] Sunday Ramen Project"'s own Cooking Session — done here
 * (not in `cooking.ts`) since the Ramen fixture is only available after
 * `buildRamenFixture` runs, later in `seed.ts`'s pipeline, and this session
 * exists purely to host the flagship multi-Taster Review below.
 */
async function buildRamenSession(
  ownerId: string,
  ramen: RamenFixture,
): Promise<string> {
  const units = await unitsFor(ownerId, ramen.dishId);
  const session = await startCookingSession(ownerId, {
    dishId: ramen.dishId,
    dishVersionId: ramen.currentVersionId,
    scaleFactor: 2,
    units: units.map((u) => ({ unitKey: u.unitKey })),
  });
  const persistedUnits = await sessionUnits(session.id);
  for (const unit of persistedUnits) {
    await checkItems(ownerId, session.id, unit.id, unit.checklistItems.length);
  }
  await endCookingSession(ownerId, session.id, "COMPLETED");
  return session.id;
}

/**
 * Reviews, Cooking notes, and ratings across the sessions `cooking.ts`
 * (Slices 7-8) and `buildRamenSession` above (Slice 15's Ramen flagship)
 * created — covers completed sessions with and without a Review, rated
 * vs. unrated Tasters per session, and archived-Taster rating history
 * (PRODUCT_SPEC.md §31-42).
 */
export async function applyReviewFixtures(
  ownerId: string,
  cooking: CookingFixtureIds,
  tasters: TasterFixtureIds,
  ramen: RamenFixture,
): Promise<void> {
  // S1 (Weeknight Stir-Fry) is still IN_PROGRESS — Cooking notes are
  // independent of the Review and editable regardless of session state.
  await updateCookingNotes(
    ownerId,
    cooking.stirfrySessionId,
    "Doubling the sauce next time — everyone wanted extra.",
  );

  // S3 (Rice Side Dish, ENDED_EARLY): notes + a rating-only Review, no
  // text — proves an Ended-early session's rating counts normally
  // (PRODUCT_SPEC.md §36.6).
  await updateCookingNotes(
    ownerId,
    cooking.ricesidedishSessionId,
    "Ran out of time before the sauce finished reducing.",
  );
  await saveSessionReview(
    ownerId,
    reviewInput(cooking.ricesidedishSessionId, {
      ratings: [{ tasterId: tasters.you, value: 3 }],
    }),
  );

  // S4 (Peanut Noodle Salad #1, nested Seasoning included): the flagship
  // full-text Review — three Tasters, one of them (Former Roommate)
  // archived immediately afterward to leave real archived-Taster rating
  // history (PRODUCT_SPEC.md §34.5).
  await saveSessionReview(
    ownerId,
    reviewInput(cooking.noodlesaladSessionId, {
      whatWentWell: "The sauce-to-noodle ratio was perfect this time.",
      whatDidNotGoWell: "Noodles stuck together a bit while cooling.",
      anythingElse: "Try rinsing with more cold water next time.",
      actualAmountQuantity: 3,
      actualAmountUnit: "servings",
      reviewAdjustedDurationSeconds: 20 * 60,
      ratings: [
        { tasterId: tasters.you, value: 5 },
        { tasterId: tasters.partner, value: 4 },
        { tasterId: tasters.formerRoommate, value: 3 },
      ],
    }),
  );
  await archiveTaster(ownerId, tasters.formerRoommate);

  // S4b (Peanut Noodle Salad #2, nested Seasoning omitted): rating-only,
  // a single Taster — Partner/Kid genuinely unrated for this session.
  await saveSessionReview(
    ownerId,
    reviewInput(cooking.noodlesaladSessionId2, {
      ratings: [{ tasterId: tasters.you, value: 4 }],
    }),
  );

  // S5 (Sunday Ramen Project): a second full-text, multi-Taster Review —
  // the learning-loop/Stage-suggestion showcase (already ACTIVE stage, so
  // the suggestion banner has nothing further to offer here; see Peanut
  // Noodle Salad's PROVEN stage above for that fixture instead).
  const ramenSessionId = await buildRamenSession(ownerId, ramen);
  await updateCookingNotes(
    ownerId,
    ramenSessionId,
    "Broth needed another 10 minutes to fully round out.",
  );
  await saveSessionReview(
    ownerId,
    reviewInput(ramenSessionId, {
      whatWentWell: "Broth flavor was rich and the noodles were perfect.",
      whatDidNotGoWell: "Garlic confit topping was a little too intense.",
      anythingElse: "Worth the weekend project time.",
      actualAmountQuantity: 2,
      actualAmountUnit: "servings",
      reviewAdjustedDurationSeconds: 75 * 60,
      ratings: [
        { tasterId: tasters.you, value: 5 },
        { tasterId: tasters.partner, value: 5 },
        { tasterId: tasters.kid, value: 4 },
      ],
    }),
  );
}
