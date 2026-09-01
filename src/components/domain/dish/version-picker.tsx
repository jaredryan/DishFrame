"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { versionLabel } from "@/lib/dishes/version-note";

export type VersionOption = {
  id: string;
  majorVersion: number;
  minorVersion: number;
  yieldQuantity?: number | null;
  yieldUnit?: string | null;
};

function matchesQuery(version: VersionOption, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^v/, "");
  if (!q) return true;
  return `${version.majorVersion}.${version.minorVersion}`.startsWith(q);
}

/**
 * The one canonical Version picker (nav/details QA batch item 6): opening it
 * shows every eligible saved Version in a scrollable list, typing narrows by
 * number ("1", "2", "1.2", ...). Replaces the old prev/next-arrows-plus-
 * dropdown combination everywhere a user selects one exact saved Version.
 */
export function VersionPicker({
  id,
  versions,
  currentVersionId,
  value,
  onChangeAction,
  disabled,
  placeholder = "Select a Version",
  ariaLabel = "Select a Version",
  className,
  triggerClassName,
  footer,
}: {
  id?: string;
  /** Must already be ordered ascending by (majorVersion, minorVersion). */
  versions: VersionOption[];
  currentVersionId?: string | null;
  value: string | undefined;
  onChangeAction: (versionId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  /** Rendered below the version list — e.g. a "Show earlier versions…"
   * pagination action for a caller whose Version list loads incrementally. */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selected = versions.find((v) => v.id === value);
  // Newest first — the natural order for picking a specific saved Version.
  const ordered = React.useMemo(() => [...versions].reverse(), [versions]);
  const filtered = React.useMemo(
    () =>
      search.trim()
        ? ordered.filter((version) => matchesQuery(version, search))
        : ordered,
    [ordered, search],
  );

  function handleSelect(versionId: string) {
    onChangeAction(versionId);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled || versions.length === 0}
          className={cn("w-40 justify-between font-normal", triggerClassName)}
        >
          <span
            className={cn("truncate", !selected && "text-muted-foreground")}
          >
            {selected
              ? versionLabel(selected.majorVersion, selected.minorVersion) +
                (selected.id === currentVersionId ? " (current)" : "")
              : placeholder}
          </span>
          <ChevronsUpDown
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("flex w-56 flex-col gap-2 p-2", className)}
      >
        <SearchInput
          autoFocus
          placeholder="Search versions…"
          aria-label="Search versions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ul
          role="listbox"
          aria-label="Versions"
          className="flex max-h-64 flex-col gap-0.5 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <li className="text-muted-foreground px-2 py-3 text-center text-sm">
              No versions match.
            </li>
          ) : (
            filtered.map((version) => {
              const isSelected = version.id === value;
              return (
                <li key={version.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(version.id)}
                    className={cn(
                      "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                      isSelected && "bg-accent text-accent-foreground",
                    )}
                  >
                    <span>
                      {versionLabel(version.majorVersion, version.minorVersion)}
                      {version.id === currentVersionId ? (
                        <span className="text-muted-foreground">
                          {" "}
                          (current)
                        </span>
                      ) : null}
                    </span>
                    {isSelected && (
                      <Check className="size-4 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {footer}
      </PopoverContent>
    </Popover>
  );
}
