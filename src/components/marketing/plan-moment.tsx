import { CalendarDays, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEK = [
  { day: "M", planned: false },
  { day: "T", planned: true },
  { day: "W", planned: false },
  { day: "T", planned: true },
  { day: "F", planned: true },
  { day: "S", planned: false },
  { day: "S", planned: false },
];

const GROCERIES = ["Chicken thighs", "Jasmine rice", "Fish sauce", "Limes"];

/** Week strip flowing into a Grocery List, echoing the connector language of the other marketing visuals. */
export function PlanMoment({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative mx-auto w-full max-w-sm", className)}
      role="img"
      aria-label="A week with three Recipes planned, connected to a Grocery List generated from those Recipes."
    >
      <div className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-6 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            This week
          </span>
          <CalendarDays
            className="text-brand-green size-4"
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {WEEK.map((d, i) => (
            <span
              key={i}
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold",
                d.planned
                  ? "bg-brand-green/15 text-brand-green-text"
                  : "bg-surface-subtle text-muted-foreground",
              )}
            >
              {d.day}
            </span>
          ))}
        </div>
        <div className="border-border border-t pt-4">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Grocery List
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {GROCERIES.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm">
                <span
                  className="bg-brand-green/15 text-brand-green-text flex size-4 shrink-0 items-center justify-center rounded-full"
                  aria-hidden="true"
                >
                  <Check className="size-2.5" />
                </span>
                <span className="text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
