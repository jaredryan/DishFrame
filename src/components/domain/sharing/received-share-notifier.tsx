"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { acknowledgeShareNotifications } from "@/lib/preferences/actions";

/**
 * The notification-state half of the received-share toast (kept separate
 * from `Toaster`'s presentation, per the toast infrastructure's own
 * design): decides *whether* and *when* to surface one, `useToast`
 * (Slice: reusable toast infrastructure) renders it. `newShareCount` is a
 * server-computed snapshot from the layout — how many still-PENDING
 * received items arrived since `UserPreference.shareNotificationSeenAt`
 * (§ generalizes the onboarding acknowledgment pattern, see
 * `preferences/service.ts#markShareNotificationsSeen`'s doc comment).
 */
const FOCUSED_FLOW_PATH = /\/(new|import|edit)(\/|$)/;

export function ReceivedShareNotifier({
  newShareCount,
}: {
  newShareCount: number;
}) {
  const { showToast, dismissToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const shownRef = React.useRef(false);

  React.useEffect(() => {
    if (pathname === "/share") {
      // `/share`'s own page already marks every currently-pending share
      // seen server-side on load — this client-side navigation won't see
      // that until the layout's `newShareCount` prop is next recomputed
      // (a full reload), so suppress for the rest of this session too,
      // rather than re-showing a toast for shares just acknowledged here.
      shownRef.current = true;
      return;
    }
    if (shownRef.current) return;
    if (newShareCount <= 0) return;
    // Never interrupts a nested creation/editing/import flow.
    if (FOCUSED_FLOW_PATH.test(pathname)) return;

    shownRef.current = true;
    showToast({
      id: "received-shares",
      title:
        newShareCount === 1
          ? "You have a new shared recipe"
          : `You have ${newShareCount} new shared recipes`,
      description: "Someone sent you a recipe or Part to review.",
      variant: "attention",
      durationMs: null,
      actions: [
        {
          label: "View received shares",
          onClick: () => {
            // Dismissing (not just navigating) is what fires `onDismiss`
            // below, so following the link counts as acknowledging it too.
            dismissToast("received-shares");
            router.push("/share#received");
          },
        },
      ],
      onDismiss: () => {
        void acknowledgeShareNotifications();
      },
    });
  }, [newShareCount, pathname, router, showToast, dismissToast]);

  return null;
}
