import type { Metadata } from "next";
import { BookOpen, Plus, Upload, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = {
  title: "Recipes",
};

export default function RecipesPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            Recipes
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Every recipe you organize in DishFrame will live here, built from
            sections you write or reuse.
          </p>
        </div>
        <div className="flex gap-2">
          <Button disabled>
            <Plus />
            Create
          </Button>
          <Button variant="outline" disabled>
            <Upload />
            Import
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          placeholder="Search recipes"
          disabled
          className="pl-9"
          aria-label="Search recipes (coming soon)"
        />
      </div>

      <EmptyState
        icon={BookOpen}
        title="No recipes yet"
        description="Recipes you create or import will show up here."
      />
    </div>
  );
}
