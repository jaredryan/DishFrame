import { cn } from "@/lib/utils";

type Accent = "blue" | "green" | "orange" | "violet" | "neutral";

const ACCENT_RING: Record<Accent, string> = {
  blue: "border-primary bg-primary/10 text-brand-blue-text",
  green: "border-brand-green bg-brand-green/10 text-brand-green-text",
  orange: "border-brand-orange bg-brand-orange/10 text-brand-orange-text",
  violet: "border-brand-violet bg-brand-violet/10 text-brand-violet-text",
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
    <div className={className}>
      <ol className="flex min-w-max items-start justify-center gap-0 py-2">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-start">
            <div className="flex w-[50px] flex-col items-center gap-1.5 sm:w-[60px] sm:gap-2">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums sm:size-9",
                  ACCENT_RING[step.accent ?? "neutral"],
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="text-foreground text-xs font-medium whitespace-nowrap sm:text-sm">
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                className="bg-border mx-1.5 mt-[13px] h-px w-6 shrink-0 sm:mx-3 sm:mt-[17px] sm:w-16"
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
