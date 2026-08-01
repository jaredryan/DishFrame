# Slice 14 — Optional barcode lookup

Closes PRODUCT_SPEC.md §54.7. A convenience entry point into the exact
Slice 13 FDC branded-food lookup — no new routes, schema, or migrations.

## Scanner approach and dependency

Added `@zxing/browser` + `@zxing/library` (peer dep), a maintained,
actively-updated (2026) pure-JS barcode decoder — matches
ARCHITECTURE_PROPOSAL.md's own description of this slice ("a JS/WASM
UPC/EAN decoder reading camera frames — no server round-trip for the scan
itself"). Chosen over the native `BarcodeDetector` API because that API is
unsupported in enough browsers (notably Safari) that "unsupported browser"
would otherwise be the common case rather than the documented fallback
edge case. Decoding is restricted to retail 1D formats only (`UPC_A`,
`UPC_E`, `EAN_13`, `EAN_8`) via `DecodeHintType.POSSIBLE_FORMATS`.

New module `src/lib/nutrition/barcode-scanner.ts` isolates all
`@zxing/*`/`getUserMedia` usage behind `isBarcodeScanSupported()` and
`startBarcodeScan(videoElement, onDecode)` — the only two functions
anything else in the app touches. This is the single component tests mock
instead of the raw camera/decoder APIs.

## Permission behavior

`getUserMedia` (via `@zxing/browser`'s `decodeFromConstraints`) is only
ever called from `startBarcodeScan`, which is only ever called from
`BarcodeScanner`'s mount effect — and `BarcodeScanner` is only mounted
when the user clicks the new "Scan barcode" button inside
`FdcSearchPicker` (`fdc-search-picker.tsx`), never on page/editor load.
`isBarcodeScanSupported()` is checked first; an unsupported browser never
calls `getUserMedia` at all.

## Decode-to-FDC handoff and apply-flow reuse

`FdcSearchPicker` gained a `mode: "search" | "scan"` state and a second
trigger button ("Scan barcode") alongside the existing "Search USDA
FoodData Central" button — both open the same dialog. In scan mode, the
dialog body swaps to the new `BarcodeScanner` component
(`components/domain/dish/barcode-scanner.tsx`); on a successful decode,
`FdcSearchPicker.handleScanDecode` switches back to search mode, sets the
query field to the decoded value, and calls the **exact same**
`performSearch` helper (`searchFdc({ query: <decoded code> })`) that
backs the text-search form submit — USDA FDC's search index resolves
GTIN/UPC values as a query string for Branded foods, so no new server
action, parameter, or FDC client change was needed. Result selection,
`applyFdcResult`, and `onApply` into the editor's (still-unsaved) form
state are 100% the unmodified Slice 13 path — a scanned result and a
typed-search result are indistinguishable once they reach the results
list.

## Fallback behavior

Every failure path returns to the same dialog's usable text-search UI,
never a dead end:

- **Unsupported browser**: `BarcodeScanner` shows "Camera scanning isn't
  supported in this browser," camera is never requested.
- **Permission denied** (`NotAllowedError`/`PermissionDeniedError`): "Camera
  access was denied."
- **No camera found** (`NotFoundError`): "No camera was found."
- **Decode timeout** (20s of no successful decode): "Couldn't read a
  barcode."
- **No FDC match** for a decoded code: falls through to the existing
  Slice 13 "No results" message — no separate code path.
- **Upstream/FDC failure** after a decode: the existing Slice 13
  rate-limit/timeout/upstream error mapping in `nutrition/actions.ts`,
  unchanged.

Every one of these states leaves a "Use text search instead" button (scan
mode) or, once back in search mode, the ordinary search input — both
fully usable immediately.

## Camera-stream cleanup

`@zxing/browser`'s returned `IScannerControls.stop()` stops the
underlying `MediaStream`'s video tracks (confirmed by reading
`BrowserCodeReader`'s compiled source — `stop()` calls
`disposeMediaStream`/`cleanVideoSource`, not just the decode loop).
`BarcodeScanner`'s effect calls `stop()` on: successful decode, the 20s
timeout, any thrown error, the cleanup function `useEffect` runs on
unmount, and — since the parent switches `mode` away from `"scan"` on
cancel/dialog-close — that mode switch itself unmounts `BarcodeScanner`,
triggering the same cleanup path. There is exactly one place that owns
`stop()`; no other code touches the stream.

**Unmount-before-init-resolves race:** `startBarcodeScan()` is async
(`getUserMedia` can take a moment), so unmount can run before it resolves.
The effect's `cancelled` flag, set by the cleanup function, is checked
immediately after the `await` resolves — if the component already
unmounted, the branch calls `started.stop()` directly on the just-resolved
controls (instead of assigning them to the effect-scoped `controls`
variable the *cleanup* stops) and returns before registering the
scan-timeout timer or touching any state. This was already correct as of
the initial implementation; a focused regression test
(`barcode-scanner.test.tsx`, "stops a scanner whose controls resolve
after unmount...") delays `startBarcodeScan`'s resolution past an
`unmount()` call and asserts `stop()` fires with no React state-update
warning — confirmed to fail (via a temporary local mutation, reverted)
if that `cancelled` check is bypassed.

## Schema/migration

None — Build Plan explicitly specifies none for this slice.

## Tests added

- `src/lib/nutrition/barcode-scanner.test.ts` (5): support detection
  (mediaDevices absent/present), unsupported-throws-before-touching-
  decoder, and a decode round-trip through a mocked `@zxing/browser`
  (`decodeFromConstraints` called with `facingMode: "environment"`,
  per-frame `undefined` results ignored, a real result forwarded,
  `stop()` propagates to the underlying controls).
- `src/components/domain/dish/barcode-scanner.test.tsx` (7): successful
  decode + stream stop, unsupported browser, permission denied,
  `BarcodeScanUnsupportedError` from the lib layer, decode timeout (fake
  timers), stream stop on unmount, and cancel-returns-to-text-search.
- `src/components/domain/dish/fdc-search-picker.test.tsx` (4, new file):
  decoded barcode → `searchFdc({ query: <code> })` → result list →
  `applyFdcResult` → `onApply` (the full handoff + apply-flow reuse); no
  FDC match after a scan falls back to the existing "No results" UI with
  text search still enabled; unsupported-browser and permission-denied
  scan attempts both leave the dialog's text search reachable.

All camera, decoder, and FDC boundaries are mocked — no real camera or
live USDA request in any test.

## Targeted commands actually run

`vitest run` on: `src/lib/nutrition/barcode-scanner.test.ts`,
`src/components/domain/dish/barcode-scanner.test.tsx`,
`src/components/domain/dish/fdc-search-picker.test.tsx`,
`src/components/domain/dish/nutrition-fields.test.tsx`,
`src/components/domain/dish/dish-editor.test.tsx` (unaffected,
reconfirmed green), `src/lib/nutrition/fdc-client.test.ts`,
`src/lib/nutrition/actions.test.ts` (unaffected, reconfirmed green). 44 +
38 tests passed across these files. No `tsc --noEmit`, repo-wide
lint/format, build, `verify:*`, or Playwright — left to the owner's fresh
verification session.

## Browser support / limitations

- Depends on `getUserMedia` + `@zxing/browser`'s frame-decode loop —
  broadly supported anywhere `getUserMedia` works (this is materially
  wider than the native `BarcodeDetector` API's support, which is the
  reason it wasn't used).
- No torch/flashlight control, multi-camera picker, or manual "capture
  frame" fallback — out of scope per "smallest maintained approach, no
  generalized scanning framework."
- GTIN/UPC-as-query-string FDC matching depends on USDA's own search
  index quality for a given Branded product; a decode that doesn't
  resolve to a Branded FDC hit surfaces as an ordinary empty search
  result, not a distinguishable error.
- Real-device/cross-browser camera QA (iOS Safari, Android Chrome, a
  desktop browser without a camera) is explicitly left to the owner per
  the Build Plan's manual QA targets — not exercised by any automated
  test here.

## Proportionality call

Implementation stayed small and fully reused Slice 13's search/apply
path — one new dependency, one new lib module, one new component, and an
additive change to `FdcSearchPicker`. No concrete compatibility or
dependency blocker surfaced during implementation, so this was built
rather than deferred to Tier 3. The one open risk is real-device camera
behavior, which is exactly the manual QA the Build Plan already calls
for — not a reason to defer on its own.

**Owner intervention recommendation: Brief sanity check**, focused on
real-device camera QA (the one thing this pass could not verify
automatically): on at least one phone browser, click "Scan barcode,"
grant permission, and confirm a real retail barcode resolves to a
branded FDC result end-to-end into the nutrition fields; separately deny
permission and confirm the dialog falls back to text search cleanly. No
open product/design questions — decoding format scope, fallback copy, and
the reuse-not-duplicate search path all follow directly from §54.7 and
the Slice 13 architecture.
