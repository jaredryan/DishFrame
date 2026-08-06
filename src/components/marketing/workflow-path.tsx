import { cn } from "@/lib/utils";

type Accent = "blue" | "green" | "orange" | "purple" | "neutral";

const ACCENT_RING: Record<Accent, string> = {
  blue: "border-primary bg-primary/10 text-primary",
  green: "border-brand-green bg-brand-green/10 text-brand-green",
  orange: "border-brand-orange bg-brand-orange/10 text-brand-orange",
  purple: "border-brand-purple bg-brand-purple/10 text-brand-purple",
  neutral: "border-border bg-surface-subtle text-muted-foreground",
};

/** Shared connected-step motif: a numbered node strip linking framework steps. */
export function WorkflowPath({
  steps,
  className,
}: {
  steps: { label: string; accent?: Accent }[];
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <ol className="flex min-w-max items-start gap-0 px-1 py-2">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-start">
            <div className="flex flex-col items-center gap-2">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums",
                  ACCENT_RING[step.accent ?? "neutral"],
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="text-foreground text-sm font-medium whitespace-nowrap">
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                className="bg-border mx-3 mt-[17px] h-px w-10 shrink-0 sm:w-16"
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
