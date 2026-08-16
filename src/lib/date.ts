/**
 * Calendar-date (no time component) helpers. A date-only value like a Meal
 * Plan's startDate/endDate or an entry's cookDate is stored/serialized as a
 * UTC-midnight `DateTime`. Reading it back with the ordinary
 * `new Date(iso)` → `.toLocaleDateString()` path re-interprets that UTC
 * instant in the *viewer's* zone, which rolls the displayed day back by one
 * for any negative UTC-offset viewer (e.g. "2026-08-26T00:00:00.000Z" reads
 * as Aug 25 in US Pacific). `parseDateOnly`/`formatDateOnly` sidestep this
 * by reading the UTC/ISO calendar-date components directly and building a
 * local-midnight `Date` from them, so formatting never crosses a zone
 * boundary.
 */
export function parseDateOnly(value: string | Date): Date {
  if (typeof value === "string") {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

/** The inverse of `parseDateOnly` — a local `Date`'s own calendar-date
 * components, not `toISOString()`'s UTC ones (which can read as tomorrow or
 * yesterday depending on the viewer's offset and time of day). */
export function toIsoDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateOnly(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  },
): string {
  return parseDateOnly(value).toLocaleDateString(undefined, options);
}
