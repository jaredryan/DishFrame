import { handleSyncPush } from "@/lib/offline-sync/http";
import { mealPlanSyncOps } from "@/lib/offline-sync/mealplans";

export async function POST(request: Request): Promise<Response> {
  return handleSyncPush(request, mealPlanSyncOps);
}
