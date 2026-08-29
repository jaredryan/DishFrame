/**
 * Upload File's source abstraction. `.md`/`.txt` both read as plain text
 * entirely client-side — extracted text feeds the exact same
 * `proposeImportFromPaste` parser Paste Text uses, so nothing is ever
 * uploaded to the server and no source file is persisted for those two.
 *
 * `.rga` (a Recipe Gallery export) is a binary ZIP archive, not text — it
 * can't be read via `File.text()`, but it's still never uploaded: a real
 * export can be ~28MB, well past Next's Server Action body limit and
 * Vercel Functions' own payload ceiling, so `extractRecipesFromArchiveFile`
 * below reads the selected file's bytes with `File.arrayBuffer()` and
 * extracts every contained recipe entirely in the browser
 * (`recipe-gallery-import.ts`) — nothing is ever sent to the server until
 * the normalized drafts the user selects are confirmed. This module
 * intentionally isn't named after Markdown so formats like these can live
 * alongside `.md`/`.txt` without a rename.
 */

import {
  extractRecipesFromArchive,
  type ArchiveImportResult,
} from "@/lib/importExport/recipe-gallery-import";

export type SupportedImportFileExtension = ".md" | ".txt" | ".rga";
export const SUPPORTED_IMPORT_FILE_EXTENSIONS: SupportedImportFileExtension[] =
  [".md", ".txt", ".rga"];

const TEXT_EXTENSIONS: SupportedImportFileExtension[] = [".md", ".txt"];
const ARCHIVE_EXTENSIONS: SupportedImportFileExtension[] = [".rga"];

// A generous ceiling for a recipe text document, not a realistic recipe
// length — mirrors the paste importer's own 20,000-character text cap.
export const MAX_IMPORT_FILE_SIZE_BYTES = 512 * 1024;

// A Recipe Gallery export is a whole recipe library (images included), so
// it needs a much larger ceiling than a single pasted/typed recipe —
// mirrors recipe-gallery-import.ts's own archive-level size cap, which is
// the boundary that actually matters (this is only a fast client-side
// rejection before spending a request on an obviously-oversized file).
export const MAX_ARCHIVE_IMPORT_FILE_SIZE_BYTES = 150 * 1024 * 1024;

export type ImportFileKind = "text" | "archive" | "unsupported";

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

export function getImportFileKind(fileName: string): ImportFileKind {
  const extension = getExtension(fileName);
  if (TEXT_EXTENSIONS.includes(extension as SupportedImportFileExtension)) {
    return "text";
  }
  if (ARCHIVE_EXTENSIONS.includes(extension as SupportedImportFileExtension)) {
    return "archive";
  }
  return "unsupported";
}

export type FileValidationResult =
  { status: "ok" } | { status: "error"; message: string };

export type FileTextExtractionResult =
  { status: "success"; text: string } | { status: "error"; message: string };

export async function extractTextFromImportFile(
  file: File,
): Promise<FileTextExtractionResult> {
  if (getImportFileKind(file.name) !== "text") {
    return {
      status: "error",
      message: "Unsupported file type. Upload a .md, .txt, or .rga file.",
    };
  }

  if (file.size === 0) {
    return { status: "error", message: "That file is empty." };
  }

  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    return {
      status: "error",
      message: "That file is too large to import (512KB limit).",
    };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { status: "error", message: "Could not read that file." };
  }

  if (!text.trim()) {
    return { status: "error", message: "That file doesn't contain any text." };
  }

  return { status: "success", text };
}

// A fast rejection for an obviously wrong/oversized file before spending
// time reading and unzipping it — not a substitute for
// `recipe-gallery-import.ts`'s own (authoritative) archive-level safety
// checks below, which run regardless.
export function validateArchiveImportFile(file: File): FileValidationResult {
  if (getImportFileKind(file.name) !== "archive") {
    return {
      status: "error",
      message: "Unsupported file type. Upload a .md, .txt, or .rga file.",
    };
  }
  if (file.size === 0) {
    return { status: "error", message: "That file is empty." };
  }
  if (file.size > MAX_ARCHIVE_IMPORT_FILE_SIZE_BYTES) {
    return {
      status: "error",
      message: "That file is too large to import (150MB limit).",
    };
  }
  return { status: "ok" };
}

// Reads and extracts a `.rga` file entirely client-side — the archive's raw
// bytes never leave the browser. `recipe-gallery-import.ts` re-validates
// its own archive-level caps (entry count, per-entry/total extracted size)
// regardless of the fast pre-check above.
export async function extractRecipesFromArchiveFile(
  file: File,
): Promise<ArchiveImportResult> {
  const validation = validateArchiveImportFile(file);
  if (validation.status !== "ok") {
    return { status: "error", message: validation.message };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return extractRecipesFromArchive(bytes);
}
