import { NextResponse } from "next/server";
import { env } from "@/lib/env/server";
import { cleanupAbandonedImageAssets } from "@/lib/images/service";

/**
 * Vercel Cron endpoint (`vercel.json`, daily) — sweeps `ImageAsset` rows
 * abandoned mid-edit (see `cleanupAbandonedImageAssets`'s own doc comment
 * in `src/lib/images/service.ts` for the lifecycle gap this closes).
 *
 * Authorized the standard Vercel Cron way: Vercel sends `Authorization:
 * Bearer $CRON_SECRET` automatically on Cron-triggered requests once
 * `CRON_SECRET` is set as a project env var
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 * Any request without a matching header is rejected before doing any work
 * or revealing anything about what the sweep would have done — this is not
 * an unauthenticated public mutation endpoint.
 */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Cron cleanup is not configured." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await cleanupAbandonedImageAssets();
  return NextResponse.json({ status: "ok", ...result });
}
