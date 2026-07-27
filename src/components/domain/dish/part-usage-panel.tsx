import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { PartUsage } from "@/lib/dishes/queries";

/**
 * PRODUCT_SPEC.md §71 "Recipes using this Part" — current usages only
 * (historical usages remain discoverable through Version history). For
 * each usage: the stable container, its exact Section/placement, and
 * whether a newer eligible Part Version exists than the one it references
 * — surfaced here, not acted on (propagation itself is Review Gate 3
 * scope, not yet implemented).
 */
export function PartUsagePanel({
  usages,
  currentVersionId,
}: {
  usages: PartUsage[];
  currentVersionId: string | null;
}) {
  if (usages.length === 0) {
    return (
      <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4">
        <h2 className="text-foreground text-sm font-semibold">
          Recipes using this Part
        </h2>
        <p className="text-muted-foreground text-sm">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-foreground text-sm font-semibold">
        Recipes using this Part
      </h2>
      <ul className="flex flex-col gap-2">
        {usages.map((usage) => {
          const outOfDate =
            !!currentVersionId &&
            usage.targetDishVersionId !== currentVersionId;
          return (
            <li
              key={usage.id}
              className="border-border flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={`${dishBasePath(usage.containerKind)}/${usage.containerDishId}`}
                  className="text-primary truncate font-medium hover:underline"
                >
                  {usage.containerTitle}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {usage.sectionName
                    ? `In ${usage.sectionName} · `
                    : "Top-level · "}
                  V{usage.containerMajorVersion}.{usage.containerMinorVersion}
                </p>
              </div>
              {outOfDate && (
                <span
                  className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs"
                  title="This usage references an earlier Version of this Part than the current one."
                >
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  Newer Version available
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
