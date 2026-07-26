"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * PRODUCT_SPEC.md §15.2: DishFrame-controlled navigation (in-app link
 * clicks — sidebar, mobile nav, "Cancel", etc.) away from the editor while
 * unsaved changes exist must show a custom "Keep editing" / "Discard
 * changes" confirmation, never a native browser prompt. §15.3 explicitly
 * does NOT require guarding browser-controlled exits (tab close, refresh,
 * back/forward) — this hook only ever intercepts clicks on same-document
 * in-app links, never those.
 *
 * Implemented as a capture-phase `document` click listener so it runs
 * before Next.js's own <Link> click handler (attached in the bubble
 * phase), letting `stopPropagation` reliably prevent the client-side
 * navigation from ever starting.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const isDirtyRef = React.useRef(isDirty);
  React.useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  React.useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!isDirtyRef.current) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return {
    isPromptOpen: pendingHref !== null,
    keepEditing: () => setPendingHref(null),
    discardChanges: () => {
      if (pendingHref) router.push(pendingHref);
      setPendingHref(null);
    },
  };
}
