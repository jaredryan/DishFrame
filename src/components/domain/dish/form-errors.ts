/**
 * Looks up a field-level error message at a runtime-built dot path (e.g.
 * `sections.0.ingredients.1.substitute.name`) inside react-hook-form's
 * `formState.errors`. A plain path-walk rather than RHF's typed
 * `FieldErrors<T>` API, for the same reason ingredient-fields.tsx's
 * `useFormContext()` stays untyped — these paths are built from array
 * indices react-hook-form's literal `FieldPath<T>` type can't express.
 */
export function getFieldErrorMessage(
  errors: unknown,
  path: string,
): string | undefined {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, errors);
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}
