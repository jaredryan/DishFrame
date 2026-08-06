import { GitBranch, RotateCw, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** A Cooking Session's notes and rating looping into the next Recipe Version. */
export function ImproveMoment({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative mx-auto w-full max-w-sm", className)}
      role="img"
      aria-label="A Cooking Session with notes and a rating feeding into a new Recipe Version."
    >
      <div className="flex flex-col gap-3">
        <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-5 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Cooking Session
            </span>
            <div className="flex items-center gap-0.5" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <Star
                  key={i}
                  className="text-brand-purple size-3.5 fill-current"
                />
              ))}
              <Star className="text-border size-3.5 fill-current" />
            </div>
          </div>
          <p className="text-foreground text-sm text-pretty">
            Great with lime. Less salt next time.
          </p>
        </div>

        <div className="flex items-center gap-2 pl-2" aria-hidden="true">
          <RotateCw className="text-brand-purple size-3.5 shrink-0" />
          <span className="bg-brand-purple/40 h-px flex-1" />
        </div>

        <div className="border-brand-purple/30 bg-card text-brand-purple flex w-fit items-center gap-1.5 self-end rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-sm">
          <GitBranch className="size-3.5" aria-hidden="true" />
          Version 4
        </div>
      </div>
    </div>
  );
}
