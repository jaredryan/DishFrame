"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Importer live-QA polish pass (task §1): the Upload File control was a
 * bare native `<input type="file">` — replaced here with a conventional
 * DishFrame-styled drag-and-drop target, matching the bordered/card
 * treatment used elsewhere (`border-border bg-card`, hover/focus states)
 * instead of the browser's own file-input chrome. The native input is
 * still what actually receives the file — this only changes its
 * presentation and adds a drop target on top of it, so the existing
 * validation/extraction pipeline downstream is untouched.
 */
export function FileDropzone({
  id,
  accept,
  onFileSelectedAction,
  label,
  helpText,
  disabled = false,
}: {
  id: string;
  accept: string;
  onFileSelectedAction: (file: File) => void;
  label: string;
  helpText: string;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  // Tracks nested dragenter/dragleave pairs so a child element's own
  // dragleave (fired while still inside the dropzone) doesn't flicker the
  // drag-over state off early.
  const dragDepth = React.useRef(0);

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setIsDragOver(true);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    // Required for `onDrop` to fire at all — a bare `dragenter` without a
    // handled `dragover` never becomes a valid drop target.
    event.preventDefault();
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFileSelectedAction(file);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFileSelectedAction(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-border bg-card flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
          !disabled &&
            "hover:border-primary/50 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 cursor-pointer focus-visible:ring-[3px] focus-visible:outline-none",
          isDragOver && "border-primary bg-primary/5",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <UploadCloud
          className={cn(
            "text-muted-foreground size-6",
            isDragOver && "text-primary",
          )}
          aria-hidden="true"
        />
        <p id={`${id}-label`} className="text-foreground text-sm font-medium">
          {label}
        </p>
        <p id={`${id}-help`} className="text-muted-foreground text-xs">
          {helpText}
        </p>
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleInputChange}
        className="sr-only"
      />
    </div>
  );
}
