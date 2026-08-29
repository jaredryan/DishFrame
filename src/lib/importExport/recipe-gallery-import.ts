import { unzipSync, type UnzipFileInfo } from "fflate";
import {
  buildParseResult,
  buildSections,
  type PasteParseResult,
} from "@/lib/importExport/paste-parser";

/**
 * `.rga` source adapter (multi-recipe), runs entirely client-side. A Recipe
 * Gallery export is a ZIP archive of `.rgr` entries, one per recipe. `.rgr`
 * is a real Apple `NSFileWrapper` "flattened" package (magic `rtfd`) —
 * reverse-engineered against a real ~28MB/65-recipe export (not guessed; see
 * docs/importer-enhancement-implementation.md for what that inspection
 * established). This module's only job is locating each recipe's own
 * `NSKeyedArchiver` binary-plist metadata inside that package and reading
 * its Title/Categories/Assets[].Text/WebURL fields — the actual
 * ingredient/instruction *text* still goes through the exact same
 * `buildSections`/`buildParseResult` pipeline every other source uses, so
 * there is no second recipe-body parser here.
 *
 * Client-side transport correction: a real export can be ~28MB, well past
 * both Next's default Server Action body limit and Vercel Functions' own
 * request/response payload ceiling, so the raw archive is never uploaded —
 * everything below runs in the browser on the selected `File`'s bytes.
 * That ruled out both of this module's original dependencies:
 * - `yauzl` requires Node's `fs`/`zlib`/streams — replaced with `fflate`
 *   (MIT, ~8KB, zero dependencies, the same synchronous algorithm class run
 *   in both Node and the browser) for the ZIP layer.
 * - `bplist-parser` requires Node's `fs`/global `Buffer` — replaced with the
 *   small hand-written binary-plist object decoder below (`parseBplist`),
 *   operating on `Uint8Array`/`DataView` only. It implements the same
 *   public Apple bplist algorithm (CFBinaryPList.c) bplist-parser did,
 *   producing the identical shape (dict → plain object, array → plain
 *   array, `CF$UID` → `{ UID: n }`, string → JS string) — the NSKeyedArchiver
 *   resolver below (`resolveKeyedArchive`) is unchanged, since its input
 *   shape didn't change.
 */

// --- Archive-level safety limits (task §5) ---------------------------------
const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED_BYTES = 300 * 1024 * 1024;

// Only flat, top-level `<uuid>.rgr` entries are ever real Recipe Gallery
// recipe records — this alone rejects directory nesting and path traversal
// (no `/`, no `..`) and silently ignores anything else the archive might
// contain (task: "ignore irrelevant/unexpected files").
const RECIPE_ENTRY_NAME = /^[^/\\]+\.rgr$/i;

export type ArchiveImportDraft =
  | {
      status: "ok";
      sourceRef: string;
      result: PasteParseResult;
      // Importer follow-up pass: Recipe Gallery's `Categories` field
      // ("Vegetables", "Breads", "Uncategorized", …) is an organizational
      // tag, not a cuisine — never mapped into `result.values.cuisine`
      // (or any other persisted field). Surfaced here only as an optional,
      // non-persisted hint the batch UI may show to help the user
      // recognize/classify an item; `null` when the recipe was
      // "Uncategorized" or had no Category at all.
      sourceCategory: string | null;
    }
  | { status: "error"; sourceRef: string; message: string };

export type ArchiveImportResult =
  | { status: "success"; drafts: ArchiveImportDraft[] }
  | { status: "error"; message: string };

class TooManyEntriesError extends Error {}
class ArchiveTooLargeError extends Error {}

type QualifyingEntry = { name: string; oversized: boolean };

/**
 * Two fflate `unzipSync` passes rather than one: `unzipSync`'s `filter`
 * callback runs per central-directory entry *before* that entry is
 * decompressed, so a scan pass (filter always returns `false`) enumerates
 * every entry — enforcing the entry-count/per-entry-size/total-extracted
 * caps against declared sizes — without decompressing anything. A second,
 * per-entry `unzipSync` call (filtering for exactly one name) then does the
 * actual decompression for each entry that passed the scan, each in its own
 * try/catch: `unzipSync` doesn't isolate one corrupt entry's decompression
 * failure from the rest of the archive on its own, so isolation is done at
 * this call-per-entry level instead — one bad `.rgr` must never fail the
 * rest of the batch (task §7).
 */
export function extractRecipesFromArchive(
  bytes: Uint8Array,
): ArchiveImportResult {
  if (bytes.length === 0) {
    return { status: "error", message: "That file is empty." };
  }
  if (bytes.length > MAX_ARCHIVE_BYTES) {
    return {
      status: "error",
      message: "That Recipe Gallery export is too large to import.",
    };
  }

  const qualifying: QualifyingEntry[] = [];
  let entryCount = 0;
  let totalExtracted = 0;

  try {
    unzipSync(bytes, {
      filter(file: UnzipFileInfo) {
        entryCount++;
        if (entryCount > MAX_ARCHIVE_ENTRIES) throw new TooManyEntriesError();
        if (!RECIPE_ENTRY_NAME.test(file.name)) return false;
        // A directory entry (name ends with "/") never matches
        // RECIPE_ENTRY_NAME above, so no separate check is needed for it.

        if (file.originalSize > MAX_ENTRY_BYTES) {
          qualifying.push({ name: file.name, oversized: true });
          return false;
        }
        totalExtracted += file.originalSize;
        if (totalExtracted > MAX_TOTAL_EXTRACTED_BYTES) {
          throw new ArchiveTooLargeError();
        }
        qualifying.push({ name: file.name, oversized: false });
        // Never decompress on the scan pass — the per-entry pass below does
        // that, isolated per entry.
        return false;
      },
    });
  } catch (error) {
    if (error instanceof TooManyEntriesError) {
      return {
        status: "error",
        message: "That Recipe Gallery export has too many entries to import.",
      };
    }
    if (error instanceof ArchiveTooLargeError) {
      return {
        status: "error",
        message: "That Recipe Gallery export is too large to import.",
      };
    }
    return {
      status: "error",
      message:
        "That file doesn't look like a valid Recipe Gallery export (.rga).",
    };
  }

  const drafts: ArchiveImportDraft[] = [];
  for (const entry of qualifying) {
    if (entry.oversized) {
      drafts.push({
        status: "error",
        sourceRef: entry.name,
        message: "This recipe record is too large to import.",
      });
      continue;
    }

    let recordBytes: Uint8Array;
    try {
      const extracted = unzipSync(bytes, {
        filter: (file) => file.name === entry.name,
      });
      const data = extracted[entry.name];
      if (!data) throw new Error("entry missing on targeted extraction pass");
      recordBytes = data;
    } catch {
      drafts.push({
        status: "error",
        sourceRef: entry.name,
        message: "Couldn't read this recipe record.",
      });
      continue;
    }

    drafts.push(parseRecipeRecord(entry.name, recordBytes));
  }

  if (drafts.length === 0) {
    return {
      status: "error",
      message: "No Recipe Gallery recipes were found in that file.",
    };
  }

  return { status: "success", drafts };
}

// One malformed `.rgr` record must never fail the rest of the batch (task
// §4/§8) — every failure path here returns an "error" draft, never throws.
function parseRecipeRecord(
  sourceRef: string,
  buf: Uint8Array,
): ArchiveImportDraft {
  try {
    const record = extractRecipeGalleryRecord(buf);
    if (!record) {
      return {
        status: "error",
        sourceRef,
        message: "Couldn't read this recipe's data.",
      };
    }

    const trimmedText = (record.text ?? "").trim();
    if (!trimmedText) {
      return {
        status: "error",
        sourceRef,
        message: "This recipe has no ingredients or instructions to import.",
      };
    }

    const lines = trimmedText.split(/\r\n|\r|\n/).map((line) => line.trim());
    const { sections, needsReview } = buildSections(lines);
    // Recipe Gallery's Category is an organizational tag, not a cuisine —
    // never fed into `buildParseResult`'s field overrides. Kept only as
    // `sourceCategory` (non-persisted UI metadata) below.
    const category = record.categories.find(
      (c) => c && c.toLowerCase() !== "uncategorized",
    );

    const result = buildParseResult(
      { title: record.title || "Untitled recipe" },
      sections,
      needsReview,
    );

    return {
      status: "ok",
      sourceRef,
      result,
      sourceCategory: category ?? null,
    };
  } catch {
    return {
      status: "error",
      sourceRef,
      message: "Couldn't read this recipe's data.",
    };
  }
}

// ---------------------------------------------------------------------------
// .rgr (NSFileWrapper "flattened" package) framing
// ---------------------------------------------------------------------------

type RecipeGalleryRecord = {
  title: string;
  categories: string[];
  text: string;
  webUrl: string | null;
};

const RGR_MAGIC = "rtfd";
const BPLIST_MAGIC = "bplist00";

function asciiAt(bytes: Uint8Array, start: number, length: number): string {
  if (start < 0 || start + length > bytes.length) return "";
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[start + i]);
  return out;
}

function indexOfAscii(
  haystack: Uint8Array,
  needle: string,
  fromIndex = 0,
): number {
  const needleBytes = Array.from(needle, (c) => c.charCodeAt(0));
  outer: for (
    let i = fromIndex;
    i <= haystack.length - needleBytes.length;
    i++
  ) {
    for (let j = 0; j < needleBytes.length; j++) {
      if (haystack[i + j] !== needleBytes[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Locates and decodes the one `recipe.metadata` entry every `.rgr` package
 * carries — an `NSKeyedArchiver` binary plist. The package's own header
 * (magic + a small fixed-shape string table) isn't needed for this: the
 * metadata blob is found directly by its own `bplist00` magic, and its
 * length by the field immediately preceding that magic in the common case,
 * or (when that entry happens to start on the package's internal
 * page-alignment boundary, observed in real exports) by scanning forward
 * for a self-consistent bplist trailer — a technique that relies only on
 * the bplist format's own published structure, not on any undocumented
 * assumption about `.rgr` framing.
 */
function extractRecipeGalleryRecord(
  buf: Uint8Array,
): RecipeGalleryRecord | null {
  if (buf.length < 8 || asciiAt(buf, 0, 4) !== RGR_MAGIC) {
    return null;
  }

  const bplistOff = indexOfAscii(buf, BPLIST_MAGIC);
  if (bplistOff === -1) return null;

  const metadataSlice = extractSelfDescribingBplist(buf, bplistOff);
  if (!metadataSlice) return null;

  let top: unknown;
  try {
    top = parseBplist(metadataSlice);
  } catch {
    return null;
  }

  if (!isKeyedArchive(top)) return null;

  const resolved = resolveKeyedArchive(top);
  if (!resolved || typeof resolved !== "object") return null;
  const root = resolved as Record<string, unknown>;

  const title = typeof root.Title === "string" ? root.Title.trim() : "";
  const categories = Array.isArray(root.Categories)
    ? root.Categories.filter((c): c is string => typeof c === "string")
    : [];

  const assets = Array.isArray(root.Assets) ? root.Assets : [];
  const asset = assets.find(
    (a): a is Record<string, unknown> =>
      !!a &&
      typeof a === "object" &&
      typeof (a as Record<string, unknown>).Text === "string" &&
      ((a as Record<string, unknown>).Text as string).trim().length > 0,
  );

  return {
    title,
    categories,
    text: asset && typeof asset.Text === "string" ? asset.Text : "",
    webUrl: asset && typeof asset.WebURL === "string" ? asset.WebURL : null,
  };
}

function readUInt32LEAt(buf: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > buf.length) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getUint32(offset, true);
}

function extractSelfDescribingBplist(
  buf: Uint8Array,
  bplistOff: number,
): Uint8Array | null {
  const declaredLen = readUInt32LEAt(buf, bplistOff - 4);
  if (declaredLen && declaredLen > 0 && bplistOff + declaredLen <= buf.length) {
    const candidate = buf.subarray(bplistOff, bplistOff + declaredLen);
    if (isPlausibleBplistTrailer(candidate)) return candidate;
  }

  const maxLen = Math.min(buf.length - bplistOff, 8 * 1024 * 1024);
  const scannedLen = findBplistLengthByTrailerScan(buf, bplistOff, maxLen);
  if (!scannedLen) return null;
  return buf.subarray(bplistOff, bplistOff + scannedLen);
}

// A minimal, self-consistency check against the bplist format's own
// (Apple-published) 32-byte trailer — confirms the buffer's own claimed
// offset table lands exactly at its own end before handing it to the real
// parser, rather than trusting an external length blindly.
function isPlausibleBplistTrailer(buf: Uint8Array): boolean {
  if (buf.length < 40) return false;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const trailerStart = buf.length - 32;
  const offsetIntSize = dv.getUint8(trailerStart + 6);
  const objectRefSize = dv.getUint8(trailerStart + 7);
  if (![1, 2, 4, 8].includes(offsetIntSize)) return false;
  if (![1, 2, 4, 8].includes(objectRefSize)) return false;
  const numObjects = Number(dv.getBigUint64(trailerStart + 8));
  const topObject = Number(dv.getBigUint64(trailerStart + 16));
  const offsetTableOffset = Number(dv.getBigUint64(trailerStart + 24));
  if (numObjects <= 0 || numObjects > 200_000) return false;
  if (topObject >= numObjects) return false;
  if (offsetTableOffset < 8) return false;
  return offsetTableOffset + numObjects * offsetIntSize + 32 === buf.length;
}

function findBplistLengthByTrailerScan(
  buf: Uint8Array,
  start: number,
  maxLen: number,
): number | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let length = 48; length <= maxLen; length++) {
    const trailerStart = start + length - 32;
    if (trailerStart + 32 > buf.length) break;
    const offsetIntSize = dv.getUint8(trailerStart + 6);
    const objectRefSize = dv.getUint8(trailerStart + 7);
    if (![1, 2, 4, 8].includes(offsetIntSize)) continue;
    if (![1, 2, 4, 8].includes(objectRefSize)) continue;
    const numObjects = Number(dv.getBigUint64(trailerStart + 8));
    const topObject = Number(dv.getBigUint64(trailerStart + 16));
    const offsetTableOffset = Number(dv.getBigUint64(trailerStart + 24));
    if (numObjects <= 0 || numObjects > 200_000) continue;
    if (topObject >= numObjects) continue;
    if (offsetTableOffset < 8) continue;
    if (offsetTableOffset + numObjects * offsetIntSize + 32 !== length) {
      continue;
    }
    return length;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal binary-plist (bplist00) object decoder
// ---------------------------------------------------------------------------
//
// Browser-safe replacement for the bplist-parser npm package (Node
// `fs`/`Buffer`-only). Implements the same public Apple bplist algorithm
// (CFBinaryPList.c) that package did — offset table, marker-byte type
// dispatch, variable-length encoding — over `Uint8Array`/`DataView` only,
// producing the identical shape: dict → plain object, array → plain array,
// `CF$UID` → `{ UID: n }`, ASCII/UTF-16 string → JS string. Only the value
// types RGRecipeMetaData's fields actually use are exercised by this
// adapter (string/array/dict/UID/int), but every marker type is handled so
// an unused field (e.g. `DateCreated`, `Rating`) never breaks parsing of the
// fields that matter.

function readUIntAt(dv: DataView, offset: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i++) value = value * 256 + dv.getUint8(offset + i);
  return value;
}

function parseBplist(bytes: Uint8Array): unknown {
  if (bytes.length < 40) throw new Error("buffer too small for a bplist");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const trailerStart = bytes.length - 32;
  const offsetIntSize = dv.getUint8(trailerStart + 6);
  const objectRefSize = dv.getUint8(trailerStart + 7);
  const numObjects = Number(dv.getBigUint64(trailerStart + 8));
  const topObject = Number(dv.getBigUint64(trailerStart + 16));
  const offsetTableOffset = Number(dv.getBigUint64(trailerStart + 24));

  if (numObjects <= 0 || numObjects > 200_000) {
    throw new Error("implausible object count");
  }

  const offsetTable: number[] = new Array(numObjects);
  for (let i = 0; i < numObjects; i++) {
    offsetTable[i] = readUIntAt(
      dv,
      offsetTableOffset + i * offsetIntSize,
      offsetIntSize,
    );
  }

  function variableLength(offset: number): {
    length: number;
    dataOffset: number;
  } {
    const marker = dv.getUint8(offset);
    const info = marker & 0x0f;
    if (info !== 0x0f) return { length: info, dataOffset: offset + 1 };
    const intMarker = dv.getUint8(offset + 1);
    const intSize = 2 ** (intMarker & 0x0f);
    const length = readUIntAt(dv, offset + 2, intSize);
    return { length, dataOffset: offset + 2 + intSize };
  }

  function utf16BEString(offset: number, charLength: number): string {
    let out = "";
    for (let i = 0; i < charLength; i++) {
      out += String.fromCharCode(dv.getUint16(offset + i * 2, false));
    }
    return out;
  }

  function parseObject(index: number, depth: number): unknown {
    if (depth > 64 || index < 0 || index >= offsetTable.length) return null;
    const offset = offsetTable[index];
    const marker = dv.getUint8(offset);
    const objType = (marker & 0xf0) >> 4;
    const objInfo = marker & 0x0f;

    switch (objType) {
      case 0x0:
        if (objInfo === 0x8) return false;
        if (objInfo === 0x9) return true;
        return null; // null / fill byte
      case 0x1:
        return readUIntAt(dv, offset + 1, 2 ** objInfo);
      case 0x8:
        return { UID: readUIntAt(dv, offset + 1, objInfo + 1) };
      case 0x2:
        return objInfo === 2
          ? dv.getFloat32(offset + 1)
          : dv.getFloat64(offset + 1);
      case 0x3: {
        const seconds = dv.getFloat64(offset + 1);
        return new Date(978307200000 + seconds * 1000); // 2001-01-01T00:00:00Z
      }
      case 0x4: {
        const { length, dataOffset } = variableLength(offset);
        return bytes.subarray(dataOffset, dataOffset + length);
      }
      case 0x5: {
        const { length, dataOffset } = variableLength(offset);
        return asciiAt(bytes, dataOffset, length);
      }
      case 0x6: {
        const { length, dataOffset } = variableLength(offset);
        return utf16BEString(dataOffset, length);
      }
      case 0xa: {
        const { length, dataOffset } = variableLength(offset);
        const arr: unknown[] = new Array(length);
        for (let i = 0; i < length; i++) {
          const ref = readUIntAt(
            dv,
            dataOffset + i * objectRefSize,
            objectRefSize,
          );
          arr[i] = parseObject(ref, depth + 1);
        }
        return arr;
      }
      case 0xd: {
        const { length, dataOffset } = variableLength(offset);
        const dict: Record<string, unknown> = {};
        for (let i = 0; i < length; i++) {
          const keyRef = readUIntAt(
            dv,
            dataOffset + i * objectRefSize,
            objectRefSize,
          );
          const valRef = readUIntAt(
            dv,
            dataOffset + length * objectRefSize + i * objectRefSize,
            objectRefSize,
          );
          const key = parseObject(keyRef, depth + 1);
          dict[String(key)] = parseObject(valRef, depth + 1);
        }
        return dict;
      }
      default:
        return null;
    }
  }

  return parseObject(topObject, 0);
}

// ---------------------------------------------------------------------------
// Minimal NSKeyedArchiver object-graph resolver
// ---------------------------------------------------------------------------
//
// `parseBplist` decodes the raw binary plist but leaves NSKeyedArchiver's
// own UID object-reference graph unresolved — `$objects`/`$top`/`CF$UID`
// are plain Apple bplist concepts (represented here as `{ UID: n }`), not
// something the decoder above resolves into the original class instances.
// This walks that graph for exactly the shapes this module needs
// (NSString/NSMutableString via `NS.string`, NSArray/NSMutableArray via
// `NS.objects`, and plain `NSDictionary`-style key/value objects) — not a
// general-purpose NSKeyedArchiver implementation, just enough to read
// `RGRecipeMetaData`/`RGAsset`.

type KeyedArchiveTop = {
  $objects: unknown[];
  $top: { root?: { UID: number }; data?: { UID: number } };
};

function isKeyedArchive(value: unknown): value is KeyedArchiveTop {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.$archiver === "NSKeyedArchiver" &&
    Array.isArray(obj.$objects) &&
    !!obj.$top &&
    typeof obj.$top === "object"
  );
}

function isUidRef(value: unknown): value is { UID: number } {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array) &&
    Object.keys(value as object).length === 1 &&
    typeof (value as Record<string, unknown>).UID === "number"
  );
}

function resolveKeyedArchive(top: KeyedArchiveTop): unknown {
  const objects = top.$objects;
  const rootRef = top.$top.root ?? top.$top.data;
  if (!rootRef) return null;

  function resolve(index: number, depth: number): unknown {
    if (depth > 24 || index < 0 || index >= objects.length) return null;
    const raw = objects[index];
    if (raw === "$null") return null;
    if (raw === null || typeof raw !== "object") return raw;
    if (raw instanceof Uint8Array) return raw;
    if (isUidRef(raw)) return resolve(raw.UID, depth + 1);

    const obj = raw as Record<string, unknown>;
    if (typeof obj["NS.string"] === "string") return obj["NS.string"];
    if (obj["NS.data"] instanceof Uint8Array) return obj["NS.data"];
    if (Array.isArray(obj["NS.objects"])) {
      return obj["NS.objects"].map((ref) =>
        isUidRef(ref) ? resolve(ref.UID, depth + 1) : ref,
      );
    }
    if (typeof obj.$classname === "string") return null; // class descriptor, not data

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "$class") continue;
      out[key] = isUidRef(value) ? resolve(value.UID, depth + 1) : value;
    }
    return out;
  }

  return resolve(rootRef.UID, 0);
}
