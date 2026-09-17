import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import {
  listAllDishSnapshots,
  buildDishLibraryOptionsSnapshot,
} from "@/lib/offline-sync/dishes";
import { listAllCookingSessionSnapshots } from "@/lib/offline-sync/cooking";
import {
  listAllMealPlanSnapshots,
  buildMealPlanEditorOptionsSnapshot,
} from "@/lib/offline-sync/mealplans";
import { listAllGroceryListSnapshots } from "@/lib/offline-sync/grocery";
import type { SyncEntitySnapshot } from "@/lib/offline/types";

/**
 * Full account snapshot (docs/OFFLINE_IMPLEMENTATION_PLAN.md's "Data
 * synchronization/bootstrap"): one request ships everything the offline-
 * capable domains need, rather than one request per Dish/session/plan/list
 * — the explicit "do not issue a wasteful request per recipe" requirement.
 * Runs once on first authenticated load (or after an account-switch wipe);
 * `/api/sync/pull` handles cheaper incremental refreshes after that.
 */
export async function GET(): Promise<Response> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  const [
    dishes,
    sessions,
    mealPlans,
    groceryLists,
    mealPlanEditorOptions,
    dishLibraryOptions,
  ] = await Promise.all([
    listAllDishSnapshots(userId),
    listAllCookingSessionSnapshots(userId),
    listAllMealPlanSnapshots(userId),
    listAllGroceryListSnapshots(userId),
    buildMealPlanEditorOptionsSnapshot(userId),
    buildDishLibraryOptionsSnapshot(userId),
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
      id: (g.doc as { list: { id: string } }).list.id,
      doc: g.doc,
      serverRevision: g.serverRevision,
    })),
    {
      entityType: "referenceData" as const,
      id: "mealPlanEditorOptions",
      doc: mealPlanEditorOptions.doc,
      serverRevision: mealPlanEditorOptions.serverRevision,
    },
    {
      entityType: "referenceData" as const,
      id: "dishLibraryOptions",
      doc: dishLibraryOptions.doc,
      serverRevision: dishLibraryOptions.serverRevision,
    },
  ];

  return NextResponse.json({ syncedAt: new Date().toISOString(), entities });
}
