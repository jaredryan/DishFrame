import Link from "next/link";
import { cn } from "@/lib/utils";

// Pair with `relative` + this class on the row's own outer element, and
// `relative z-10` on its visible action controls (nav/details QA batch item 3).
export const CLICKABLE_ROW_CLASS = "transition-colors hover:bg-muted/50";

/**
 * Shared "row/card's primary action is also a whole-row click target"
 * overlay: an invisible full-bleed anchor under the row's real content, so
 * nested buttons/icons — raised above it with their own z-index — keep
 * performing their own actions untouched. The whole-row click is an
 * additional convenient target, never a replacement for the row's explicit
 * primary icon control.
 */
export function ClickableRowOverlay({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "focus-visible:ring-ring/50 absolute inset-0 z-0 rounded-lg focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
    />
  );
}
