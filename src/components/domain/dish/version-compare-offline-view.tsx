"use client";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { VersionPicker } from "@/components/domain/dish/version-picker";
import { VersionCompareView } from "@/components/domain/dish/version-compare-view";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { OfflineCompareResult } from "@/lib/dishes/offline-version-compare";

/**
 * Offline counterpart to `VersionCompareContent` — reuses the same pure
 * `VersionCompareView` diff renderer (no divergent rendering), but drives
 * from/to selection via local callbacks instead of `VersionComparePicker`'s
 * `router.push`, matching `VersionHistoryOfflineView`'s local-state pattern
 * for offline navigation.
 */
export function VersionCompareOfflineView({
  kind,
  dishId,
  displayTitle,
  compare,
  onSelectFromAction,
  onSelectToAction,
}: {
  kind: DishKindValue;
  dishId: string;
  displayTitle: string;
  compare: Extract<OfflineCompareResult, { hasEnoughVersions: true }>;
  onSelectFromAction: (versionId: string) => void;
  onSelectToAction: (versionId: string) => void;
}) {
  const basePath = dishBasePath(kind);
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";
  const versionOptions = compare.versions.map((v) => ({
    id: v.id,
    majorVersion: v.majorVersion,
    minorVersion: v.minorVersion,
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: basePath },
          { label: displayTitle, href: `${basePath}/${dishId}` },
          { label: "Compare versions" },
        ]}
      />
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Compare versions
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <VersionPicker
            versions={versionOptions}
            value={compare.fromId}
            onChange={onSelectFromAction}
            ariaLabel="Compare from version"
          />
          <span className="text-muted-foreground text-sm">vs.</span>
          <VersionPicker
            versions={versionOptions}
            value={compare.toId}
            onChange={onSelectToAction}
            ariaLabel="Compare to version"
          />
        </div>
      </div>
      <VersionCompareView
        result={compare.result}
        fromLabel={compare.fromLabel}
        toLabel={compare.toLabel}
        partLinkLabels={compare.partLinkLabels}
      />
    </div>
  );
}
