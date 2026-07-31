import { z } from "zod";

/**
 * Typed domain errors thrown by service/action functions, per
 * ARCHITECTURE_PROPOSAL.md §K.10. Server Actions catch these and return a
 * consistent `{ ok: false, code, message }` shape rather than letting a raw
 * thrown error cross the server/client boundary as an opaque digest.
 */

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have access to this.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class ValidationError extends Error {
  constructor(message = "Invalid input.") {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  constructor(message = "This action conflicts with existing data.") {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * PRODUCT_SPEC.md §74.2: thrown by `deletePart` when current usages still
 * exist — a distinguishable subtype of `ValidationError` (still caught by
 * every existing `instanceof ValidationError` check/`toActionErrorMessage`)
 * so `deleteDish`'s action can additionally detect this specific case and
 * route the UI into the usage-resolution flow instead of a plain error.
 */
export class PartHasLiveUsagesError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "PartHasLiveUsagesError";
  }
}

/**
 * PRODUCT_SPEC.md §26.2/§26.3: thrown by `startCookingSession` when the
 * partial unique index (`one_active_session_per_dish`) rejects a duplicate
 * "Start cooking" for a Dish that already has an In-progress session — the
 * database is the authoritative concurrency guard (Gate 4), this is only
 * the friendly mapping. Carries the existing session's id so the action
 * layer can offer Resume without a second query racing the same check.
 */
export class ActiveSessionConflictError extends ConflictError {
  existingSessionId: string | null;
  constructor(existingSessionId: string | null) {
    super("A cooking session is already in progress for this item.");
    this.name = "ActiveSessionConflictError";
    this.existingSessionId = existingSessionId;
  }
}

/**
 * PRODUCT_SPEC.md §27.4: thrown by `removeSessionUnit` when removing the
 * requested unit would leave the active plan empty — the removal is never
 * committed in this case; the action layer surfaces the documented
 * Delete-session/Keep-editing choice instead.
 */
export class FinalUnitGuardError extends ValidationError {
  constructor(message = "This is the last active unit in this session.") {
    super(message);
    this.name = "FinalUnitGuardError";
  }
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; message: string };

/** Maps a typed domain error (or unknown error) to a safe, user-facing message. */
export function toActionErrorMessage(error: unknown): string {
  if (
    error instanceof NotFoundError ||
    error instanceof AuthorizationError ||
    error instanceof ValidationError ||
    error instanceof ConflictError
  ) {
    return error.message;
  }
  // A Zod parse failure is an expected validation outcome (bad/incomplete
  // user input), not an unexpected server failure — surface the first
  // issue's own message (e.g. "Enter a name for the substitute.") instead
  // of the generic fallback below, which is reserved for genuinely
  // unanticipated errors (docs/GATE_2_REMEDIATION.md).
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Please check your input and try again.";
  }
  console.error("[action] Unexpected error:", error);
  return "Something went wrong. Please try again.";
}
