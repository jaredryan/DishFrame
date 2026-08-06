import { Link2, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { name: "Sauce", state: "linked" as const },
  { name: "Rice", state: "linked" as const },
  { name: "Chicken", state: "active" as const },
  { name: "Finish", state: "default" as const },
];

const STATE_STYLES = {
  linked: "border-l-brand-green",
  active: "border-l-brand-orange",
  default: "border-l-border",
};

export function HeroVisual({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative mx-auto aspect-4/3 w-full max-w-md", className)}
      role="img"
      aria-label="An example recipe card showing Sauce, Rice, Chicken, and Finish sections, with a saved-part marker connected to two other recipes that reuse it, a version marker, and a note from a previous meal."
    >
      {/* Version marker */}
      <div className="border-border bg-card text-brand-violet-text absolute -top-3 right-6 z-20 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm">
        <GitBranch className="size-3.5" aria-hidden="true" />
        Version 3
      </div>

      {/* Note from a previous cooking session, tucked over the corner */}
      <div className="border-border bg-card absolute -bottom-12 -left-4 z-20 hidden w-44 -rotate-2 rounded-xl border p-3 shadow-md sm:block">
        <p className="text-muted-foreground text-xs font-medium">Last time</p>
        <p className="text-foreground mt-1 text-sm">
          Great with lime. Less salt next time.
        </p>
      </div>

      {/* Main recipe card */}
      <div className="border-border bg-card relative z-10 flex h-full flex-col gap-3 rounded-2xl border p-5 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-heading text-foreground text-base font-semibold">
              Grilled Lemongrass Chicken
            </p>
            <p className="text-muted-foreground text-xs">4 sections</p>
          </div>
          <span className="bg-brand-green/10 text-brand-green-text inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium">
            Proven
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          {SECTIONS.map((section) => (
            <div key={section.name}>
              <div
                className={cn(
                  "border-border bg-surface-subtle flex items-center justify-between rounded-lg border border-l-[3px] px-3 py-2.5",
                  STATE_STYLES[section.state],
                )}
              >
                <span className="text-foreground text-sm font-medium">
                  {section.name}
                </span>
                {section.state === "linked" && (
                  <span className="text-brand-green-text inline-flex items-center gap-1 text-[11px] font-medium">
                    <Link2 className="size-3" aria-hidden="true" />
                    Saved part
                  </span>
                )}
                {section.state === "active" && (
                  <span className="text-brand-orange-text text-[11px] font-medium">
                    12:30 remaining
                  </span>
                )}
              </div>
              {section.name === "Sauce" && (
                <div
                  className="flex items-center justify-center gap-2 py-1.5"
                  aria-hidden="true"
                >
                  <span className="bg-brand-green/40 h-px w-5" />
                  <span className="border-brand-green/30 bg-card text-brand-green-text flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm">
                    <Link2 className="size-3" />
                    Also in 2 other Recipes
                  </span>
                  <span className="bg-brand-green/40 h-px w-5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
