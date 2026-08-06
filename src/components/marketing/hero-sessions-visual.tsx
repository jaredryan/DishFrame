import { GitBranch, RotateCw, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Hero Cooking Sessions moment: a session's note and rating becoming a deliberate new recipe Version. */
export function HeroSessionsVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex h-full flex-col justify-center gap-3", className)}
    >
      <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-5 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Cooking Session
          </span>
          <div className="flex items-center gap-0.5" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Star
                key={i}
                className="text-brand-violet size-3.5 fill-current"
              />
            ))}
            <Star className="text-border size-3.5 fill-current" />
          </div>
        </div>
        <p className="text-foreground text-sm text-pretty">
          Great with lime. Less salt next time.
        </p>
      </div>
      <div className="flex items-center gap-2 pl-2">
        <RotateCw className="text-brand-violet size-3.5 shrink-0" />
        <span className="bg-brand-violet/40 h-px flex-1" />
      </div>
      <div className="border-brand-violet/30 bg-card text-brand-violet-text flex w-fit items-center gap-1.5 self-end rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-sm">
        <GitBranch className="size-3.5" />
        Version 4
      </div>
    </div>
  );
}
