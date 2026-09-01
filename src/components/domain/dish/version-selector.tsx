"use client";

import { useRouter } from "next/navigation";
import { VersionPicker } from "@/components/domain/dish/version-picker";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { DishVersionSummary } from "@/lib/dishes/queries";

/**
 * PRODUCT_SPEC.md §13.8: large Version histories stay understandable via one
 * searchable picker listing every saved Version directly (the universal
 * `VersionPicker` — nav/details QA batch item 6), routing straight to that
 * Version's Version History page on selection.
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
    <VersionPicker
      versions={versions}
      currentVersionId={currentVersionId}
      value={activeVersionId}
      onChangeAction={(versionId) => router.push(`${basePath}/${versionId}`)}
    />
  );
}
