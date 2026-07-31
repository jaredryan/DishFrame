import { getServerSession } from "@/lib/auth/session";
import { buildAccountBackupDto } from "@/lib/importExport/export-dto";

/**
 * PRODUCT_SPEC.md §55.1: the full private account backup — computed
 * synchronously and streamed back (ARCHITECTURE_PROPOSAL.md §L, "no
 * persistent export-job table at this scale"). Owner authorization applies
 * to every private read, per Slice 11's scope: only the signed-in owner's
 * own data is ever queried (`buildAccountBackupDto` is scoped by
 * `ownerId` throughout), and there is no `dishId`-style route param here
 * for a malformed request to redirect at another account's data.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ message: "Sign in required." }, { status: 401 });
  }

  const backup = await buildAccountBackupDto(session.user.id);
  const body = JSON.stringify(backup, null, 2);
  const filename = `dishframe-backup-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
