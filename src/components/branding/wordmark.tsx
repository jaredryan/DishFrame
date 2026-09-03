import Link from "next/link";
import { cn } from "@/lib/utils";
import { DishFrameMark } from "@/components/branding/mark";

export function Wordmark({
  className,
  iconClassName,
  href = "/",
  showMark = true,
}: {
  className?: string;
  iconClassName?: string;
  href?: string | null;
  showMark?: boolean;
}) {
  const content = (
    <>
      {showMark && <DishFrameMark className={cn("size-6", iconClassName)} />}
      <span>
        Dish<span className="text-brand-blue-text">Frame</span>
      </span>
    </>
  );
  const lockupClassName = cn(
    "font-heading text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-md text-lg font-semibold tracking-tight focus-visible:ring-2 focus-visible:outline-none",
    className,
  );

  if (href === null) {
    return <span className={lockupClassName}>{content}</span>;
  }

  return (
    <Link href={href} className={lockupClassName}>
      {content}
    </Link>
  );
}
