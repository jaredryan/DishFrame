/**
 * Synthetic `.rga`/`.rgr` builders for recipe-gallery-import.test.ts —
 * built programmatically at test time rather than committing a real (or
 * even a small binary) `.rga`/`.rgr` fixture file, so nothing here is ever
 * a copy of anyone's real Recipe Gallery data and the exact bytes stay
 * fully reviewable as source. Encodes the minimum of the real formats
 * (reverse-engineered against a real export — see
 * docs/importer-enhancement-implementation.md) needed to exercise
 * recipe-gallery-import.ts: a binary-plist writer covering just the value
 * types an `RGRecipeMetaData` archive actually uses, an `.rgr` "flattened
 * NSFileWrapper" wrapper around it, and a plain STORED-method ZIP writer
 * for the `.rga` container itself.
 */

// ---------------------------------------------------------------------------
// Minimal bplist00 writer
// ---------------------------------------------------------------------------

function encodeIntInline(value: number): Buffer {
  if (value < 256) return Buffer.from([0x10, value]);
  const buf = Buffer.alloc(3);
  buf[0] = 0x11;
  buf.writeUInt16BE(value, 1);
  return buf;
}

class BplistWriter {
  private objects: Buffer[] = [];

  private push(bytes: Buffer): number {
    this.objects.push(bytes);
    return this.objects.length - 1;
  }

  writeAscii(str: string): number {
    const strBytes = Buffer.from(str, "ascii");
    const marker =
      strBytes.length < 15
        ? Buffer.from([0x50 | strBytes.length])
        : Buffer.concat([
            Buffer.from([0x5f]),
            encodeIntInline(strBytes.length),
          ]);
    return this.push(Buffer.concat([marker, strBytes]));
  }

  // A `CF$UID` value (bplist type 0x8) — NSKeyedArchiver's own convention
  // for "this value is an object reference." `targetIndex` is the position
  // within the *decoded* `$objects` JS array (not this writer's own raw
  // object table) the reference points to.
  writeUid(targetIndex: number): number {
    return this.push(Buffer.from([0x80, targetIndex]));
  }

  writeArray(refs: number[]): number {
    const marker =
      refs.length < 15
        ? Buffer.from([0xa0 | refs.length])
        : Buffer.concat([Buffer.from([0xaf]), encodeIntInline(refs.length)]);
    return this.push(Buffer.concat([marker, Buffer.from(refs)]));
  }

  writeDict(pairs: [number, number][]): number {
    const count = pairs.length;
    const marker =
      count < 15
        ? Buffer.from([0xd0 | count])
        : Buffer.concat([Buffer.from([0xdf]), encodeIntInline(count)]);
    const keys = Buffer.from(pairs.map((p) => p[0]));
    const values = Buffer.from(pairs.map((p) => p[1]));
    return this.push(Buffer.concat([marker, keys, values]));
  }

  finalize(topIndex: number): Buffer {
    const chunks: Buffer[] = [Buffer.from("bplist00", "ascii")];
    const offsets: number[] = [];
    let cursor = 8;
    for (const obj of this.objects) {
      offsets.push(cursor);
      chunks.push(obj);
      cursor += obj.length;
    }
    const offsetTableOffset = cursor;
    for (const off of offsets) {
      const buf = Buffer.alloc(2);
      buf.writeUInt16BE(off, 0);
      chunks.push(buf);
    }

    const trailer = Buffer.alloc(32);
    trailer[6] = 2; // offsetIntSize
    trailer[7] = 1; // objectRefSize — fine for this writer's tiny object counts
    trailer.writeBigUInt64BE(BigInt(this.objects.length), 8);
    trailer.writeBigUInt64BE(BigInt(topIndex), 16);
    trailer.writeBigUInt64BE(BigInt(offsetTableOffset), 24);
    chunks.push(trailer);

    return Buffer.concat(chunks);
  }
}

/**
 * A minimal `RGRecipeMetaData`-shaped `NSKeyedArchiver` binary plist —
 * `{Title, Categories, Assets: [{Text, WebURL?}]}` — using direct native
 * bplist values everywhere except `$top.root`, which (matching the real
 * format) must go through a `CF$UID` reference for
 * `recipe-gallery-import.ts`'s resolver to find it.
 */
export function buildRecipeMetadataBplist(opts: {
  title: string;
  categories: string[];
  text: string;
  webUrl?: string;
}): Buffer {
  const w = new BplistWriter();

  const titleIdx = w.writeAscii(opts.title);
  const categoryIdxs = opts.categories.map((c) => w.writeAscii(c));
  const categoriesArrayIdx = w.writeArray(categoryIdxs);

  const textKeyIdx = w.writeAscii("Text");
  const textIdx = w.writeAscii(opts.text);
  const assetPairs: [number, number][] = [[textKeyIdx, textIdx]];
  if (opts.webUrl) {
    const webUrlKeyIdx = w.writeAscii("WebURL");
    const webUrlIdx = w.writeAscii(opts.webUrl);
    assetPairs.push([webUrlKeyIdx, webUrlIdx]);
  }
  const assetDictIdx = w.writeDict(assetPairs);
  const assetsArrayIdx = w.writeArray([assetDictIdx]);

  const titleKeyIdx = w.writeAscii("Title");
  const categoriesKeyIdx = w.writeAscii("Categories");
  const assetsKeyIdx = w.writeAscii("Assets");
  const rootDictIdx = w.writeDict([
    [titleKeyIdx, titleIdx],
    [categoriesKeyIdx, categoriesArrayIdx],
    [assetsKeyIdx, assetsArrayIdx],
  ]);

  // $objects == [rootDict] — a one-element array, so the root's own CF$UID
  // reference below always points at decoded-array index 0.
  const objectsArrayIdx = w.writeArray([rootDictIdx]);
  const rootUidIdx = w.writeUid(0);
  const rootKeyIdx = w.writeAscii("root");
  const topDictIdx = w.writeDict([[rootKeyIdx, rootUidIdx]]);

  const archiverKeyIdx = w.writeAscii("$archiver");
  const archiverValIdx = w.writeAscii("NSKeyedArchiver");
  const topKeyIdx = w.writeAscii("$top");
  const objectsKeyIdx = w.writeAscii("$objects");

  const outerDictIdx = w.writeDict([
    [archiverKeyIdx, archiverValIdx],
    [topKeyIdx, topDictIdx],
    [objectsKeyIdx, objectsArrayIdx],
  ]);

  return w.finalize(outerDictIdx);
}

// ---------------------------------------------------------------------------
// .rgr ("flattened NSFileWrapper") wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a metadata bplist in the minimal shell `recipe-gallery-import.ts`
 * actually reads — the `rtfd` magic plus (for the fast path) a 4-byte
 * little-endian length immediately before the `bplist00` magic. The real
 * format's own header/string-table isn't parsed by the adapter at all, so
 * it isn't replicated here.
 */
export function buildRgrBuffer(
  metadataBplist: Buffer,
  options: { declaredLength?: boolean } = {},
): Buffer {
  const magic = Buffer.from("rtfd", "ascii");
  const padding = Buffer.alloc(12, 0);
  const lengthField = Buffer.alloc(4);
  if (options.declaredLength !== false) {
    lengthField.writeUInt32LE(metadataBplist.length, 0);
  }
  return Buffer.concat([magic, padding, lengthField, metadataBplist]);
}

// ---------------------------------------------------------------------------
// Minimal STORED-method ZIP writer
// ---------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

export function buildZipArchive(
  entries: {
    name: string;
    data: Buffer;
    // Overrides the size declared in both the local and central-directory
    // headers, independent of `data`'s real length — used to exercise the
    // per-entry size-cap guard without allocating an actually-huge buffer.
    // fflate's `unzipSync` filter callback trusts the central directory's
    // declared size for that check, before ever decompressing the entry.
    declaredSize?: number;
  }[],
): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "ascii");
    const crc = crc32(entry.data);
    const size = entry.declaredSize ?? entry.data.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(0, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(size, 18);
    lfh.writeUInt32LE(size, 22);
    lfh.writeUInt16LE(nameBytes.length, 26);
    lfh.writeUInt16LE(0, 28);
    const localEntry = Buffer.concat([lfh, nameBytes, entry.data]);
    localChunks.push(localEntry);

    const cdfh = Buffer.alloc(46);
    cdfh.writeUInt32LE(0x02014b50, 0);
    cdfh.writeUInt16LE(20, 4);
    cdfh.writeUInt16LE(20, 6);
    cdfh.writeUInt16LE(0, 8);
    cdfh.writeUInt16LE(0, 10);
    cdfh.writeUInt16LE(0, 12);
    cdfh.writeUInt16LE(0, 14);
    cdfh.writeUInt32LE(crc, 16);
    cdfh.writeUInt32LE(size, 20);
    cdfh.writeUInt32LE(size, 24);
    cdfh.writeUInt16LE(nameBytes.length, 28);
    cdfh.writeUInt16LE(0, 30);
    cdfh.writeUInt16LE(0, 32);
    cdfh.writeUInt16LE(0, 34);
    cdfh.writeUInt16LE(0, 36);
    cdfh.writeUInt32LE(0, 38);
    cdfh.writeUInt32LE(offset, 42);
    centralChunks.push(Buffer.concat([cdfh, nameBytes]));

    offset += localEntry.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const centralDirectoryOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirectory, eocd]);
}
