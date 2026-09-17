"use client";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { VersionComparePicker } from "@/components/domain/dish/version-compare-picker";
import { VersionCompareView } from "@/components/domain/dish/version-compare-view";
import type { VersionCompareViewProps } from "@/lib/dishes/version-compare-page-props";

/**
 * Pure render of an already-assembled `VersionCompareViewProps` — mirrors
 * `VersionHistoryView`'s split from its own async assembly
 * (`version-compare-page-props.ts#buildVersionCompareViewProps`), shared
 * with `VersionCompareOfflineBoundary`'s "trust the server" branch.
 */
export function VersionCompareContent(props: VersionCompareViewProps) {
  const collectionLabel = props.kind === "PART" ? "Parts" : "Recipes";
  const breadcrumbItems = [
    { label: collectionLabel, href: props.basePath },
    { label: props.displayTitle, href: `${props.basePath}/${props.dishId}` },
    { label: "Compare versions" },
  ];

  if (!props.hasEnoughVersions) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Breadcrumbs items={breadcrumbItems} />
        <p className="text-muted-foreground">
          Nothing to compare yet — this{" "}
          {props.kind === "PART" ? "part" : "recipe"} only has one version.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Compare versions
        </h1>
        <VersionComparePicker
          kind={props.kind}
          dishId={props.dishId}
          versions={props.versions}
          fromId={props.fromId}
          toId={props.toId}
        />
      </div>
      <VersionCompareView
        result={props.result}
        fromLabel={props.fromLabel}
        toLabel={props.toLabel}
        partLinkLabels={props.partLinkLabels}
      />
    </div>
  );
}
