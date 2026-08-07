/**
 * Sparse, static dot-grid texture for ClosingCta's background. A single
 * full-bleed radial-gradient pattern (unlike the fixed-geometry corner SVGs
 * it replaces) so it scales cleanly at every width with no breakpoint
 * logic. Masked to feather in/out at the section's top and bottom edges
 * rather than stopping abruptly, and kept low-opacity so it stays quiet
 * behind the centered copy and button.
 */
export function ClosingCtaDotPattern() {
  return (
    <div
      aria-hidden="true"
      className="text-primary-foreground/15 pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "radial-gradient(currentColor 1.5px, transparent 1.5px)",
        backgroundSize: "28px 28px",
        maskImage:
          "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
      }}
    />
  );
}
