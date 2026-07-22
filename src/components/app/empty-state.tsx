import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="bg-muted flex size-10 items-center justify-center rounded-full">
          <Icon className="text-muted-foreground size-5" aria-hidden="true" />
        </div>
      )}
      <p className="text-foreground text-sm font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      )}
      {action}
    </div>
  );
}
