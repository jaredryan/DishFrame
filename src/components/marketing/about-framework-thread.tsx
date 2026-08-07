export type ThreadAccent = "blue" | "green" | "orange" | "violet";

const ACCENT_VAR: Record<ThreadAccent, string> = {
  blue: "var(--brand-blue)",
  green: "var(--brand-green)",
  orange: "var(--brand-orange)",
  violet: "var(--brand-violet)",
};

/**
 * PROTOTYPE — see docs/PUBLIC_PAGES_DESIGN_POLISH.md for the rollback steps
 * if this doesn't earn its place.
 *
 * Connects one About framework step to the next through the empty `gap-28`
 * (112px) space between them, never over card content, so it never crosses
 * text or illustrations at any width. `h-20` (80px) centered via `mt-4`
 * leaves 16px of breathing room above and below within that 112px gap — if
 * the steps list's gap changes, update these to match.
 */
export function AboutFrameworkThreadSegment({
  from,
  to,
}: {
  from: ThreadAccent;
  to: ThreadAccent;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-full left-1/2 mt-4 h-20 w-0.5 -translate-x-1/2"
      style={{
        background: `linear-gradient(to bottom, color-mix(in srgb, ${ACCENT_VAR[from]} 40%, var(--background) 60%), color-mix(in srgb, ${ACCENT_VAR[to]} 40%, var(--background) 60%))`,
      }}
    />
  );
}
