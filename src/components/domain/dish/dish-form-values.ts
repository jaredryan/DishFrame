import { Prisma } from "@/generated/prisma/client";
import type { dishDetailInclude } from "@/lib/dishes/queries";
import type { DishContentInput } from "@/lib/dishes/schema";

// Deliberately not a "use client" module: Server Component edit pages call
// `dishToFormValues` directly (a Client Component's exports cannot be
// invoked from a Server Component, even for a plain, side-effect-free
// function), while `dish-editor.tsx` (itself "use client") re-exports
// these for any client-side callers.
export type DishFormValues = DishContentInput;

type DishDetail = Prisma.DishGetPayload<{ include: typeof dishDetailInclude }>;

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value ? value.toNumber() : null;
}

/**
 * Maps loaded current-Version content into the editor's form shape,
 * preserving each row's `lineageId` so `editDish` carries lineage identity
 * forward for unchanged content (ARCHITECTURE_PROPOSAL.md §D.-1) instead of
 * treating every row as brand new on every edit.
 */
export function dishToFormValues(dish: DishDetail): DishFormValues {
  const version = dish.currentVersion;
  if (!version) {
    throw new Error("Cannot edit a Dish with no current Version.");
  }

  return {
    title: version.title,
    stage: dish.stage,
    cuisine: dish.cuisine,
    description: version.description,
    yieldQuantity: decimalToNumber(version.yieldQuantity),
    yieldUnit: version.yieldUnit,
    prepTimeMinutes: version.prepTimeMinutes,
    cookTimeMinutes: version.cookTimeMinutes,
    difficulty: version.difficulty,
    sections: version.sections.map((section) => ({
      lineageId: section.lineageId,
      name: section.name,
      guidanceNote: section.guidanceNote,
      ingredients: section.ingredients
        .filter((ingredient) => ingredient.substituteForIngredientId === null)
        .map((ingredient) => ({
          lineageId: ingredient.lineageId,
          name: ingredient.name,
          quantity: decimalToNumber(ingredient.quantity),
          quantityEnd: decimalToNumber(ingredient.quantityEnd),
          isApproximate: ingredient.isApproximate,
          unit: ingredient.unit,
          displayText: ingredient.displayText,
          preparationNote: ingredient.preparationNote,
          isOptional: ingredient.isOptional,
          substitute: ingredient.substitute
            ? {
                lineageId: ingredient.substitute.lineageId,
                name: ingredient.substitute.name,
                quantity: decimalToNumber(ingredient.substitute.quantity),
                quantityEnd: decimalToNumber(ingredient.substitute.quantityEnd),
                isApproximate: ingredient.substitute.isApproximate,
                unit: ingredient.substitute.unit,
                displayText: ingredient.substitute.displayText,
                preparationNote: ingredient.substitute.preparationNote,
              }
            : null,
        })),
      instructions: section.instructions.map((instruction) => ({
        lineageId: instruction.lineageId,
        text: instruction.text,
      })),
    })),
  };
}

export function blankDishFormValues(): DishFormValues {
  return {
    title: "",
    stage: "IDEA",
    cuisine: null,
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    sections: [
      { name: null, guidanceNote: null, ingredients: [], instructions: [] },
    ],
  };
}
