import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  startBarcodeScan,
  isBarcodeScanSupported,
  BarcodeScanUnsupportedError,
  type BarcodeScanControls,
} from "@/lib/nutrition/barcode-scanner";

const SCAN_TIMEOUT_MS = 20000;

function mapScanError(caught: unknown): string {
  if (caught instanceof BarcodeScanUnsupportedError) return caught.message;
  if (caught instanceof DOMException) {
    if (
      caught.name === "NotAllowedError" ||
      caught.name === "PermissionDeniedError"
    ) {
      return "Camera access was denied. Use text search instead.";
    }
    if (caught.name === "NotFoundError") {
      return "No camera was found. Use text search instead.";
    }
  }
  return "Couldn't start the camera. Use text search instead.";
}

/**
 * BUILD_PLAN.md Slice 14: camera-permission-gated scanner view. Mounting
 * this component is itself the "explicit user action" gate — the parent
 * (`FdcSearchPicker`) only renders it after the user clicks "Scan
 * barcode," never on load. Every exit path (decode success, permission
 * denied, unsupported browser, decode timeout, cancel, or unmount) stops
 * the camera stream and leaves the caller free to fall back to text
 * search.
 */
export function BarcodeScanner({
  onDecode,
  onCancel,
}: {
  onDecode: (code: string) => void;
  onCancel: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let controls: BarcodeScanControls | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function stop() {
      controls?.stop();
      controls = null;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    async function begin() {
      if (!isBarcodeScanSupported()) {
        setError("Camera scanning isn't supported in this browser.");
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      try {
        const started = await startBarcodeScan(video, (code) => {
          if (cancelled) return;
          stop();
          onDecode(code);
        });
        if (cancelled) {
          started.stop();
          return;
        }
        controls = started;
        timeoutId = setTimeout(() => {
          stop();
          if (!cancelled) {
            setError("Couldn't read a barcode. Try text search instead.");
          }
        }, SCAN_TIMEOUT_MS);
      } catch (caught) {
        if (cancelled) return;
        setError(mapScanError(caught));
      }
    }

    begin();

    return () => {
      cancelled = true;
      stop();
    };
  }, [onDecode]);

  return (
    <div className="flex flex-col gap-3">
      <p
        className={
          error
            ? "text-destructive-text text-sm"
            : "text-muted-foreground text-xs"
        }
        aria-live="polite"
      >
        {error ?? "Point the camera at a retail barcode (UPC/EAN)."}
      </p>
      {!error && (
        <video
          ref={videoRef}
          className="bg-muted aspect-video w-full rounded-md object-cover"
          muted
          playsInline
        />
      )}
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>
        Use text search instead
      </Button>
    </div>
  );
}
