import { handleSyncPush } from "@/lib/offline-sync/http";
import { cookingSyncOps } from "@/lib/offline-sync/cooking";

export async function POST(request: Request): Promise<Response> {
  return handleSyncPush(request, cookingSyncOps);
}
