"use client";

import * as React from "react";
import { reconcileAccountScope } from "@/lib/offline/account-scope";

/**
 * Reconciles offline storage against the currently-authenticated account on
 * every app boot (docs/OFFLINE_IMPLEMENTATION_PLAN.md §6.2) — mounted from
 * the root layout, which every route (including marketing/auth/share pages
 * that never check for a session) passes through, so an unauthenticated
 * render always reaches this, not only the explicit Sign Out button.
 *
 * `authenticatedUserId` comes from a Server Component's own
 * `getServerSession()` call (root layout) — the session cookie is httpOnly,
 * so client code has no other way to learn who's signed in.
 */
export function OfflineAccountBoot({
  authenticatedUserId,
}: {
  authenticatedUserId: string | null;
}) {
  React.useEffect(() => {
    void reconcileAccountScope(authenticatedUserId);
  }, [authenticatedUserId]);

  return null;
}
