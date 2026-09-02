"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeEmail } from "@/lib/auth/email";

const PLAUSIBLE_EMAIL = /\S+@\S+\.\S+/;

export function isPlausibleEmail(value: string): boolean {
  return PLAUSIBLE_EMAIL.test(value.trim());
}

/**
 * The one shared multi-recipient input (toast/Send/Publish QA batch item 4):
 * type an email, Enter/comma/blur/a split paste commits it to a removable
 * chip; case-insensitively deduped; an implausible address is flagged
 * inline rather than silently dropped or silently accepted. Used by both
 * the single-item Send modal and the `/share` Send flow's recipient step —
 * never a second chip implementation.
 */
export function EmailChipInput({
  id,
  value,
  onChangeAction,
  placeholder = "name@example.com",
  disabled,
  autoFocus,
  ariaLabel = "Recipients",
  className,
}: {
  id?: string;
  value: string[];
  onChangeAction: (emails: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const errorId = id ? `${id}-error` : undefined;

  function addOne(raw: string): boolean {
    const normalized = normalizeEmail(raw);
    if (!normalized) return true;
    if (!isPlausibleEmail(normalized)) {
      setError(`"${raw.trim()}" isn't a valid email address.`);
      return false;
    }
    if (!value.includes(normalized)) {
      onChangeAction([...value, normalized]);
    }
    return true;
  }

  function commitDraft() {
    if (!draft.trim()) return;
    if (addOne(draft)) {
      setDraft("");
      setError(null);
    }
  }

  function removeAt(index: number) {
    onChangeAction(value.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
      removeAt(value.length - 1);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!/[,\s]/.test(text.trim())) return; // a single token: let default paste land in the field
    event.preventDefault();
    const parts = text
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    // Accumulate locally rather than calling addOne per part — addOne closes
    // over the current `value` prop, so sibling calls in this same loop
    // would each diff against the same stale array and overwrite each other.
    const next = [...value];
    let firstError: string | null = null;
    for (const part of parts) {
      const normalized = normalizeEmail(part);
      if (!normalized) continue;
      if (!isPlausibleEmail(normalized)) {
        if (firstError === null) {
          firstError = `"${part}" isn't a valid email address.`;
        }
        continue;
      }
      if (!next.includes(normalized)) next.push(normalized);
    }
    onChangeAction(next);
    setDraft("");
    setError(firstError);
  }

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "border-input focus-within:border-ring focus-within:ring-ring/50 flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1.5 focus-within:ring-3",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((email, index) => (
          <span
            key={email}
            className="bg-primary/15 text-brand-blue-text flex items-center gap-1 rounded-4xl py-0.5 pr-1 pl-2 text-xs font-medium"
          >
            {email}
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label={`Remove ${email}`}
              className="hover:bg-primary/20 cursor-pointer rounded-full p-0.5"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="email"
          value={draft}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={commitDraft}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="placeholder:text-muted-foreground min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:opacity-70"
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
