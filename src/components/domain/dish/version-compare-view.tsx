import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type {
  AddedOrRemovedItem,
  AddedOrRemovedPartLink,
  FieldChange,
  VersionComparisonResult,
} from "@/lib/dishes/compare";

// Keyed by `${targetDishId}:${targetDishVersionId}`, resolved server-side
// (§68.5: a linked Part's displayed name/Version label is always a live
// lookup) — this view never resolves a title itself.
export type PartLinkLabelMap = Record<
  string,
  { title: string | null; versionLabel: string }
>;

function partLinkKey(entry: {
  targetDishId: string;
  targetDishVersionId: string;
}) {
  return `${entry.targetDishId}:${entry.targetDishVersionId}`;
}

/**
 * Design remediation pass, §H: a `targetDishId: null` entry is a
 * MATERIALIZED occurrence — its Part was deleted, but its former identity
 * was preserved at deletion time (`materializedTitle`/
 * `materializedVersionLabel`, carried on the entry itself). That's used
 * directly, never a live lookup and never the "Unknown Part" fallback,
 * which stays reserved for a LIVE entry whose lookup genuinely failed (no
 * preserved identity exists for it at all).
 */
function partLinkLabel(
  labels: PartLinkLabelMap,
  entry: {
    targetDishId: string | null;
    targetDishVersionId: string | null;
    materializedTitle?: string | null;
    materializedVersionLabel?: string | null;
  },
): string {
  if (entry.targetDishId == null || entry.targetDishVersionId == null) {
    const title = entry.materializedTitle ?? "Unknown Part";
    return entry.materializedVersionLabel
      ? `${title} ${entry.materializedVersionLabel}`
      : title;
  }
  const resolved =
    labels[
      partLinkKey({
        targetDishId: entry.targetDishId,
        targetDishVersionId: entry.targetDishVersionId,
      })
    ];
  const title = resolved?.title ?? "Unknown Part";
  return resolved?.versionLabel ? `${title} ${resolved.versionLabel}` : title;
}

/**
 * PRODUCT_SPEC.md §94.2/§94.3: changed content first, grouped by cooking
 * meaning (metadata → Sections → ingredients → instructions → linked Parts →
 * nutrition). Never renders a group with nothing in it — an empty comparison
 * shows one plain "no differences" message instead (§94.6: comparison never
 * mutates either Version, so an unchanged pair is a perfectly normal result,
 * not an error state).
 */
export function VersionCompareView({
  result,
  fromLabel,
  toLabel,
  partLinkLabels,
}: {
  result: VersionComparisonResult;
  fromLabel: string;
  toLabel: string;
  partLinkLabels: PartLinkLabelMap;
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
  const hasPartLinkChanges =
    result.partLinks.added.length > 0 ||
    result.partLinks.removed.length > 0 ||
    result.partLinks.changed.length > 0 ||
    result.partLinks.reordered;

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
          {result.sections.reordered && <ReorderedNote>Sections</ReorderedNote>}
        </ComparisonGroup>
      )}

      {hasIngredientChanges && (
        <ComparisonGroup title="Ingredients">
          {result.ingredients.changed.length > 0 && (
            <ul className="flex flex-col gap-2">
              {result.ingredients.changed.map((change) => (
                <ChangedRow key={change.lineageId}>
                  <p className="font-medium">{change.name}</p>
                  <p className="text-muted-foreground">
                    {fromLabel}: {change.before}
                  </p>
                  <p>
                    {toLabel}: {change.after}
                  </p>
                </ChangedRow>
              ))}
            </ul>
          )}
          <AddedRemovedList
            added={result.ingredients.added}
            removed={result.ingredients.removed}
          />
          {result.ingredients.reordered && (
            <ReorderedNote>Ingredients</ReorderedNote>
          )}
        </ComparisonGroup>
      )}

      {hasInstructionChanges && (
        <ComparisonGroup title="Instructions">
          {result.instructions.changed.length > 0 && (
            <ul className="flex flex-col gap-2">
              {result.instructions.changed.map((change) => (
                <ChangedRow key={change.lineageId}>
                  <p className="text-muted-foreground">
                    {fromLabel}: {change.before}
                  </p>
                  <p>
                    {toLabel}: {change.after}
                  </p>
                </ChangedRow>
              ))}
            </ul>
          )}
          <AddedRemovedList
            added={result.instructions.added}
            removed={result.instructions.removed}
          />
          {result.instructions.reordered && (
            <ReorderedNote>Instructions</ReorderedNote>
          )}
        </ComparisonGroup>
      )}

      {hasPartLinkChanges && (
        <ComparisonGroup title="Linked Parts">
          {result.partLinks.changed.length > 0 && (
            <ul className="flex flex-col gap-2">
              {result.partLinks.changed.map((change) => (
                <ChangedRow key={change.lineageId}>
                  <p className="text-muted-foreground">
                    {fromLabel}: {partLinkLabel(partLinkLabels, change.before)}
                    {change.multiplierChanged && !change.retargeted
                      ? ` (×${change.before.multiplier})`
                      : ""}
                  </p>
                  <p>
                    {toLabel}: {partLinkLabel(partLinkLabels, change.after)}
                    {change.multiplierChanged && !change.retargeted
                      ? ` (×${change.after.multiplier})`
                      : ""}
                  </p>
                </ChangedRow>
              ))}
            </ul>
          )}
          <PartLinkAddedRemovedList
            added={result.partLinks.added}
            removed={result.partLinks.removed}
            labels={partLinkLabels}
          />
          {result.partLinks.reordered && (
            <ReorderedNote>Linked Parts</ReorderedNote>
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
  children: ReactNode;
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

// Design remediation pass, PRODUCT_SPEC.md §94: semantic (not color-only —
// every row keeps its "Added"/"Removed"/"Changed" text label too) emphasis
// so a long comparison scans faster. Accessible in both themes: these are
// the same `--brand-green`/`--destructive` tokens already used elsewhere
// in this app for plain body text (e.g. form error copy), not a new,
// unvetted color pairing.
const ADDED_CLASSNAME = "text-brand-green";
const REMOVED_CLASSNAME = "text-destructive";

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
        <li key={`added-${item.lineageId}`} className={ADDED_CLASSNAME}>
          Added: {item.label}
        </li>
      ))}
      {removed.map((item) => (
        <li key={`removed-${item.lineageId}`} className={REMOVED_CLASSNAME}>
          Removed: {item.label}
        </li>
      ))}
    </ul>
  );
}

function PartLinkAddedRemovedList({
  added,
  removed,
  labels,
}: {
  added: AddedOrRemovedPartLink[];
  removed: AddedOrRemovedPartLink[];
  labels: PartLinkLabelMap;
}) {
  if (added.length === 0 && removed.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {added.map((item) => (
        <li key={`added-${item.lineageId}`} className={ADDED_CLASSNAME}>
          Added: {partLinkLabel(labels, item)}
        </li>
      ))}
      {removed.map((item) => (
        <li key={`removed-${item.lineageId}`} className={REMOVED_CLASSNAME}>
          Removed: {partLinkLabel(labels, item)}
        </li>
      ))}
    </ul>
  );
}

// "Changed" gets a neutral accent (a left border, not a text color) rather
// than green/red — it's neither an addition nor a removal, so borrowing
// either color would misstate which bucket it's in.
function ChangedRow({ children }: { children: ReactNode }) {
  return (
    <li className="border-muted-foreground/40 flex flex-col border-l-2 pl-2 text-sm">
      {children}
    </li>
  );
}

function ReorderedNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
      <span
        className="border-muted-foreground/40 inline-block size-2 rounded-full border-2"
        aria-hidden="true"
      />
      {children} were reordered.
    </p>
  );
}
