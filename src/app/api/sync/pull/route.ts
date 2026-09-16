import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { listChangedDishSnapshots } from "@/lib/offline-sync/dishes";
import { listAllCookingSessionSnapshots } from "@/lib/offline-sync/cooking";
import { listAllMealPlanSnapshots } from "@/lib/offline-sync/mealplans";
import { listAllGroceryListSnapshots } from "@/lib/offline-sync/grocery";
import type { SyncEntitySnapshot } from "@/lib/offline/types";

/**
 * Incremental refresh, called on every app foreground/focus once a full
 * bootstrap has already run. Dishes support a true incremental cursor
 * (`Dish.updatedAt`); Cooking Sessions/Meal Plans/Grocery Lists are
 * re-sent in full every time — a deliberate, documented simplification
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md): Cooking Sessions are already
 * capped to "at most one active per Dish," and Meal Plans/Grocery Lists
 * have no `updatedAt` column yet to diff against (see those domains'
 * offline-sync modules), so a full re-send of these three small
 * collections is simpler and still cheap at realistic account sizes.
 */
export async function GET(request: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(0);

  const [dishes, sessions, mealPlans, groceryLists] = await Promise.all([
    listChangedDishSnapshots(userId, sinceDate),
    listAllCookingSessionSnapshots(userId),
    listAllMealPlanSnapshots(userId),
    listAllGroceryListSnapshots(userId),
  ]);

  const entities: SyncEntitySnapshot[] = [
    ...dishes.map((d) => ({
      entityType: "dish" as const,
      id: d.doc.id,
      doc: d.doc,
      serverRevision: d.serverRevision,
    })),
    ...sessions.map((s) => ({
      entityType: "cookingSession" as const,
      id: s.entityId,
      doc: s.snapshot,
      serverRevision: s.serverRevision,
    })),
    ...mealPlans.map((m) => ({
      entityType: "mealPlan" as const,
      id: (m.doc as { id: string }).id,
      doc: m.doc,
      serverRevision: m.serverRevision,
    })),
    ...groceryLists.map((g) => ({
      entityType: "groceryList" as const,
      id: (g.doc as { id: string }).id,
      doc: g.doc,
      serverRevision: g.serverRevision,
    })),
  ];

  return NextResponse.json({ syncedAt: new Date().toISOString(), entities });
}
