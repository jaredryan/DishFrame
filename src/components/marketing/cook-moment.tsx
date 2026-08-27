import { CheckCircle2, ChefHat, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Sauce made", state: "done" as const },
  { label: "Chicken — 12:30 remaining", state: "active" as const },
  { label: "Rice", state: "queued" as const },
];

/** Cooking Mode moment: sections grouped by part, one done, one running, one waiting. */
export function CookMoment({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative mx-auto w-full max-w-sm", className)}
      role="img"
      aria-label="Cooking Mode showing one completed section, a running timer on the current section, and the next section waiting."
    >
      <div className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-6 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Cooking Mode
          </span>
          <ChefHat className="text-brand-green size-4" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-2">
          {STEPS.map((step) => (
            <div
              key={step.label}
              className={cn(
                "border-border bg-surface-subtle flex items-center gap-2.5 rounded-lg border border-l-[3px] px-3 py-2.5",
                step.state === "done" && "border-l-brand-green",
                step.state === "active" && "border-l-brand-orange",
                step.state === "queued" && "border-l-border",
              )}
            >
              {step.state === "done" && (
                <CheckCircle2
                  className="text-brand-green size-4 shrink-0"
                  aria-hidden="true"
                />
              )}
              {step.state === "active" && (
                <Timer
                  className="text-brand-orange-text size-4 shrink-0"
                  aria-hidden="true"
                />
              )}
              {step.state === "queued" && (
                <span
                  className="border-border size-4 shrink-0 rounded-full border"
                  aria-hidden="true"
                />
              )}
              <span className="text-foreground text-sm">{step.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
