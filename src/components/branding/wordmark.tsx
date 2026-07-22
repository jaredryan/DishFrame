import Link from "next/link";
import { cn } from "@/lib/utils";
import { DishFrameMark } from "@/components/branding/mark";

export function Wordmark({
  className,
  href = "/",
  showMark = true,
}: {
  className?: string;
  href?: string;
  showMark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-heading text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-md text-lg font-semibold tracking-tight focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
    >
      {showMark && <DishFrameMark className="size-6" />}
      <span>
        Dish<span className="text-primary">Frame</span>
      </span>
    </Link>
  );
}
