import { Card, CardContent } from "@/components/ui/card";
import type {
  AddedOrRemovedItem,
  FieldChange,
  VersionComparisonResult,
} from "@/lib/dishes/compare";

/**
 * PRODUCT_SPEC.md §94.2/§94.3: changed content first, grouped by cooking
 * meaning (metadata → Sections → ingredients → instructions → nutrition —
 * no linked-Parts group, since Slice 6 hasn't wired up `PartLink` yet).
 * Never renders a group with nothing in it — an empty comparison shows one
 * plain "no differences" message instead (§94.6: comparison never mutates
 * either Version, so an unchanged pair is a perfectly normal result, not an
 * error state).
 */
export function VersionCompareView({
  result,
  fromLabel,
  toLabel,
}: {
  result: VersionComparisonResult;
  fromLabel: string;
  toLabel: string;
}) {
  if (!result.hasChanges) {
    return (
      <p className="text-muted-foreground text-sm">
        No differences between {fromLabel} and {toLabel}.
      </p>
    );
  }

  const hasSectionChanges =
    result.sections.added.length > 0 ||
    result.sections.removed.length > 0 ||
    result.sections.reordered;
  const hasIngredientChanges =
    result.ingredients.added.length > 0 ||
    result.ingredients.removed.length > 0 ||
    result.ingredients.changed.length > 0 ||
    result.ingredients.reordered;
  const hasInstructionChanges =
    result.instructions.added.length > 0 ||
    result.instructions.removed.length > 0 ||
    result.instructions.changed.length > 0 ||
    result.instructions.reordered;

  return (
    <div className="flex flex-col gap-4">
      {result.metadata.length > 0 && (
        <ComparisonGroup title="Details">
          <FieldChangeList changes={result.metadata} />
        </ComparisonGroup>
      )}

      {hasSectionChanges && (
        <ComparisonGroup title="Sections">
          <AddedRemovedList
            added={result.sections.added}
            removed={result.sections.removed}
          />
          {result.sections.reordered && (
            <p className="text-muted-foreground text-sm">
              Sections were reordered.
            </p>
          )}
        </ComparisonGroup>
      )}

      {hasIngredientChanges && (
        <ComparisonGroup title="Ingredients">
          {result.ingredients.changed.length > 0 && (
            <ul className="flex flex-col gap-2">
              {result.ingredients.changed.map((change) => (
                <li key={change.lineageId} className="text-sm">
                  <p className="font-medium">{change.name}</p>
                  <p className="text-muted-foreground">
                    {fromLabel}: {change.before}
                  </p>
                  <p>
                    {toLabel}: {change.after}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <AddedRemovedList
            added={result.ingredients.added}
            removed={result.ingredients.removed}
          />
          {result.ingredients.reordered && (
            <p className="text-muted-foreground text-sm">
              Ingredients were reordered.
            </p>
          )}
        </ComparisonGroup>
      )}

      {hasInstructionChanges && (
        <ComparisonGroup title="Instructions">
          {result.instructions.changed.length > 0 && (
            <ul className="flex flex-col gap-2">
              {result.instructions.changed.map((change) => (
                <li key={change.lineageId} className="text-sm">
                  <p className="text-muted-foreground">
                    {fromLabel}: {change.before}
                  </p>
                  <p>
                    {toLabel}: {change.after}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <AddedRemovedList
            added={result.instructions.added}
            removed={result.instructions.removed}
          />
          {result.instructions.reordered && (
            <p className="text-muted-foreground text-sm">
              Instructions were reordered.
            </p>
          )}
        </ComparisonGroup>
      )}

      {result.nutrition.length > 0 && (
        <ComparisonGroup title="Nutrition">
          <FieldChangeList changes={result.nutrition} />
        </ComparisonGroup>
      )}
    </div>
  );
}

function ComparisonGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function FieldChangeList({ changes }: { changes: FieldChange[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {changes.map((change) => (
        <li key={change.field} className="text-sm">
          <span className="font-medium">{change.label}: </span>
          <span className="text-muted-foreground">{change.before ?? "—"}</span>
          <span className="text-muted-foreground"> → </span>
          <span>{change.after ?? "—"}</span>
        </li>
      ))}
    </ul>
  );
}

function AddedRemovedList({
  added,
  removed,
}: {
  added: AddedOrRemovedItem[];
  removed: AddedOrRemovedItem[];
}) {
  if (added.length === 0 && removed.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {added.map((item) => (
        <li key={`added-${item.lineageId}`}>Added: {item.label}</li>
      ))}
      {removed.map((item) => (
        <li key={`removed-${item.lineageId}`} className="text-muted-foreground">
          Removed: {item.label}
        </li>
      ))}
    </ul>
  );
}
