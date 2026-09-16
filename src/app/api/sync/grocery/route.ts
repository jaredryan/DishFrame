import { handleSyncPush } from "@/lib/offline-sync/http";
import { grocerySyncOps } from "@/lib/offline-sync/grocery";

export async function POST(request: Request): Promise<Response> {
  return handleSyncPush(request, grocerySyncOps);
}
