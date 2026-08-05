"use client";

import * as React from "react";
import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// PRODUCT_SPEC.md §92.4: obviously fictional, hard-coded demo content only —
// this module must never import prisma, a Server Action, or any domain
// service, and must never write anything. `example-recipe-demo.test.ts`
// enforces both the import boundary (statically) and that interacting with
// it never calls a mocked persistence function.
const EXAMPLE_VERSIONS = {
  "1.0": {
    label: "V1.0",
    note: "First attempt — a little thin.",
    ingredients: [
      "2 cans crushed tomatoes",
      "1 tbsp chili powder",
      "1 lb ground beef",
    ],
  },
  "2.0": {
    label: "V2.0",
    note: "Simmered longer, added a second pepper.",
    ingredients: [
      "2 cans crushed tomatoes",
      "2 tbsp chili powder",
      "1 lb ground beef",
      "1 chipotle pepper, minced",
    ],
  },
} as const;

type ExampleVersionKey = keyof typeof EXAMPLE_VERSIONS;

const EXAMPLE_PART_NAME = "Skillet Cornbread";

export function ExampleRecipeDemo() {
  const [versionKey, setVersionKey] = React.useState<ExampleVersionKey>("2.0");
  const [showPart, setShowPart] = React.useState(false);
  const version = EXAMPLE_VERSIONS[versionKey];

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-foreground text-sm font-semibold">
            Example: Weeknight Chili
          </p>
          <Badge variant="outline">example — not saved</Badge>
        </div>
        <div className="flex gap-1">
          {(Object.keys(EXAMPLE_VERSIONS) as ExampleVersionKey[]).map((key) => (
            <Button
              key={key}
              type="button"
              size="xs"
              variant={key === versionKey ? "secondary" : "ghost"}
              onClick={() => setVersionKey(key)}
            >
              {EXAMPLE_VERSIONS[key].label}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-muted-foreground text-xs italic">{version.note}</p>

      <ul className="text-foreground flex flex-col gap-1 text-sm">
        {version.ingredients.map((ingredient) => (
          <li key={ingredient}>{ingredient}</li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setShowPart((prev) => !prev)}
      >
        <Layers aria-hidden="true" />
        {showPart ? "Hide linked Part" : "Show linked Part"}
      </Button>

      {showPart && (
        <div className="border-border bg-background rounded-lg border border-dashed p-3 text-sm">
          <p className="text-foreground font-medium">{EXAMPLE_PART_NAME}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            A reusable Part linked into this Recipe — cook it here, or reuse it
            in any other Recipe without duplicating it.
          </p>
        </div>
      )}
    </div>
  );
}
