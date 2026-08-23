import type { ReactNode } from "react";

const CONTENT_WIDTH = {
  standard: "max-w-5xl",
  narrow: "max-w-2xl",
} as const;

/**
 * Shared shell for authenticated main pages — centralizes the established
 * content width/containment and title/description/action header pattern so
 * it comes from one implementation instead of being copy-pasted per page.
 * `width="standard"` (default) is Recipes, Parts, Cook, Meal Plans, Grocery
 * lists, Cooking history, and Share; `width="narrow"` is the editorial width
 * used by Settings, Help, and Share's content.
 */
export function AppPageLayout({
  beforeHeader,
  title,
  description,
  descriptionClassName,
  action,
  width = "standard",
  children,
}: {
  beforeHeader?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  descriptionClassName?: string;
  action?: ReactNode;
  width?: keyof typeof CONTENT_WIDTH;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto flex ${CONTENT_WIDTH[width]} flex-col gap-6`}>
      {beforeHeader}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            {title}
          </h1>
          {description && (
            <p
              className={
                descriptionClassName ?? "text-muted-foreground mt-2 max-w-xl"
              }
            >
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </div>
  );
}
