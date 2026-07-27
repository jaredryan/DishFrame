"use client";

import { useRouter } from "next/navigation";
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
      <Select value={fromId} onValueChange={(value) => navigate(value, toId)}>
        <SelectTrigger aria-label="Compare from version" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {versions.map((version) => (
            <SelectItem key={version.id} value={version.id}>
              V{version.majorVersion}.{version.minorVersion}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground text-sm">vs.</span>
      <Select value={toId} onValueChange={(value) => navigate(fromId, value)}>
        <SelectTrigger aria-label="Compare to version" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {versions.map((version) => (
            <SelectItem key={version.id} value={version.id}>
              V{version.majorVersion}.{version.minorVersion}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
