"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
 * this.
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

  const latestPerMajor = new Map<number, DishVersionSummary>();
  for (const version of versions) {
    latestPerMajor.set(version.majorVersion, version);
  }
  const majorLines = [...latestPerMajor.values()].sort(
    (a, b) => a.majorVersion - b.majorVersion,
  );

  const active = versions.find((v) => v.id === activeVersionId);
  const activeIndex = versions.findIndex((v) => v.id === activeVersionId);
  const previous = activeIndex > 0 ? versions[activeIndex - 1] : null;
  const next =
    activeIndex >= 0 && activeIndex < versions.length - 1
      ? versions[activeIndex + 1]
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        disabled={!previous}
        asChild={!!previous}
      >
        {previous ? (
          <Link
            href={`${basePath}/${previous.id}`}
            aria-label={`Previous version, V${previous.majorVersion}.${previous.minorVersion}`}
          >
            <ChevronLeft />
          </Link>
        ) : (
          <span aria-hidden="true">
            <ChevronLeft />
          </span>
        )}
      </Button>

      <Select
        value={active ? String(active.majorVersion) : undefined}
        onValueChange={(value) => {
          const target = latestPerMajor.get(Number(value));
          if (target) router.push(`${basePath}/${target.id}`);
        }}
      >
        <SelectTrigger
          aria-label="Jump to a major version line"
          className="w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {majorLines.map((version) => (
            <SelectItem
              key={version.majorVersion}
              value={String(version.majorVersion)}
            >
              V{version.majorVersion}.{version.minorVersion}
              {version.id === currentVersionId ? " (current)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="icon-sm"
        disabled={!next}
        asChild={!!next}
      >
        {next ? (
          <Link
            href={`${basePath}/${next.id}`}
            aria-label={`Next version, V${next.majorVersion}.${next.minorVersion}`}
          >
            <ChevronRight />
          </Link>
        ) : (
          <span aria-hidden="true">
            <ChevronRight />
          </span>
        )}
      </Button>
    </div>
  );
}
