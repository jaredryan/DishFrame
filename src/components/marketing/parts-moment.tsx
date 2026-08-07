import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

const USED_IN = ["Chicken Rice Bowl", "Weeknight Fried Rice", "Lettuce Wraps"];

const CONNECTOR_WIDTH = 32;
const CONNECTOR_HEIGHT = 10;

// Measured render height of a USED_IN pill (text-sm line-height 20px +
// py-1.5 padding 12px + 1px top/bottom border), and its gap-3 spacing, used
// to route the narrow-layout connector tree through each row's center.
const PILL_ROW_HEIGHT = 34;
const PILL_ROW_GAP = 12;
// gap-6 (24px) of breathing room before the first entry, per request.
const CARD_TO_LIST_GAP = 24;
// PartCard's rounded-2xl bottom-left corner renders at ~23.8px radius in
// this theme's scale (not the stock Tailwind 16px): at the card's exact
// left edge, its bottom border curves away from that x for a full radius
// before the straight edge begins, so the overlap has to clear that radius
// (plus a few px of margin) to visibly reach the card's solid bottom edge,
// not the empty space next to its rounded corner.
const TRUNK_CARD_OVERLAP = 28;
// PartCard's rendered width (max-w-56) and the widest pill's measured
// rendered width ("Weeknight Fried Rice", ~172px), used to compute the
// fixed horizontal distance from the card's left edge (where the trunk
// stems from) to the pill block's left edge (which is centered on its own
// width, independent of the connectors).
const CARD_WIDTH = 224;
const WIDEST_PILL_WIDTH = 172;
const CONNECTOR_LENGTH = (CARD_WIDTH - WIDEST_PILL_WIDTH) / 2;

const ROW_CENTER_Y = [0, 1, 2].map(
  (i) =>
    CARD_TO_LIST_GAP +
    i * (PILL_ROW_HEIGHT + PILL_ROW_GAP) +
    PILL_ROW_HEIGHT / 2,
);
// Where the trunk's own line ends — flush with the bottom-most connector.
const TRUNK_BOTTOM_Y = TRUNK_CARD_OVERLAP + ROW_CENTER_Y[2];
// The last arrowhead's triangle extends ~4.2px past its center line; without
// this margin the svg's own bounds (== TRUNK_BOTTOM_Y) would clip its tip.
const SVG_HEIGHT = TRUNK_BOTTOM_Y + 5;

// Baked-in equivalent of brand-blue at 40% opacity over the page
// background, following the same formula as AboutHeroVisual's muted-violet
// connectors. Blue is normally reserved for primary actions, not decorative
// connectors — deliberate one-off deviation for this visual.
const CONNECTOR_STROKE_CLASS =
  "text-[color-mix(in_srgb,var(--brand-blue)_40%,var(--background)_60%)]";
const CONNECTOR_FILL_CLASS =
  "fill-[color-mix(in_srgb,var(--brand-blue)_40%,var(--background)_60%)]";

/** Triangular arrowhead centered at (cx, cy), pointing right. */
function ArrowHead({ cx, cy }: { cx: number; cy: number }) {
  return (
    <polygon
      points={`${cx + 4.8},${cy} ${cx - 3.6},${cy - 4.2} ${cx - 3.6},${cy + 4.2}`}
      className={CONNECTOR_FILL_CLASS}
    />
  );
}

/** Horizontal connector with a centered arrowhead, from the Part card to a using Recipe. */
function Connector() {
  const midX = CONNECTOR_WIDTH / 2;
  const midY = CONNECTOR_HEIGHT / 2;
  return (
    <svg
      viewBox={`0 0 ${CONNECTOR_WIDTH} ${CONNECTOR_HEIGHT}`}
      width={CONNECTOR_WIDTH}
      height={CONNECTOR_HEIGHT}
      className="block shrink-0"
      aria-hidden="true"
    >
      <line
        x1={0}
        y1={midY}
        x2={CONNECTOR_WIDTH}
        y2={midY}
        stroke="currentColor"
        strokeWidth="1.5"
        className={CONNECTOR_STROKE_CLASS}
      />
      <ArrowHead cx={midX} cy={midY} />
    </svg>
  );
}

/**
 * Combined trunk-and-branches overlay for the narrow layout: a plain
 * (arrowless) vertical trunk stemming from the Part card's left edge, down
 * through a horizontal, arrow-centered branch to each pill's left edge.
 * Purely decorative — sits behind the pill list and contributes no width or
 * position of its own, so it never factors into how the pills are centered.
 */
function ConnectorTree() {
  return (
    <svg
      width={CONNECTOR_LENGTH}
      height={SVG_HEIGHT}
      viewBox={`0 0 ${CONNECTOR_LENGTH} ${SVG_HEIGHT}`}
      className="pointer-events-none absolute -top-7 left-0"
      aria-hidden="true"
    >
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={TRUNK_BOTTOM_Y}
        stroke="currentColor"
        strokeWidth="1.5"
        className={CONNECTOR_STROKE_CLASS}
      />
      {ROW_CENTER_Y.map((y) => (
        <g key={y}>
          <line
            x1={0}
            y1={y + TRUNK_CARD_OVERLAP}
            x2={CONNECTOR_LENGTH}
            y2={y + TRUNK_CARD_OVERLAP}
            stroke="currentColor"
            strokeWidth="1.5"
            className={CONNECTOR_STROKE_CLASS}
          />
          <ArrowHead cx={CONNECTOR_LENGTH / 2} cy={y + TRUNK_CARD_OVERLAP} />
        </g>
      ))}
    </svg>
  );
}

function PartCard() {
  return (
    <div className="border-border bg-card flex w-full max-w-56 shrink-0 flex-col gap-2 rounded-2xl border p-5 shadow-sm">
      <span className="bg-brand-green/10 text-brand-green-text inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
        <Link2 className="size-3" aria-hidden="true" />
        Reusable Part
      </span>
      <p className="font-heading text-foreground text-lg font-semibold">
        White Rice
      </p>
      <p className="text-muted-foreground text-sm text-pretty">
        Update it once. Every Recipe that uses it gets the update.
      </p>
    </div>
  );
}

function Pill({ name }: { name: string }) {
  return (
    <span className="border-border bg-surface-subtle text-foreground rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap">
      {name}
    </span>
  );
}

/** Wide layout: each pill paired with its own connector, side by side with the card. */
function UsedInList() {
  return (
    <ul className="flex flex-col gap-3">
      {USED_IN.map((name) => (
        <li key={name} className="flex items-center">
          <Connector />
          <Pill name={name} />
        </li>
      ))}
    </ul>
  );
}

/** Narrow layout: pills only, sized and centered by their own width — connectors are a separate overlay. */
function NarrowUsedInList() {
  return (
    <ul className="mx-auto flex w-fit flex-col gap-3">
      {USED_IN.map((name) => (
        <li key={name} className="flex items-center">
          <Pill name={name} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Hub-and-spoke visual for reusable Parts: one saved Part card connected by
 * lines to the Recipes that use it, echoing the same connector language as
 * HeroVisual's "Saved part" rows and WorkflowPath's node strip.
 *
 * Below 475px there isn't room for the card and the recipe list side by
 * side without wrapping mid-row, so a second, narrower layout takes over:
 * the recipe list moves below the card, centered on its own width, with a
 * decorative connector tree stemming from the card's left edge to each pill.
 */
export function PartsMoment({ className }: { className?: string }) {
  return (
    <div
      className={cn(className)}
      role="img"
      aria-label="A reusable White Rice part connected to three recipes that use it: Chicken Rice Bowl, Weeknight Fried Rice, and Lettuce Wraps."
    >
      <div className="hidden min-[475px]:flex min-[475px]:flex-row min-[475px]:items-center">
        <PartCard />
        <UsedInList />
      </div>

      <div className="flex flex-col items-center min-[475px]:hidden">
        <PartCard />
        <div className="relative w-full max-w-56 pt-6">
          <ConnectorTree />
          <NarrowUsedInList />
        </div>
      </div>
    </div>
  );
}
