"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import {
  registerSyncTriggers,
  runIncrementalPull,
} from "@/lib/offline/sync-engine";

/**
 * Registers the service worker and wires the update lifecycle
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md "Update lifecycle"): a new SW
 * version installs and waits in the background; this never force-reloads
 * an active session (especially disruptive mid-Cooking-Mode) — instead it
 * shows the existing toast system's persistent "Update available — Reload"
 * notice and only activates/reloads once the user chooses to.
 *
 * Mounted once, from the root layout, so it runs on every route —
 * registration itself is harmless pre-sign-in (the SW's own fetch handler
 * doesn't distinguish authenticated routes), and the sync triggers/pull
 * below are cheap no-ops with an empty queue/no cursor.
 */
export function ServiceWorkerRegister() {
  const { showToast } = useToast();
  const promptedRef = React.useRef(false);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function promptForReload(registration: ServiceWorkerRegistration) {
      if (promptedRef.current) return;
      promptedRef.current = true;
      showToast({
        id: "sw-update-available",
        title: "Update available",
        description: "A new version of DishFrame is ready.",
        variant: "attention",
        durationMs: null,
        actions: [
          {
            label: "Reload",
            onClick: () => {
              registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            },
          },
        ],
      });
    }

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // `controllerchange` also fires on a page's first-ever activation
      // (uncontrolled → controlled via the SW's own `clients.claim()`),
      // not just after a user-requested `SKIP_WAITING`. Gate on
      // `promptedRef` — set only once we've actually shown the "Update
      // available" toast — so an ordinary first load never reloads.
      if (!promptedRef.current) return;
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (registration.waiting && registration.active) {
          promptForReload(registration);
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              promptForReload(registration);
            }
          });
        });
      })
      .catch(() => {
        // No offline support this session (unsupported browser, blocked
        // registration) — the app still works fully online.
      });

    registerSyncTriggers();
    void runIncrementalPull().catch(() => {
      // Not signed in yet, or genuinely offline on first load — the next
      // successful trigger (online/focus/visibilitychange) retries.
    });
  }, [showToast]);

  return null;
}
