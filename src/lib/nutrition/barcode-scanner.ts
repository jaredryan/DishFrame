import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

/**
 * BUILD_PLAN.md Slice 14 / ARCHITECTURE_PROPOSAL.md §L: entirely
 * client-side barcode decoding (no server round-trip for the scan itself —
 * only the decoded GTIN/UPC is later sent through the existing Slice 13
 * `searchFdc` action). Isolated in its own module so the camera-permission
 * UI (`components/domain/dish/barcode-scanner.tsx`) can mock this boundary
 * in tests instead of the raw `@zxing/*`/`getUserMedia` APIs.
 */

const RETAIL_BARCODE_FORMATS = [
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
];

export class BarcodeScanUnsupportedError extends Error {}

export function isBarcodeScanSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export type BarcodeScanControls = { stop: () => void };

/**
 * Requests camera access (the permission prompt fires here — callers must
 * only invoke this in response to an explicit user action, never on
 * mount/page load) and continuously decodes UPC/EAN frames from
 * `videoElement` until `onDecode` fires once or the returned controls'
 * `stop()` is called. `stop()` also stops the underlying media stream
 * tracks (`@zxing/browser`'s `IScannerControls.stop`), so callers don't
 * need to touch `MediaStream`/`getUserMedia` directly.
 */
export async function startBarcodeScan(
  videoElement: HTMLVideoElement,
  onDecode: (code: string) => void,
): Promise<BarcodeScanControls> {
  if (!isBarcodeScanSupported()) {
    throw new BarcodeScanUnsupportedError(
      "Camera scanning isn't supported in this browser.",
    );
  }

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, RETAIL_BARCODE_FORMATS);
  const reader = new BrowserMultiFormatReader(hints);

  const controls = await reader.decodeFromConstraints(
    { video: { facingMode: "environment" } },
    videoElement,
    (result) => {
      // The continuous-scan callback also fires (with `result` undefined)
      // on every frame that doesn't contain a barcode — expected per-frame
      // noise, not a failure to surface.
      if (result) onDecode(result.getText());
    },
  );

  return { stop: () => controls.stop() };
}
