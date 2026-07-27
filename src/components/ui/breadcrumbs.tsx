import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

/**
 * One shared breadcrumb pattern (final Gate 2 correction pass) for Recipe
 * and Part detail/edit routes — a back button alone doesn't communicate
 * where the current page sits in the library hierarchy. The final item is
 * always the current page (`aria-current="page"`, not a link) even if it
 * was given an `href` — callers pass one so the same item list can be
 * reused for a detail page's "current" crumb and an edit page's "back to
 * detail" crumb without rebuilding the array.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-1 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className="flex min-w-0 items-center gap-1"
            >
              {index > 0 && (
                <ChevronRight
                  className="size-3.5 shrink-0"
                  aria-hidden="true"
                />
              )}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "truncate",
                    isLast && "text-foreground font-medium",
                  )}
                  title={item.label}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="hover:text-foreground truncate underline-offset-2 hover:underline"
                  title={item.label}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
