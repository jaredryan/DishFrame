import { cn } from "@/lib/utils";

export function DishFrameMark({ className }: { className?: string }) {
  return (
    <>
      <picture className="dark:hidden">
        <source srcSet="/brand/dishframe-mark-light.webp" type="image/webp" />
        <img
          src="/brand/dishframe-mark-light.png"
          alt=""
          aria-hidden="true"
          className={cn("shrink-0", className)}
        />
      </picture>
      <picture className="hidden dark:block">
        <source srcSet="/brand/dishframe-mark-dark.webp" type="image/webp" />
        <img
          src="/brand/dishframe-mark-dark.png"
          alt=""
          aria-hidden="true"
          className={cn("shrink-0", className)}
        />
      </picture>
    </>
  );
}
