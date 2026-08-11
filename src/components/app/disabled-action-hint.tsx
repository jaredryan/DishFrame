"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Explains why a disabled action is unavailable — without the Settings-
 * page scroll jitter the prior Popover-only implementation caused (final
 * Gate 2 correction pass).
 *
 * Root cause of the jitter: that implementation opened a focus-trapping
 * Popover on `onMouseEnter`. Radix's Popover content uses `FocusScope`,
 * which moves DOM focus into the panel on open and restores it to the
 * trigger on close. During a fast scroll, a disabled action's wrapper
 * repeatedly passes under a stationary pointer, firing `mouseenter`/
 * `mouseleave` many times in a row — each one yanked focus, and the
 * browser scrolls a newly-(un)focused element into view. That focus churn
 * was the actual jitter, not the scroll itself.
 *
 * Fix: hover/keyboard disclosure and tap/click disclosure are handled by
 * two different Radix primitives, matched to what each is actually built
 * for, rather than one Popover doing both jobs.
 * - Desktop hover + keyboard focus → `Tooltip`. Verified directly in
 *   `@radix-ui/react-tooltip`'s source: its trigger ignores
 *   `pointerType === "touch"` entirely, and its content is never a focus
 *   target — no `FocusScope` — so opening/closing it can never move DOM
 *   focus or scroll anything into view. `TooltipProvider`'s default hover
 *   delay also means a row merely passing under the pointer mid-scroll
 *   won't linger long enough to open it.
 * - Touch/click → a separate `Popover` (Tooltip deliberately ignores
 *   touch, so it can't cover tap discovery on its own). Its
 *   `onOpenAutoFocus`/`onCloseAutoFocus` are explicitly prevented so a tap
 *   can't steal or restore focus either.
 *
 * The wrapper span carries `role="button"` because Radix's `PopoverTrigger
 * asChild` clones `aria-haspopup`/`aria-expanded` onto it, and a click
 * already toggles the popover for mouse/touch users (Radix wires that
 * `onClick` regardless of role) — so `role="button"` is describing real,
 * already-present behavior, not just satisfying `aria-allowed-attr`. The
 * one gap that left was keyboard parity: a `<span>` doesn't get the
 * browser's native Enter/Space-triggers-click behavior a real `<button>`
 * gets for free, so `onKeyDown` below completes it explicitly. Keyboard
 * users don't strictly need this to see the explanation — focus alone
 * already opens the Tooltip — but leaving Enter/Space inert on an element
 * announced as a button would still violate the WAI-ARIA button pattern's
 * keyboard contract.
 */
export function DisabledActionHint({
  explanation,
  children,
}: {
  explanation: string;
  children: React.ReactNode;
}) {
  const [tapOpen, setTapOpen] = React.useState(false);

  return (
    <Popover open={tapOpen} onOpenChange={setTapOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <span
                role="button"
                className="inline-flex cursor-not-allowed"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setTapOpen((open) => !open);
                  }
                }}
              >
                {children}
              </span>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{explanation}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {explanation}
      </PopoverContent>
    </Popover>
  );
}
