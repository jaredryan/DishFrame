import { Clock, GitBranch, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTAINER_WIDTH = 288; // w-72
const OUTER_CARD_WIDTH = 224; // w-56 (First time / Next time)
const MID_CARD_WIDTH = 240; // w-60 (Cooking Session)
const MID_CARD_OFFSET = 40; // ml-10
const CONNECTOR_HEIGHT = 22;

const OUTER_CENTER = OUTER_CARD_WIDTH / 2;
const MID_CENTER = MID_CARD_OFFSET + MID_CARD_WIDTH / 2;

// Wide (>=520px) layout: First time/Next time form a left column, Cooking
// Session sits centered beside them. These are the two cards' measured
// rendered heights (both ~111px) and Cooking Session's (~106px), used to
// route connectors from each left card's edge into Cooking Session's top
// and bottom edges without crossing either card.
const WIDE_GAP = 56; // gap-14, between the left column and Cooking Session
const LEFT_CARD_HEIGHT = 111;
const COOKING_CARD_HEIGHT = 106;
const WIDE_LEFT_COLUMN_HEIGHT = LEFT_CARD_HEIGHT * 2 + CONNECTOR_HEIGHT;
const WIDE_MID_X = OUTER_CARD_WIDTH + WIDE_GAP + MID_CARD_WIDTH / 2;
const WIDE_TOP_CENTER_Y = LEFT_CARD_HEIGHT / 2;
const WIDE_BOTTOM_CENTER_Y =
  LEFT_CARD_HEIGHT + CONNECTOR_HEIGHT + LEFT_CARD_HEIGHT / 2;
const WIDE_COOKING_TOP = (WIDE_LEFT_COLUMN_HEIGHT - COOKING_CARD_HEIGHT) / 2;
const WIDE_COOKING_BOTTOM = WIDE_COOKING_TOP + COOKING_CARD_HEIGHT;
const WIDE_ARROW_X = (OUTER_CARD_WIDTH + WIDE_MID_X) / 2;

// Baked-in equivalent of brand-violet at 40% opacity over the page
// background — solid, so the line doesn't show through the arrowhead fill.
// (Written as static literals, not built from a shared string, so
// Tailwind's class scanner can see each one.)
const CONNECTOR_STROKE_CLASS =
  "text-[color-mix(in_srgb,var(--brand-violet)_40%,var(--background)_60%)]";
const CONNECTOR_FILL_CLASS =
  "fill-[color-mix(in_srgb,var(--brand-violet)_40%,var(--background)_60%)]";

/** Elbow connector: drops from a card's bottom-center, crosses to the next card's top-center. */
function ElbowConnector({
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
        className={CONNECTOR_STROKE_CLASS}
      />
      <ArrowHead
        cx={midX}
        cy={midY}
        direction={fromX < toX ? "right" : "left"}
      />
    </svg>
  );
}

/** Triangular arrowhead centered at (cx, cy), pointing left or right. */
function ArrowHead({
  cx,
  cy,
  direction,
}: {
  cx: number;
  cy: number;
  direction: "left" | "right";
}) {
  const tipOffset = direction === "right" ? 4.8 : -4.8;
  const baseOffset = direction === "right" ? -3.6 : 3.6;
  return (
    <polygon
      points={`${cx + tipOffset},${cy} ${cx + baseOffset},${cy - 4.2} ${cx + baseOffset},${cy + 4.2}`}
      className={CONNECTOR_FILL_CLASS}
    />
  );
}

/**
 * Wide-layout connectors: from the right edge/vertical-center of First time,
 * across to Cooking Session's horizontal center, down into its top edge;
 * then from Cooking Session's bottom edge, down to Next time's
 * vertical-center height, across to its right edge.
 */
function WideConnectors() {
  return (
    <svg
      viewBox={`0 0 ${WIDE_MID_X + MID_CARD_WIDTH / 2} ${WIDE_LEFT_COLUMN_HEIGHT}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <path
        d={`M ${OUTER_CARD_WIDTH} ${WIDE_TOP_CENTER_Y} H ${WIDE_MID_X} V ${WIDE_COOKING_TOP}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className={CONNECTOR_STROKE_CLASS}
      />
      <ArrowHead cx={WIDE_ARROW_X} cy={WIDE_TOP_CENTER_Y} direction="right" />
      <path
        d={`M ${WIDE_MID_X} ${WIDE_COOKING_BOTTOM} V ${WIDE_BOTTOM_CENTER_Y} H ${OUTER_CARD_WIDTH}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className={CONNECTOR_STROKE_CLASS}
      />
      <ArrowHead cx={WIDE_ARROW_X} cy={WIDE_BOTTOM_CENTER_Y} direction="left" />
    </svg>
  );
}

function FirstTimeCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-border bg-card rounded-2xl border p-4 shadow-sm",
        className,
      )}
    >
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
  );
}

function NextTimeCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-brand-green/30 bg-card rounded-2xl border p-4 shadow-md",
        className,
      )}
    >
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
  );
}

function CookingSessionCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-border bg-card rounded-2xl border p-4 shadow-md",
        className,
      )}
    >
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
  );
}

// Below 520px of available width the two-column layout overlaps, so it stays a single-column stack.
export function AboutHeroVisual({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("@container w-full", className)}>
      <div className="mx-auto flex w-72 flex-col @min-[520px]:hidden">
        <FirstTimeCard className="w-56" />
        <ElbowConnector fromX={OUTER_CENTER} toX={MID_CENTER} />
        <CookingSessionCard className="ml-10 w-60" />
        <ElbowConnector fromX={MID_CENTER} toX={OUTER_CENTER} />
        <NextTimeCard className="w-56" />
      </div>

      <div className="relative hidden @min-[520px]:mx-auto @min-[520px]:flex @min-[520px]:w-[520px] @min-[520px]:items-center @min-[520px]:justify-center @min-[520px]:gap-14">
        <WideConnectors />
        <div className="flex w-56 flex-col gap-[22px]">
          <FirstTimeCard />
          <NextTimeCard />
        </div>
        <CookingSessionCard className="w-60" />
      </div>
    </div>
  );
}
