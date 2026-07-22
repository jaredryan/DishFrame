import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = {
  title: "Parts",
};

export default function PartsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Reusable Parts
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Save the sauces, sides, staples, and preparations you use across more
          than one recipe.
        </p>
      </div>

      <EmptyState
        icon={Layers}
        title="No saved parts yet"
        description="Parts you save from a recipe will show up here, ready to reuse."
      />
    </div>
  );
}
