/**
 * Version-note text generation and normalization — centralized here so
 * `service.ts` (seeding on a MAJOR bump) and `updateVersionNote` (normalizing
 * a manually-saved note) share one definition of what a "generated prefix"
 * looks like, rather than each re-deriving the pattern (Slice 4 correction
 * pass §4).
 *
 * PRODUCT_SPEC.md §14.2: the seeded text always reads source → result,
 * differentiated only by a trailing word — "Revision" for an ordinary
 * sequential major bump from what was already the current line, "Revival"
 * for a major created from (or promoted from) a historical direction. Both
 * forms are seeded only on a MAJOR bump (§14.2 shows no minor-bump example).
 */

export function versionLabel(
  majorVersion: number,
  minorVersion: number,
): string {
  return `V${majorVersion}.${minorVersion}`;
}

export function seedMajorVersionNote(
  baseMajorVersion: number,
  baseMinorVersion: number,
  newMajorVersion: number,
  baseWasAlreadyCurrentLine: boolean,
): string {
  const baseLabel = versionLabel(baseMajorVersion, baseMinorVersion);
  const newLabel = versionLabel(newMajorVersion, 0);
  const kind = baseWasAlreadyCurrentLine ? "Revision" : "Revival";
  return `${baseLabel} → ${newLabel}: ${kind}`;
}

// Matches exactly a bare "VX.Y → VX.Y:" relationship stamp with nothing
// after the colon — what's left if a user deletes the seeded "Revision"/
// "Revival" word (or hand-types just the relationship) and saves. Never
// matches ordinary authored prose, which won't fit this exact shape.
const BARE_GENERATED_PREFIX_PATTERN = /^V\d+\.\d+ → V\d+\.\d+:$/;

/**
 * §14.1's note is free-form user text; the only special case is a note left
 * as *only* the generated relationship stamp with a trailing colon and
 * nothing after it, which reads as visually unfinished — the colon is
 * dropped so it reads as a plain, complete label instead. Ordinary prose
 * that happens to end in a colon (the user's own words) is left untouched.
 */
export function normalizeVersionNote(note: string | null): string | null {
  const trimmed = note?.trim() || null;
  if (!trimmed) return null;
  return BARE_GENERATED_PREFIX_PATTERN.test(trimmed)
    ? trimmed.slice(0, -1)
    : trimmed;
}
