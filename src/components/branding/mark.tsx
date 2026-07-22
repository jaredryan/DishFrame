import { cn } from "@/lib/utils";

/**
 * Nested-frame mark: an outer frame containing an offset inner tile,
 * echoing the "modular preparation" motif (parts assembling within a
 * structure) without a literal picture frame.
 */
export function DishFrameMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="6"
        className="stroke-primary"
        strokeWidth="2"
      />
      <rect
        x="10.5"
        y="10.5"
        width="9"
        height="9"
        rx="3"
        className="fill-brand-orange"
      />
    </svg>
  );
}
