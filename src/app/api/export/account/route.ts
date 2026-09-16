import { getServerSession } from "@/lib/auth/session";
import { buildAccountBackupDto } from "@/lib/importExport/export-dto";
import { consumeRateLimit } from "@/lib/rate-limit/limit";

/**
 * PRODUCT_SPEC.md §55.1: a structured export of the user's own account
 * data — computed synchronously and streamed back
 * (ARCHITECTURE_PROPOSAL.md §L, "no persistent export-job table at this
 * scale"). This is a data export, not a restorable backup: no image
 * binaries and no restore/import path exist yet. Owner authorization applies to every private read,
 * per Slice 11's scope: only the signed-in owner's own data is ever
 * queried (`buildAccountBackupDto` is scoped by `ownerId` throughout), and
 * there is no `dishId`-style route param here for a malformed request to
 * redirect at another account's data.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ message: "Sign in required." }, { status: 401 });
  }

  const rateLimit = await consumeRateLimit(`export:${session.user.id}`, {
    max: 20,
    windowSeconds: 10 * 60,
  });
  if (!rateLimit.allowed) {
    return Response.json(
      { message: "Too many exports. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const dto = await buildAccountBackupDto(session.user.id);
  const body = JSON.stringify(dto, null, 2);
  const filename = `dishframe-account-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
