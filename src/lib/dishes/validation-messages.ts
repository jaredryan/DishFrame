import { z } from "zod";
import { dishContentSchema, type DishContentInput } from "@/lib/dishes/schema";

/**
 * Importer live-QA polish pass (task §9): `dishContentSchema.parse`
 * failures were surfacing to the user as Zod's raw default message —
 * "Too big: expected string to have <=200 characters" — with no field or
 * location context. Root cause of the specific `<=200` failures reported
 * from a real Recipe Gallery migration was in the parser itself (see
 * `paste-parser.ts`'s `INGREDIENT_NAME_MAX_LENGTH` comment) and is fixed
 * there; this module is the general-purpose translation from a
 * `dishContentSchema` Zod issue to a human-readable, field-specific
 * message, used both for surfacing a persistence failure (task's own
 * "Ingredient name must be 200 characters or fewer." example) and for the
 * bulk-import preflight check (task §10) that runs the same schema against
 * a batch of pending drafts before persistence starts.
 */

type ZodContentIssue = z.ZodError["issues"][number];

function ordinal(index: number): string {
  return `${index + 1}`;
}

function truncateForDisplay(value: string, maxLength = 40): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function lengthLimitPhrase(issue: ZodContentIssue): string | null {
  if (issue.code === "too_big" && "maximum" in issue) {
    return `must be ${issue.maximum} characters or fewer`;
  }
  if (issue.code === "too_small" && "minimum" in issue && issue.minimum > 0) {
    return "is required";
  }
  return null;
}

/**
 * Describes one `dishContentSchema` Zod issue in plain language, naming the
 * specific ingredient/instruction/section where possible (task §9: "Where
 * possible, identify the specific ingredient, section, instruction, or
 * other offending value"). `values` is optional context (the draft being
 * validated) used only to look up a human-friendly name/preview for the
 * offending row — the message still degrades gracefully without it.
 */
export function describeDishContentIssue(
  issue: ZodContentIssue,
  values?: DishContentInput,
): string {
  const path = issue.path;
  const limitPhrase = lengthLimitPhrase(issue);

  if (path[0] === "title") {
    return `Title ${limitPhrase ?? "is invalid"}.`;
  }
  if (path[0] === "description") {
    return `Description ${limitPhrase ?? "is invalid"}.`;
  }
  if (path[0] === "yieldUnit") {
    return `Yield unit ${limitPhrase ?? "is invalid"}.`;
  }

  if (path[0] === "sections" && typeof path[1] === "number") {
    const sectionIndex = path[1];
    const section = values?.sections[sectionIndex];
    const sectionLabel = section?.name
      ? `"${truncateForDisplay(section.name)}"`
      : `Section ${ordinal(sectionIndex)}`;

    if (path[2] === "name") {
      return `${sectionLabel}'s name ${limitPhrase ?? "is invalid"}.`;
    }

    if (path[2] === "ingredients" && typeof path[3] === "number") {
      const ingredientIndex = path[3];
      const field = path[4];
      const ingredient = section?.ingredients[ingredientIndex];
      const preview = ingredient?.name
        ? `"${truncateForDisplay(ingredient.name)}"`
        : `ingredient ${ordinal(ingredientIndex)}`;
      const fieldLabel =
        field === "name"
          ? "Ingredient name"
          : field === "unit"
            ? "Unit"
            : field === "preparationNote"
              ? "Preparation note"
              : field === "displayText"
                ? "Amount text"
                : "This field";
      return `${fieldLabel} for ${preview} in ${sectionLabel} ${limitPhrase ?? "is invalid"}.`;
    }

    if (path[2] === "instructions" && typeof path[3] === "number") {
      const instructionIndex = path[3];
      return `Instruction ${ordinal(instructionIndex)} in ${sectionLabel} ${limitPhrase ?? "is invalid"}.`;
    }
  }

  // Fallback: still better than nothing, but no longer the *only* message.
  return issue.message;
}

export type DishContentValidationResult =
  { ok: true } | { ok: false; messages: string[] };

/**
 * Runs the exact persistence-time schema against an already-normalized
 * draft — used by the bulk-import preflight check (task §10) so a
 * validation failure is surfaced *before* a long-running bulk import
 * starts, identifying the specific problem instead of only being
 * discoverable after persistence fails partway through a batch.
 */
export function validateDishContentForPersistence(
  values: DishContentInput,
): DishContentValidationResult {
  const result = dishContentSchema.safeParse(values);
  if (result.success) return { ok: true };
  return {
    ok: false,
    messages: result.error.issues.map((issue) =>
      describeDishContentIssue(issue, values),
    ),
  };
}
