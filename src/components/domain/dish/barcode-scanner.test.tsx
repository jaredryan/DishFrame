import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BarcodeScanner } from "@/components/domain/dish/barcode-scanner";
import {
  startBarcodeScan,
  isBarcodeScanSupported,
  BarcodeScanUnsupportedError,
} from "@/lib/nutrition/barcode-scanner";

/**
 * BUILD_PLAN.md Slice 14: camera/decoder boundary (`@/lib/nutrition/
 * barcode-scanner`) is mocked — no real camera or decoder runs in this
 * suite.
 */
vi.mock("@/lib/nutrition/barcode-scanner", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/nutrition/barcode-scanner")
  >("@/lib/nutrition/barcode-scanner");
  return {
    ...actual,
    isBarcodeScanSupported: vi.fn(() => true),
    startBarcodeScan: vi.fn(),
  };
});

const mockedIsSupported = vi.mocked(isBarcodeScanSupported);
const mockedStart = vi.mocked(startBarcodeScan);

beforeEach(() => {
  mockedIsSupported.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("BarcodeScanner", () => {
  it("requests the camera and forwards a successful decode, stopping the stream", async () => {
    const stop = vi.fn();
    let capturedOnDecode: ((code: string) => void) | undefined;
    mockedStart.mockImplementation(async (_video, onDecode) => {
      capturedOnDecode = onDecode;
      return { stop };
    });
    const onDecode = vi.fn();

    render(<BarcodeScanner onDecode={onDecode} onCancel={vi.fn()} />);

    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));

    capturedOnDecode!("0123456789012");

    expect(onDecode).toHaveBeenCalledWith("0123456789012");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("shows a friendly message and never calls onDecode when the browser is unsupported", async () => {
    mockedIsSupported.mockReturnValue(false);

    render(<BarcodeScanner onDecode={vi.fn()} onCancel={vi.fn()} />);

    expect(
      await screen.findByText(/isn't supported in this browser/),
    ).toBeInTheDocument();
    expect(mockedStart).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /use text search instead/i }),
    ).toBeInTheDocument();
  });

  it("shows a friendly message when camera permission is denied", async () => {
    mockedStart.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );

    render(<BarcodeScanner onDecode={vi.fn()} onCancel={vi.fn()} />);

    expect(
      await screen.findByText(/Camera access was denied/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use text search instead/i }),
    ).toBeInTheDocument();
  });

  it("shows a friendly message when startBarcodeScan reports the browser is unsupported", async () => {
    mockedStart.mockRejectedValue(
      new BarcodeScanUnsupportedError(
        "Camera scanning isn't supported in this browser.",
      ),
    );

    render(<BarcodeScanner onDecode={vi.fn()} onCancel={vi.fn()} />);

    expect(
      await screen.findByText(/isn't supported in this browser/),
    ).toBeInTheDocument();
  });

  it("times out and shows a fallback message when nothing decodes in time", async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    mockedStart.mockResolvedValue({ stop });

    render(<BarcodeScanner onDecode={vi.fn()} onCancel={vi.fn()} />);
    expect(mockedStart).toHaveBeenCalledTimes(1);

    // Flushes the microtask continuation after the awaited
    // `startBarcodeScan()` call so the scan-timeout timer actually gets
    // registered before advancing fake time past it.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(screen.getByText(/Couldn't read a barcode/)).toBeInTheDocument();
    expect(stop).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("stops the camera stream when the component unmounts", async () => {
    const stop = vi.fn();
    mockedStart.mockResolvedValue({ stop });

    const { unmount } = render(
      <BarcodeScanner onDecode={vi.fn()} onCancel={vi.fn()} />,
    );

    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("stops a scanner whose controls resolve after unmount, without touching unmounted state", async () => {
    const stop = vi.fn();
    let resolveStart!: (controls: { stop: () => void }) => void;
    mockedStart.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { unmount } = render(
      <BarcodeScanner onDecode={vi.fn()} onCancel={vi.fn()} />,
    );

    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));

    // Unmount before `startBarcodeScan` resolves — this is the race: the
    // effect's cleanup already ran (with no controls to stop yet) by the
    // time the camera actually starts.
    unmount();
    expect(stop).not.toHaveBeenCalled();

    await act(async () => {
      resolveStart({ stop });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The late-resolved controls must be stopped immediately rather than
    // left owning an active camera stream forever.
    expect(stop).toHaveBeenCalledTimes(1);
    // No "update on an unmounted component" (or any other) React warning —
    // proves the late resolution never touched `setError`/component state.
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("calls onCancel and leaves text search reachable when the user backs out", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    mockedStart.mockResolvedValue({ stop });
    const onCancel = vi.fn();

    render(<BarcodeScanner onDecode={vi.fn()} onCancel={onCancel} />);

    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));

    await user.click(
      screen.getByRole("button", { name: /use text search instead/i }),
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
