import { cn } from "@/lib/utils";

/**
 * Slice 6A: the one shared visual shell for a top-level Section or a
 * top-level linked Part on a detail page (current or historical Version) —
 * background, border, padding, and spacing are identical either way, so
 * the only meaningful difference between the two is the linked Part's own
 * header content (Part/Version/multiplier chips, View/Edit/Copy actions).
 * Used by `ScaledVersionView` (Sections) and `PartLinkTreeView` (top-level
 * linked Parts) — see both for their own header content.
 */
export function ContentCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card flex flex-col gap-3 rounded-xl border p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Shared title typography for a Section name / linked-Part title on a
// detail page — one style for both, so a linked Part is distinguished by
// its chips and actions, never by a different heading style.
export const CONTENT_CARD_TITLE_CLASS =
  "font-heading text-foreground text-base font-medium";
