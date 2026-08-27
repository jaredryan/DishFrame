import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DishFrameMark } from "@/components/branding/mark";

/**
 * Slice 21 structural audit: shared by every route group's own
 * `not-found.tsx` so a 404 inside `(app)`/`(share)` etc. doesn't nest the
 * root `not-found.tsx`'s own header/Wordmark inside that group's layout
 * chrome (which already renders one) — the duplicate-header bug this
 * fixes.
 */
export function NotFoundContent({
  homeHref,
  description = "Check the address, or head back home.",
  as: Component = "div",
}: {
  homeHref: string;
  description?: string;
  /** "main" when the enclosing layout doesn't already render one. */
  as?: "div" | "main";
}) {
  return (
    <Component className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <DishFrameMark className="mb-2 size-16" />
      <h1 className="font-heading text-foreground text-2xl font-semibold">
        Looks like this page is missing.
      </h1>
      <p className="text-muted-foreground max-w-sm">{description}</p>
      <Button asChild className="mt-3">
        <Link href={homeHref}>Return home</Link>
      </Button>
    </Component>
  );
}
