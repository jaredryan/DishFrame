import { Badge } from "@/components/ui/badge";
import type { DishKindValue } from "@/lib/dishes/schema";

/** Compact Recipe/Part type badge shared by the Home dashboard and Cook
 * page — same "Recipe"/"Part" wording `cook/page.tsx` already used inline.
 * `selected` strengthens the outline so it stays visible on the tinted
 * `bg-primary/10` selected-row background used by picker rows. */
export function DishKindBadge({
  kind,
  selected,
}: {
  kind: DishKindValue;
  selected?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={selected ? "border-primary/40" : undefined}
    >
      {kind === "PART" ? "Part" : "Recipe"}
    </Badge>
  );
}
