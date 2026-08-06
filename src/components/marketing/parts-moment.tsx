import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

const USED_IN = ["Chicken Rice Bowl", "Weeknight Fried Rice", "Lettuce Wraps"];

/**
 * Hub-and-spoke visual for reusable Parts: one saved Part card connected by
 * lines to the Recipes that use it, echoing the same connector language as
 * HeroVisual's "Saved part" rows and WorkflowPath's node strip.
 */
export function PartsMoment({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8",
        className,
      )}
      role="img"
      aria-label="A reusable White Rice part connected to three recipes that use it: Chicken Rice Bowl, Weeknight Fried Rice, and Lettuce Wraps."
    >
      <div className="border-border bg-card flex w-full max-w-56 shrink-0 flex-col gap-2 rounded-2xl border p-5 shadow-sm">
        <span className="bg-brand-green/10 text-brand-green inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
          <Link2 className="size-3" aria-hidden="true" />
          Reusable Part
        </span>
        <p className="font-heading text-foreground text-lg font-semibold">
          White Rice
        </p>
        <p className="text-muted-foreground text-sm text-pretty">
          Update it once. Every Recipe that uses it gets the update.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {USED_IN.map((name) => (
          <li key={name} className="flex items-center gap-3">
            <span className="bg-border h-px w-6 shrink-0 sm:w-10" aria-hidden="true" />
            <span className="border-border bg-surface-subtle text-foreground rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap">
              {name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
