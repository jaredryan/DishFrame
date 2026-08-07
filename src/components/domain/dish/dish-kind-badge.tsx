import { Badge } from "@/components/ui/badge";
import type { DishKindValue } from "@/lib/dishes/schema";

/** Compact Recipe/Part type badge shared by the Home dashboard and Cook
 * page — same "Recipe"/"Part" wording `cook/page.tsx` already used inline. */
export function DishKindBadge({ kind }: { kind: DishKindValue }) {
  return <Badge variant="outline">{kind === "PART" ? "Part" : "Recipe"}</Badge>;
}
