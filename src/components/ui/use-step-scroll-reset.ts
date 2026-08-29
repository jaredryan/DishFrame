import * as React from "react";

/**
 * Frontend interaction-architecture audit (2026-08-28): every multi-step
 * dialog (Send, Publish, new grocery list, the grocery-list detail "Add
 * meal" dialog) renders each step's content inside one persistent
 * scrollable element, so advancing or going back never remounts it and the
 * previous step's scroll position otherwise carries over — most visibly
 * when a long Recipe/Part picker's scroll position bleeds into the much
 * shorter Version/yield configuration step that follows it. Attach the
 * returned ref to whichever element actually scrolls for that dialog (the
 * step-content wrapper, or `DialogContent` itself when it scrolls the whole
 * dialog body) to reset it to the top on every `step` change.
 */
export function useStepScrollReset<T>(step: T) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [step]);
  return ref;
}
