/**
 * Slice 22: the one shared email-normalization helper — every recipient
 * lookup, direct-share send, and invitation claim compares emails through
 * this function, never an ad hoc `.toLowerCase()`. Matches the normalization
 * `sharing/schema.ts`'s zod pipelines already applied inline
 * (`.trim().toLowerCase()`) before this helper existed, so no stored data
 * changes shape.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
