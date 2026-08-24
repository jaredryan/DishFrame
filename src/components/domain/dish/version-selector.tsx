"use client";

import { useRouter } from "next/navigation";
import { VersionLineRow } from "@/components/domain/dish/version-picker-field";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { DishVersionSummary } from "@/lib/dishes/queries";

/**
 * PRODUCT_SPEC.md §13.8: large Version histories stay understandable via
 * (a) a selector jumping straight to the latest minor of any major line,
 * and (b) prev/next controls that step sequentially through *every* saved
 * Version — crossing naturally from e.g. `V3.0` backward into the latest
 * `V2.x` and forward again. `versions` must already be ordered ascending
 * by (majorVersion, minorVersion) — `listDishVersionSummaries` guarantees
 * this. Shares its row (prev/next + major-line jump) with the rich picker
 * used elsewhere via `VersionLineRow`, routing through real links instead
 * of a value/callback so prev/next stay real anchors.
 */
export function VersionSelector({
  kind,
  dishId,
  currentVersionId,
  versions,
  activeVersionId,
}: {
  kind: DishKindValue;
  dishId: string;
  currentVersionId: string | null;
  versions: DishVersionSummary[];
  activeVersionId: string;
}) {
  const router = useRouter();
  const basePath = `${dishBasePath(kind)}/${dishId}/versions`;

  return (
    <VersionLineRow
      versions={versions}
      currentVersionId={currentVersionId}
      activeVersionId={activeVersionId}
      onNavigateAction={(versionId) => router.push(`${basePath}/${versionId}`)}
      hrefForVersionAction={(versionId) => `${basePath}/${versionId}`}
    />
  );
}
