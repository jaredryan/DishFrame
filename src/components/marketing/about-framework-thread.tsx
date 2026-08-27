export type ThreadAccent = "blue" | "green" | "orange" | "violet";

const ACCENT_VAR: Record<ThreadAccent, string> = {
  blue: "var(--brand-blue)",
  green: "var(--brand-green)",
  orange: "var(--brand-orange)",
  violet: "var(--brand-violet)",
};

/** Breathing room above/below the connector within the steps list's gap. */
const THREAD_MARGIN = "1rem";

/**
 * PROTOTYPE — remove this component and its use in about/page.tsx if it
 * doesn't earn its place.
 *
 * Connects one About framework step to the next through the empty space
 * between them, never over card content, so it never crosses text or
 * illustrations at any width. The steps list sets the `--framework-gap` CSS
 * variable to its own row gap, so the connector's height is derived from
 * that single source of truth (leaving `THREAD_MARGIN` of breathing room
 * above and below) instead of a separately hand-tuned pixel value.
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
      className="pointer-events-none absolute top-full left-1/2 w-0.5 -translate-x-1/2"
      style={{
        marginTop: THREAD_MARGIN,
        height: `calc(var(--framework-gap) - 2 * ${THREAD_MARGIN})`,
        background: `linear-gradient(to bottom, color-mix(in srgb, ${ACCENT_VAR[from]} 40%, var(--background) 60%), color-mix(in srgb, ${ACCENT_VAR[to]} 40%, var(--background) 60%))`,
      }}
    />
  );
}
