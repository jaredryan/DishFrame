import * as React from "react";
import { Copy as CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecipePartPicker } from "@/components/domain/dish/recipe-part-picker";
import { SelectableDishRow } from "@/components/domain/dish/selectable-dish-row";
import { RichDishVersionPicker } from "@/components/domain/dish/version-picker-field";
import {
  listShareableItemsForSender,
  publishDishes,
  type PublishDishesResultItem,
} from "@/lib/sharing/actions";
import { PUBLISH_MAX_ITEMS } from "@/lib/sharing/schema";
import type { ShareLinkModeValue } from "@/lib/sharing/schema";
import type { ShareableItemSummary } from "@/lib/sharing/collections";

type Step = "select" | "settings" | "result";

function ResultRow({ result }: { result: PublishDishesResultItem }) {
  const [copied, setCopied] = React.useState(false);

  if (result.status === "error") {
    return (
      <li className="border-destructive/30 bg-destructive/5 rounded-lg border p-3 text-sm">
        <p className="text-destructive-text">{result.message}</p>
      </li>
    );
  }

  async function handleCopy() {
    if (result.status !== "success") return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
  }

  return (
    <li className="border-border space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {result.title}
        </span>
        <SemanticChip semantic="neutral">
          {result.dishKind === "PART" ? "Part" : "Recipe"}
        </SemanticChip>
      </div>
      <div className="border-border bg-muted flex items-center gap-2 rounded-md border px-3 py-2">
        <code className="flex-1 truncate text-sm">{result.url}</code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy link for ${result.title}`}
          onClick={handleCopy}
        >
          <CopyIcon aria-hidden="true" />
        </Button>
      </div>
      {copied && <p className="text-muted-foreground text-xs">Copied.</p>}
    </li>
  );
}

/**
 * `/share`'s "Share → Publish" entry point: the generalized, multi-item
 * counterpart to the contextual per-Dish Publish action
 * (`share-dialog.tsx`). One shared settings payload applies to every
 * selected Recipe/Part; each creates its own independent public ShareLink
 * (never a new collection-link concept) via the `publishDishes` server
 * action, which resolves and reports every item's outcome independently —
 * see that action for why a client-side per-item loop would risk a
 * confusing silent partial success.
 */
export function BulkPublishDialog({
  open,
  onOpenChange,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once results are shown, so the caller can refresh the Public
   * links list on `/share` to reflect the newly created links. */
  onPublished?: () => void;
}) {
  const [step, setStep] = React.useState<Step>("select");
  const [items, setItems] = React.useState<ShareableItemSummary[] | null>(null);
  const [itemsError, setItemsError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [mode, setMode] = React.useState<ShareLinkModeValue>("FIXED_SNAPSHOT");
  const [versionByDishId, setVersionByDishId] = React.useState<
    Record<string, string>
  >({});
  const [showCreatorName, setShowCreatorName] = React.useState(false);
  const [expiresAt, setExpiresAt] = React.useState("");
  const [results, setResults] = React.useState<
    PublishDishesResultItem[] | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      loadedRef.current = false;
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;
    startTransition(async () => {
      const result = await listShareableItemsForSender();
      if (result.status === "error") {
        setItemsError(result.message);
        return;
      }
      setItems(result.items);
    });
  }, [open]);

  function close() {
    onOpenChange(false);
    setStep("select");
    setItems(null);
    setItemsError(null);
    setSearch("");
    setSelected(new Set());
    setMode("FIXED_SNAPSHOT");
    setVersionByDishId({});
    setShowCreatorName(false);
    setExpiresAt("");
    setResults(null);
    setError(null);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!items) return;
    setSelected(
      new Set(items.slice(0, PUBLISH_MAX_ITEMS).map((item) => item.id)),
    );
  }

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const response = await publishDishes({
        dishIds: [...selected],
        mode,
        versionIdByDishId:
          mode === "FIXED_SNAPSHOT" ? versionByDishId : undefined,
        showCreatorName,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      if (response.status === "error") {
        setError(response.message);
        return;
      }
      setResults(response.results);
      setStep("result");
      onPublished?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish</DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Choose which Recipes and Parts to publish."
              : step === "settings"
                ? "Anyone with a link can view a read-only page — no DishFrame account required. Saving a copy does require signing in."
                : "Each item now has its own public link."}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
          {step === "select" && (
            <RecipePartPicker
              items={items}
              itemsError={itemsError}
              search={search}
              onSearchChange={setSearch}
              selected={selected}
              onToggle={toggleSelected}
              onSelectAll={selectAll}
              maxItems={PUBLISH_MAX_ITEMS}
            />
          )}

          {step === "settings" && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {selected.size} item{selected.size === 1 ? "" : "s"} selected
              </p>
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select
                  value={mode}
                  onValueChange={(value) =>
                    setMode(value as ShareLinkModeValue)
                  }
                >
                  <SelectTrigger className="w-full" aria-label="Mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED_SNAPSHOT">
                      Share a fixed version
                    </SelectItem>
                    <SelectItem value="CURRENT">
                      Share latest version
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode === "FIXED_SNAPSHOT" && items && (
                <div className="space-y-3">
                  <Label>Version to publish for each</Label>
                  {[...selected].map((dishId) => {
                    const item = items.find((i) => i.id === dishId);
                    if (!item) return null;
                    return (
                      <div key={dishId} className="flex flex-col gap-2">
                        <SelectableDishRow
                          item={item}
                          selectionControl="remove"
                          onRemove={() => toggleSelected(dishId)}
                        />
                        <RichDishVersionPicker
                          id={`publish-version-${dishId}`}
                          kind={item.kind}
                          dishId={dishId}
                          value={versionByDishId[dishId] ?? null}
                          onChangeAction={(versionId) =>
                            setVersionByDishId((prev) => ({
                              ...prev,
                              [dishId]: versionId,
                            }))
                          }
                          className="pl-2"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label htmlFor="bulk-publish-show-name">Show my name</Label>
                <Switch
                  id="bulk-publish-show-name"
                  checked={showCreatorName}
                  onCheckedChange={setShowCreatorName}
                  aria-label="Show my name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bulk-publish-expires">Expires (optional)</Label>
                <input
                  id="bulk-publish-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  className="border-input bg-background flex h-9 w-full max-w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs"
                />
              </div>

              {error && (
                <p role="alert" className="text-destructive-text text-sm">
                  {error}
                </p>
              )}
            </div>
          )}

          {step === "result" && results && (
            <ul className="max-h-96 space-y-3 overflow-y-auto">
              {results.map((result) => (
                <ResultRow key={result.dishId} result={result} />
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          {step === "select" ? (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("settings")}
                disabled={selected.size === 0}
              >
                Continue
              </Button>
            </>
          ) : step === "settings" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                onClick={handlePublish}
                disabled={
                  isPending ||
                  (mode === "FIXED_SNAPSHOT" &&
                    ![...selected].every((id) => versionByDishId[id]))
                }
              >
                {isPending ? "Publishing…" : "Publish"}
              </Button>
            </>
          ) : (
            <Button onClick={close}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
