import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";

export const metadata: Metadata = {
  title: "Home",
};

const SECTIONS = [
  { title: "Recent Recipes" },
  { title: "Active Dishes" },
  { title: "Saved Parts" },
];

export default function AppHomePage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            Start your DishFrame
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Add your first recipe or bring one over from your existing notes. As
            you cook, DishFrame will help you remember what worked and improve
            it next time.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/recipes/new">
              <Plus />
              Create a recipe
            </Link>
          </Button>
          <DisabledActionHint explanation="Importing recipes from other sources isn't available yet — for now, create the recipe directly.">
            <Button variant="outline" disabled>
              <Upload />
              Import a recipe
            </Button>
          </DisabledActionHint>
          <span className="text-muted-foreground self-center text-xs">
            Import a recipe: coming soon
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <div
            key={section.title}
            className="border-border bg-card rounded-xl border p-5"
          >
            <h2 className="font-heading text-foreground text-sm font-semibold">
              {section.title}
            </h2>
            <p className="text-muted-foreground mt-3 text-sm">
              Nothing here yet.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
