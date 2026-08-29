import * as React from "react";
import type { FormEvent } from "react";
import { Search, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BarcodeScanner } from "@/components/domain/dish/barcode-scanner";
import { searchFdc, applyFdcResult } from "@/lib/nutrition/actions";
import type {
  FdcSearchResultItem,
  FdcNutritionDetail,
} from "@/lib/nutrition/fdc-client";

/**
 * PRODUCT_SPEC.md §54.4: "search generic or branded foods... select the
 * matching result." One click on a result both selects and applies it —
 * `applyFdcResult` fetches that food's full detail server-side and returns
 * a shaped, whitelisted payload for the caller to apply to its own (still
 * unsaved) editor form state (Correction 5 — this component never persists
 * anything itself, matching `PartAttachPicker`'s "validates and hands the
 * result back" role for linked Parts).
 */
export function FdcSearchPicker({
  onApply,
}: {
  onApply: (nutrition: FdcNutritionDetail) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"search" | "scan">("search");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<FdcSearchResultItem[] | null>(
    null,
  );
  const [isSearching, setIsSearching] = React.useState(false);
  const [applyingFdcId, setApplyingFdcId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setMode("search");
    setQuery("");
    setResults(null);
    setError(null);
    setIsSearching(false);
    setApplyingFdcId(null);
  }

  async function performSearch(trimmed: string) {
    setIsSearching(true);
    setError(null);
    const result = await searchFdc({ query: trimmed });
    setIsSearching(false);
    if (result.status === "success") {
      setResults(result.results);
    } else {
      setResults(null);
      setError(result.message);
    }
  }

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    await performSearch(trimmed);
  }

  /**
   * BUILD_PLAN.md Slice 14: "Reuses `searchFdc` from Slice 13 with a
   * GTIN/UPC parameter" — the decoded barcode is just handed to the exact
   * same text-search action as the query string (USDA FDC indexes GTIN/UPC
   * for Branded foods), so success/empty/error rendering below is entirely
   * shared with ordinary text search, including the apply flow in
   * `selectResult`.
   */
  async function handleScanDecode(code: string) {
    setMode("search");
    setQuery(code);
    await performSearch(code);
  }

  async function selectResult(item: FdcSearchResultItem) {
    setApplyingFdcId(item.fdcId);
    setError(null);
    const result = await applyFdcResult({ fdcId: item.fdcId });
    setApplyingFdcId(null);
    if (result.status === "success") {
      onApply(result.nutrition);
      setOpen(false);
      reset();
    } else {
      setError(result.message);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setMode("scan");
            setOpen(true);
          }}
        >
          <ScanLine /> Scan barcode
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setMode("search");
            setOpen(true);
          }}
        >
          <Search /> Search
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search USDA FoodData Central</DialogTitle>
            <DialogDescription>
              Find a generic or branded food to populate nutrition. You can edit
              any value afterward.
            </DialogDescription>
          </DialogHeader>

          {mode === "scan" ? (
            <BarcodeScanner
              onDecode={handleScanDecode}
              onCancel={() => setMode("search")}
            />
          ) : (
            <form onSubmit={runSearch} className="flex gap-2">
              <Input
                autoFocus
                placeholder="Search USDA FoodData Central"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search USDA FoodData Central"
              />
              <Button
                type="submit"
                disabled={!query.trim()}
                loading={isSearching}
              >
                Search
              </Button>
            </form>
          )}

          {mode === "search" && error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}

          {mode === "search" && results && (
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {results.length === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  No results. Try a different search, or enter nutrition
                  manually.
                </p>
              )}
              {results.map((item) => (
                <button
                  key={item.fdcId}
                  type="button"
                  disabled={applyingFdcId !== null}
                  onClick={() => selectResult(item)}
                  className="hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring flex cursor-pointer flex-col items-start gap-1 rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-60"
                >
                  <span>{item.description}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {item.dataType}
                    </Badge>
                    {item.brandName && (
                      <span className="text-muted-foreground text-xs">
                        {item.brandName}
                      </span>
                    )}
                  </span>
                  {applyingFdcId === item.fdcId && (
                    <span className="text-muted-foreground text-xs">
                      Loading…
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
