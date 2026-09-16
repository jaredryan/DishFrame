import { handleSyncPush } from "@/lib/offline-sync/http";
import { dishSyncOps } from "@/lib/offline-sync/dishes";

export async function POST(request: Request): Promise<Response> {
  return handleSyncPush(request, dishSyncOps);
}
