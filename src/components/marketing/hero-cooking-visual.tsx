import { ChefHat, CheckCircle2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Sauce", state: "done" as const },
  { label: "Chicken", state: "active" as const },
  { label: "Rice", state: "queued" as const },
];

/** Hero Cooking Mode moment: current section, one done step, a running timer, and progress to what's next. */
export function HeroCookingVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "border-border bg-card flex h-full flex-col gap-4 rounded-2xl border p-6 shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Cooking Mode
        </span>
        <ChefHat className="text-brand-green size-4" />
      </div>
      <p className="font-heading text-foreground text-sm font-semibold">
        Now cooking: Chicken
      </p>
      <div className="flex flex-1 flex-col gap-2">
        {STEPS.map((step) => (
          <div
            key={step.label}
            className={cn(
              "border-border bg-surface-subtle flex items-center gap-2.5 rounded-lg border border-l-[3px] px-3 py-2.5",
              step.state === "done" && "border-l-brand-green",
              step.state === "active" &&
                "border-l-brand-green bg-brand-green/5",
              step.state === "queued" && "border-l-border",
            )}
          >
            {step.state === "done" && (
              <CheckCircle2 className="text-brand-green size-4 shrink-0" />
            )}
            {step.state === "active" && (
              <Timer className="text-brand-green-text size-4 shrink-0" />
            )}
            {step.state === "queued" && (
              <span
                className="border-border size-4 shrink-0 rounded-full border"
                aria-hidden="true"
              />
            )}
            <span className="text-foreground flex-1 text-sm font-medium">
              {step.label}
            </span>
            {step.state === "active" && (
              <span className="text-brand-green-text text-[11px] font-medium">
                6:30 left
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-border h-1.5 flex-1 overflow-hidden rounded-full">
          <div className="bg-brand-green h-full w-2/3 rounded-full" />
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          Step 2 of 3
        </span>
      </div>
    </div>
  );
}
