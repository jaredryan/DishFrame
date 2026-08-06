import { Link2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const RECIPES = ["Chicken Rice Bowl", "Weeknight Fried Rice", "Lettuce Wraps"];

/** Hero Reusable Parts moment: one shared Part connected to the recipes that use it, with an update applied to all of them. */
export function HeroPartsVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "border-border bg-card flex h-full flex-col justify-center gap-5 rounded-2xl border p-6 shadow-md",
        className,
      )}
    >
      <span className="bg-brand-orange/10 text-brand-orange-text inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
        <Link2 className="size-3" />
        Reusable Part
      </span>
      <div className="border-brand-orange/30 bg-surface-subtle rounded-xl border p-3.5">
        <p className="font-heading text-foreground text-sm font-semibold">
          White Rice
        </p>
        <p className="text-brand-orange-text mt-0.5 text-xs font-medium">
          Updated just now
        </p>
      </div>
      <div className="flex flex-col gap-2.5 pl-2">
        {RECIPES.map((name) => (
          <div key={name} className="flex items-center gap-2.5">
            <span
              className="bg-brand-orange/40 h-px w-4 shrink-0"
              aria-hidden="true"
            />
            <span className="border-border bg-surface-subtle text-foreground flex flex-1 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-medium">
              {name}
              <RefreshCw className="text-brand-orange-text size-3.5 shrink-0" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
