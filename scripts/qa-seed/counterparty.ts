import type { createDish as CreateDish } from "@/lib/dishes/service";
import type { DishContentInput } from "@/lib/dishes/schema";
import { section } from "./parts";

/**
 * A second, fully independent local QA account — never signed into during
 * ordinary review — that exists only so cross-account sharing (Slice 16/17)
 * has a real counterparty to share with/from. `.invalid` is an IANA-reserved
 * TLD (RFC 2606) that can never resolve to a real registrable domain, so
 * this can never collide with an owner's actual personal account.
 * `resolveSeedOwner` (owner.ts) is reused as-is to create/repair it — the
 * same idempotent upsert + `initializeNewUser` path the primary QA account
 * gets, just under a second email.
 */
export const QA_COUNTERPARTY_EMAIL = "qa-counterparty@dishframe.invalid";
export const QA_COUNTERPARTY_NAME = "[QA] Counterparty";

export type CounterpartyServices = { createDish: typeof CreateDish };

export type CounterpartyFixtureIds = { pastaDishId: string };

/**
 * One small Recipe owned by the counterparty — the minimum content needed
 * for it to act as a real *sender* (Slice 17's "pending received"/"accepted
 * copy visible in the primary account's library" fixtures require the
 * counterparty to own something it can share, not just receive). Reused
 * across three separate sends in `sharing.ts` rather than duplicated, since
 * each prior send is terminal (accepted/declined/canceled) before the next
 * begins.
 */
export async function buildCounterpartyContentFixtures(
  { createDish }: CounterpartyServices,
  counterpartyId: string,
): Promise<CounterpartyFixtureIds> {
  const content: DishContentInput = {
    title: "[QA] Counterparty Pasta Night",
    stage: "ACTIVE",
    cuisine: "Italian",
    description: "A quick weeknight pasta, from the QA counterparty account.",
    yieldQuantity: 2,
    yieldUnit: "servings",
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          {
            name: "Spaghetti",
            quantity: 200,
            unit: "g",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Olive oil",
            quantity: 2,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Garlic",
            quantity: 2,
            unit: "cloves",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [
          { text: "Cook spaghetti according to package directions." },
          { text: "Warm olive oil and garlic in a pan until fragrant." },
          { text: "Toss the drained pasta through the garlic oil." },
        ],
      }),
    ],
    partLinks: [],
  };
  const pastaDishId = await createDish(counterpartyId, "RECIPE", content);
  return { pastaDishId };
}
