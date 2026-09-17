import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  ConflictError,
} from "@/lib/errors";

/**
 * Shared plumbing for the `/api/sync/*` stable mutation-replay surface
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md). Each domain route
 * (`app/api/sync/{dishes,cooking,mealplans,grocery}/route.ts`) supplies a
 * small registry mapping its own `op` names to a handler that calls the
 * exact same service-layer function the online Server Action already
 * calls — this file owns only what's identical across all four: auth,
 * idempotency-receipt lookup/recording, and domain-error-to-HTTP-status
 * mapping (mirroring `toActionErrorMessage`'s classification, just
 * expressed as status codes instead of a Server Action's `{ok:false}`).
 */

export type SyncMutationHandler = (
  userId: string,
  entityId: string,
  payload: unknown,
) => Promise<{
  entityType: string;
  entityId: string;
  snapshot: unknown;
  serverRevision: string | null;
  /** Op-specific extra data that isn't part of the replicated entity
   * snapshot — e.g. `mealplan.resyncGroceryLists`' added/removed/changed
   * counts. Unused by nearly every handler; passed through verbatim. */
  meta?: unknown;
}>;

export type SyncOpRegistry = Record<string, SyncMutationHandler>;

const requestSchema = z.object({
  mutationId: z.string().min(1),
  op: z.string().min(1),
  entityId: z.string().min(1),
  payload: z.unknown(),
});

function jsonWithStatus(body: unknown, status: number): Response {
  return NextResponse.json(body, { status });
}

export async function handleSyncPush(
  request: Request,
  registry: SyncOpRegistry,
): Promise<Response> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return jsonWithStatus({ message: "Sign in required." }, 401);
  }

  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return jsonWithStatus({ message: "Malformed sync request." }, 400);
  }
  const { mutationId, op, entityId, payload } = parsed.data;

  // Idempotency: a hit means this exact mutation already ran (successfully
  // or with a terminal failure) — replay the stored HTTP outcome verbatim
  // rather than re-invoking the handler, so a retried request after an
  // ambiguous network failure (response lost, mutation already applied)
  // can never double-apply. Scoped by `userId` too: a receipt id belonging
  // to a different account is treated as if it didn't exist (defense in
  // depth against an implausible client-UUID collision).
  const existingReceipt = await prisma.syncMutationReceipt.findUnique({
    where: { id: mutationId },
  });
  if (existingReceipt && existingReceipt.userId === userId) {
    return jsonWithStatus(
      existingReceipt.resultJson,
      Number(existingReceipt.status),
    );
  }

  const handler = registry[op];
  if (!handler) {
    return jsonWithStatus({ message: `Unknown sync operation "${op}".` }, 400);
  }

  try {
    const result = await handler(userId, entityId, payload);
    const body = {
      status: "applied" as const,
      entityId: result.entityId,
      snapshot: result.snapshot,
      serverRevision: result.serverRevision,
      meta: result.meta,
    };
    await prisma.syncMutationReceipt.create({
      data: {
        id: mutationId,
        userId,
        op,
        status: "200",
        resultJson: body as unknown as Prisma.InputJsonValue,
      },
    });
    return jsonWithStatus(body, 200);
  } catch (error) {
    return recordAndRespondError(error, { mutationId, userId, op });
  }
}

async function recordAndRespondError(
  error: unknown,
  ctx: { mutationId: string; userId: string; op: string },
): Promise<Response> {
  let status: number;
  let body: { message: string };

  if (error instanceof ConflictError) {
    status = 409;
    body = { message: error.message };
  } else if (error instanceof NotFoundError) {
    status = 404;
    body = { message: error.message };
  } else if (error instanceof AuthorizationError) {
    status = 403;
    body = { message: error.message };
  } else if (error instanceof ValidationError) {
    status = 422;
    body = { message: error.message };
  } else if (error instanceof z.ZodError) {
    status = 422;
    body = { message: error.issues[0]?.message ?? "Invalid input." };
  } else {
    console.error(`[sync:${ctx.op}] Unexpected error:`, error);
    status = 500;
    body = { message: "Something went wrong. Please try again." };
  }

  // A 500 is deliberately not recorded as a receipt — it may be transient
  // (a dropped DB connection), so a retry with the same idempotency key
  // should genuinely try again, not replay a stale failure forever. Every
  // other outcome here is a stable classification of the input/state
  // itself and is safe (indeed, necessary) to replay verbatim.
  if (status !== 500) {
    await prisma.syncMutationReceipt
      .create({
        data: {
          id: ctx.mutationId,
          userId: ctx.userId,
          op: ctx.op,
          status: String(status),
          resultJson: body as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
  }
  return jsonWithStatus(body, status);
}
