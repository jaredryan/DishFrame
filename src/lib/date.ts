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

// Digit groups only — accepts "2026-09-01", "2026/09/01", "9/1/2026", and
// "09/01/2026" (ISO year-first when the first group is 4 digits, otherwise
// US month/day/year), rejecting anything else outright rather than guessing.
const TYPED_DATE_PATTERN = /^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})$/;

/**
 * Parses free-typed date text from a directly-typeable date field (Meal Plan
 * QA redesign §1) into an ISO `yyyy-mm-dd` string, or `null` if `text` isn't
 * a recognizable/valid calendar date. Deliberately narrow — two unambiguous
 * shapes only — rather than a general date-parsing library, since a
 * misread third format silently saving the wrong day is worse than making
 * the user retype it.
 */
export function parseTypedDateInput(text: string): string | null {
  const match = text.trim().match(TYPED_DATE_PATTERN);
  if (!match) return null;
  const [, a, b, c] = match;
  const yearFirst = a.length === 4;
  const year = Number(yearFirst ? a : c);
  const month = Number(yearFirst ? b : a);
  const day = Number(yearFirst ? c : b);
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  // `Date` normalizes an out-of-range day (e.g. Feb 30) by rolling into the
  // next month instead of throwing — reject that instead of silently
  // saving a different date than what was typed.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return toIsoDateOnly(date);
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
