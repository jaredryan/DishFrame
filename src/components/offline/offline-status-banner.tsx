"use client";

import { useOffline } from "next/offline";
import { useSyncStatus } from "@/lib/offline/hooks";

/**
 * A single, quiet status line — mirrors `CookingModeShell`'s own existing
 * `role="alert"` banner pattern (same component, not a new visual
 * language) rather than inventing a separate "offline mode" UI. Renders
 * nothing when online with nothing pending, so normal use is unaffected
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md's "should feel like normal
 * DishFrame wherever possible").
 */
export function OfflineStatusBanner() {
  const isOffline = useOffline();
  const status = useSyncStatus();

  if (
    !isOffline &&
    status.pending === 0 &&
    status.syncing === 0 &&
    status.failed === 0
  ) {
    return null;
  }

  const message = isOffline
    ? status.pending > 0
      ? `Offline — ${status.pending} change${status.pending === 1 ? "" : "s"} will sync when you're back online.`
      : "Offline — showing what's saved on this device."
    : status.syncing > 0
      ? "Syncing your offline changes…"
      : status.failed > 0
        ? `${status.failed} change${status.failed === 1 ? "" : "s"} couldn't sync — open Sync status to retry.`
        : null;

  if (!message) return null;

  return (
    <p
      role="status"
      className="text-muted-foreground bg-background border-border border-b px-4 py-2 text-sm"
    >
      {message}
    </p>
  );
}
