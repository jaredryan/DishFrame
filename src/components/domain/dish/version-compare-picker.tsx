"use client";

import { useRouter } from "next/navigation";
import { VersionPicker } from "@/components/domain/dish/version-picker";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { DishVersionSummary } from "@/lib/dishes/queries";

export function VersionComparePicker({
  kind,
  dishId,
  versions,
  fromId,
  toId,
}: {
  kind: DishKindValue;
  dishId: string;
  versions: DishVersionSummary[];
  fromId: string;
  toId: string;
}) {
  const router = useRouter();
  const basePath = `${dishBasePath(kind)}/${dishId}/compare`;

  function navigate(nextFrom: string, nextTo: string) {
    router.push(`${basePath}?from=${nextFrom}&to=${nextTo}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <VersionPicker
        versions={versions}
        value={fromId}
        onChangeAction={(value) => navigate(value, toId)}
        ariaLabel="Compare from version"
      />
      <span className="text-muted-foreground text-sm">vs.</span>
      <VersionPicker
        versions={versions}
        value={toId}
        onChangeAction={(value) => navigate(fromId, value)}
        ariaLabel="Compare to version"
      />
    </div>
  );
}
