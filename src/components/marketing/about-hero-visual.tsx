import { Clock, GitBranch, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTAINER_WIDTH = 288; // w-72
const OUTER_CARD_WIDTH = 224; // w-56 (First time / Next time)
const MID_CARD_WIDTH = 240; // w-60 (Cooking Session)
const MID_CARD_OFFSET = 40; // ml-10
const CONNECTOR_HEIGHT = 22;

const OUTER_CENTER = OUTER_CARD_WIDTH / 2;
const MID_CENTER = MID_CARD_OFFSET + MID_CARD_WIDTH / 2;

/** Elbow connector: drops from a card's bottom-center, crosses to the next card's top-center. */
function Connector({
  fromX,
  toX,
  className,
}: {
  fromX: number;
  toX: number;
  className?: string;
}) {
  const midY = CONNECTOR_HEIGHT / 2;
  const midX = (fromX + toX) / 2;
  return (
    <svg
      viewBox={`0 0 ${CONTAINER_WIDTH} ${CONNECTOR_HEIGHT}`}
      width={CONTAINER_WIDTH}
      height={CONNECTOR_HEIGHT}
      className={cn("block", className)}
      aria-hidden="true"
    >
      <path
        d={`M ${fromX} 0 V ${midY} H ${toX} V ${CONNECTOR_HEIGHT}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-border"
      />
      <circle
        cx={midX}
        cy={midY}
        r="2.5"
        strokeWidth="1.5"
        className="fill-card stroke-border"
      />
    </svg>
  );
}

/**
 * About hero moment: the same dish across a first attempt, the cooking
 * session that followed, and the more deliberate version it became. First
 * and third cards share one left edge; the middle card offsets right, with
 * elbow connectors running center-to-center between each stage.
 */
export function AboutHeroVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("mx-auto flex w-72 flex-col", className)}
    >
      <div className="border-border bg-card w-56 rounded-2xl border p-4 shadow-sm">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          First time
        </p>
        <p className="text-foreground mt-1.5 text-sm font-medium">
          Lemongrass Chicken
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Clock className="size-3.5" aria-hidden="true" />
            14 min
          </span>
          <span className="border-border bg-surface-subtle text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium">
            Version 1
          </span>
        </div>
      </div>

      <Connector fromX={OUTER_CENTER} toX={MID_CENTER} />

      <div className="border-border bg-card ml-10 w-60 rounded-2xl border p-4 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Cooking Session
          </p>
          <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
            {Array.from({ length: 4 }).map((_, i) => (
              <Star
                key={i}
                className="text-foreground size-3 fill-current"
                aria-hidden="true"
              />
            ))}
            <Star
              className="text-border size-3 fill-current"
              aria-hidden="true"
            />
          </div>
        </div>
        <ul className="mt-2.5 flex flex-col gap-1.5">
          <li className="text-foreground text-sm">Less vinegar</li>
          <li className="text-foreground text-sm">Slice thinner</li>
        </ul>
      </div>

      <Connector fromX={MID_CENTER} toX={OUTER_CENTER} />

      <div className="border-brand-green/30 bg-card w-56 rounded-2xl border p-4 shadow-md">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Next time
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs line-through">
            14 min
          </span>
          <span className="text-foreground text-sm font-semibold">11 min</span>
        </div>
        <span className="bg-brand-green/10 text-brand-green-text mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
          <GitBranch className="size-3" aria-hidden="true" />
          Version 2
        </span>
      </div>
    </div>
  );
}
