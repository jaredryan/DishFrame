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
  console.error("[action] Unexpected error:", error);
  return "Something went wrong. Please try again.";
}
