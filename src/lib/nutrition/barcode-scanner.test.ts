import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  startBarcodeScan,
  isBarcodeScanSupported,
  BarcodeScanUnsupportedError,
} from "@/lib/nutrition/barcode-scanner";

/**
 * BUILD_PLAN.md Slice 14: `@zxing/browser` is mocked here — no real camera
 * or getUserMedia call is ever made in this suite.
 */
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: vi.fn(),
}));

const mockedReader = vi.mocked(BrowserMultiFormatReader);

function stubMediaDevices(getUserMedia: unknown) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: getUserMedia === undefined ? undefined : { getUserMedia },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  stubMediaDevices(vi.fn());
});

describe("isBarcodeScanSupported", () => {
  it("is false when mediaDevices is entirely unavailable", () => {
    stubMediaDevices(undefined);
    expect(isBarcodeScanSupported()).toBe(false);
  });

  it("is false when getUserMedia is not a function", () => {
    stubMediaDevices(undefined);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {},
    });
    expect(isBarcodeScanSupported()).toBe(false);
  });

  it("is true when getUserMedia is available", () => {
    stubMediaDevices(vi.fn());
    expect(isBarcodeScanSupported()).toBe(true);
  });
});

describe("startBarcodeScan", () => {
  it("throws BarcodeScanUnsupportedError without touching the decoder when unsupported", async () => {
    stubMediaDevices(undefined);
    const video = document.createElement("video");

    await expect(startBarcodeScan(video, vi.fn())).rejects.toBeInstanceOf(
      BarcodeScanUnsupportedError,
    );
    expect(mockedReader).not.toHaveBeenCalled();
  });

  it("decodes retail-format frames from the given video element and forwards a decoded text", async () => {
    stubMediaDevices(vi.fn());
    const video = document.createElement("video");
    const onDecode = vi.fn();
    const innerControls = { stop: vi.fn() };
    const decodeFromConstraints = vi.fn(
      async (
        _constraints: unknown,
        _videoElement: unknown,
        callback: (result: { getText: () => string } | undefined) => void,
      ) => {
        // Simulate a frame with no barcode, then a successful decode.
        callback(undefined);
        callback({ getText: () => "0123456789012" });
        return innerControls;
      },
    );
    mockedReader.mockImplementation(function (this: {
      decodeFromConstraints: typeof decodeFromConstraints;
    }) {
      this.decodeFromConstraints = decodeFromConstraints;
    } as unknown as typeof BrowserMultiFormatReader);

    const controls = await startBarcodeScan(video, onDecode);

    expect(decodeFromConstraints).toHaveBeenCalledWith(
      { video: { facingMode: "environment" } },
      video,
      expect.any(Function),
    );
    expect(onDecode).toHaveBeenCalledTimes(1);
    expect(onDecode).toHaveBeenCalledWith("0123456789012");

    controls.stop();
    expect(innerControls.stop).toHaveBeenCalledTimes(1);
  });
});
