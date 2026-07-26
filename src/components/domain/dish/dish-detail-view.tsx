import { Prisma } from "@/generated/prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { DishDetailActions } from "@/components/domain/dish/dish-detail-actions";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { dishDetailInclude } from "@/lib/dishes/queries";

type DishDetail = Prisma.DishGetPayload<{ include: typeof dishDetailInclude }>;

function formatQuantity(value: Prisma.Decimal | null): string | null {
  return value ? value.toNumber().toString() : null;
}

function formatIngredientLine(ingredient: {
  quantity: Prisma.Decimal | null;
  quantityEnd: Prisma.Decimal | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  name: string;
  preparationNote: string | null;
}): string {
  const parts: string[] = [];
  const quantity = formatQuantity(ingredient.quantity);
  const quantityEnd = formatQuantity(ingredient.quantityEnd);

  if (ingredient.displayText) {
    parts.push(ingredient.displayText);
  } else if (quantity) {
    parts.push(ingredient.isApproximate ? `about ${quantity}` : quantity);
    if (quantityEnd) parts.push(`–${quantityEnd}`);
  }
  if (ingredient.unit) parts.push(ingredient.unit);
  parts.push(ingredient.name);

  const line = parts.join(" ").replace(/ –/, "–");
  return ingredient.preparationNote
    ? `${line}, ${ingredient.preparationNote}`
    : line;
}

export function DishDetailView({
  dish,
  kind,
}: {
  dish: DishDetail;
  kind: DishKindValue;
}) {
  const version = dish.currentVersion;
  const label = kind === "PART" ? "Part" : "Recipe";

  if (!version) {
    return (
      <p className="text-muted-foreground">
        This {label.toLowerCase()} has no saved content yet.
      </p>
    );
  }

  const versionLabel = `V${version.majorVersion}.${version.minorVersion}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            {version.title}
          </h1>
          <StageBadge stage={dish.stage} />
          <span className="text-muted-foreground text-xs tabular-nums">
            {versionLabel}
          </span>
        </div>
        {dish.cuisine && (
          <p className="text-muted-foreground text-sm">{dish.cuisine}</p>
        )}
        {version.description && <p>{version.description}</p>}

        <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
          {version.yieldQuantity && (
            <span>
              Makes {formatQuantity(version.yieldQuantity)}{" "}
              {version.yieldUnit ?? ""}
            </span>
          )}
          {version.prepTimeMinutes != null && (
            <span>Prep {version.prepTimeMinutes} min</span>
          )}
          {version.cookTimeMinutes != null && (
            <span>Cook {version.cookTimeMinutes} min</span>
          )}
          {version.difficulty && <span>{version.difficulty}</span>}
        </div>

        <DishDetailActions dishId={dish.id} kind={kind} stage={dish.stage} />
      </div>

      <div className="flex flex-col gap-4">
        {version.sections.map((section) => {
          return (
            <Card key={section.id}>
              <CardContent className="flex flex-col gap-3">
                {section.name && (
                  <h2 className="font-heading text-lg font-medium">
                    {section.name}
                  </h2>
                )}
                {section.guidanceNote && (
                  <p className="text-muted-foreground text-sm italic">
                    {section.guidanceNote}
                  </p>
                )}

                {section.ingredients.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {section.ingredients
                      .filter((i) => i.substituteForIngredientId === null)
                      .map((ingredient) => (
                        <li key={ingredient.id} className="text-sm">
                          {formatIngredientLine(ingredient)}
                          {ingredient.isOptional && (
                            <span className="text-muted-foreground">
                              {" "}
                              (optional)
                            </span>
                          )}
                          {ingredient.substitute && (
                            <span className="text-muted-foreground block pl-4 text-xs">
                              Substitute:{" "}
                              {formatIngredientLine(ingredient.substitute)}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                )}

                {section.instructions.length > 0 && (
                  <ol className="flex flex-col gap-2">
                    {section.instructions.map((instruction, i) => (
                      <li key={instruction.id} className="flex gap-2 text-sm">
                        <span className="text-muted-foreground tabular-nums">
                          {i + 1}.
                        </span>
                        <span>{instruction.text}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
