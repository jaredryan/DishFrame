import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * DishFrame's semantic chip-color system for Recipe/Part metadata,
 * consistent wherever these chips appear (detail pages, picker rows, cards):
 * neutral for type/custom tags/generic metadata, blue for lifecycle Stage
 * (the same blue regardless of which Stage — the text communicates the
 * actual Stage, not the color), green for Cuisine and Flavor Profiles,
 * purple for Version and Rating, orange for cooking/usage metadata (Last
 * cooked, Makes/yield, Difficulty). Restrained tinted backgrounds/borders/
 * text rather than strong solid fills.
 */
export type ChipSemantic = "neutral" | "blue" | "green" | "purple" | "orange";

export const SEMANTIC_CHIP_CLASSNAME: Record<ChipSemantic, string> = {
  neutral: "bg-muted text-muted-foreground",
  blue: "bg-primary/15 text-brand-blue-text",
  green: "bg-brand-green/10 text-brand-green-text dark:bg-brand-green/20",
  purple: "bg-brand-violet/10 text-brand-violet-text dark:bg-brand-violet/20",
  orange: "bg-brand-orange/10 text-brand-orange-text dark:bg-brand-orange/20",
};

export function SemanticChip({
  semantic,
  className,
  ...props
}: React.ComponentProps<typeof Badge> & { semantic: ChipSemantic }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-transparent",
        SEMANTIC_CHIP_CLASSNAME[semantic],
        className,
      )}
      {...props}
    />
  );
}
