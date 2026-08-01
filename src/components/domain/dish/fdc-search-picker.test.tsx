import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FdcSearchPicker } from "@/components/domain/dish/fdc-search-picker";
import { searchFdc, applyFdcResult } from "@/lib/nutrition/actions";

/**
 * BUILD_PLAN.md Slice 14: the barcode entry point into `FdcSearchPicker`.
 * `searchFdc`/`applyFdcResult` (Slice 13's server actions) and the camera/
 * decoder boundary (`@/lib/nutrition/barcode-scanner`) are both mocked —
 * no live camera or USDA request happens in this suite.
 */

vi.mock("@/lib/nutrition/actions", () => ({
  searchFdc: vi.fn(),
  applyFdcResult: vi.fn(),
}));

vi.mock("@/lib/nutrition/barcode-scanner", () => ({
  isBarcodeScanSupported: vi.fn(() => true),
  startBarcodeScan: vi.fn(),
  BarcodeScanUnsupportedError: class BarcodeScanUnsupportedError extends Error {},
}));

const mockedSearchFdc = vi.mocked(searchFdc);
const mockedApplyFdcResult = vi.mocked(applyFdcResult);

async function openScanDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Scan barcode" }));
  return screen.findByRole("dialog");
}

beforeEach(async () => {
  const { isBarcodeScanSupported } =
    await import("@/lib/nutrition/barcode-scanner");
  vi.mocked(isBarcodeScanSupported).mockReturnValue(true);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("FdcSearchPicker — barcode scan entry point", () => {
  it("hands a decoded barcode to the existing FDC search and lets the user apply a branded result", async () => {
    const { startBarcodeScan } =
      await import("@/lib/nutrition/barcode-scanner");
    const mockedStart = vi.mocked(startBarcodeScan);
    let decode!: (code: string) => void;
    mockedStart.mockImplementation(async (_video, onDecode) => {
      decode = onDecode;
      return { stop: vi.fn() };
    });
    mockedSearchFdc.mockResolvedValue({
      status: "success",
      results: [
        {
          fdcId: 9001,
          description: "Peanut Butter, creamy",
          dataType: "Branded",
          brandName: "Acme",
          brandOwner: "Acme Foods",
        },
      ],
    });
    mockedApplyFdcResult.mockResolvedValue({
      status: "success",
      nutrition: {
        fdcId: 9001,
        sourceName: "Peanut Butter, creamy",
        calories: 190,
        protein: 7,
        carbs: 8,
        fat: 16,
        nutritionBasis: "PER_OUTPUT_UNIT",
        nutritionBasisQuantity: 32,
        nutritionBasisUnit: "g",
        moreNutrients: [],
      },
    });
    const onApply = vi.fn();
    const user = userEvent.setup();

    render(<FdcSearchPicker onApply={onApply} />);
    const dialog = await openScanDialog(user);

    decode("012345678905");

    expect(mockedSearchFdc).toHaveBeenCalledWith({ query: "012345678905" });
    const resultButton = await within(dialog).findByText(
      "Peanut Butter, creamy",
    );
    await user.click(resultButton);

    expect(mockedApplyFdcResult).toHaveBeenCalledWith({ fdcId: 9001 });
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ fdcId: 9001, calories: 190 }),
    );
  });

  it("falls back to a usable text search when a scanned barcode has no FDC match", async () => {
    const { startBarcodeScan } =
      await import("@/lib/nutrition/barcode-scanner");
    const mockedStart = vi.mocked(startBarcodeScan);
    let decode!: (code: string) => void;
    mockedStart.mockImplementation(async (_video, onDecode) => {
      decode = onDecode;
      return { stop: vi.fn() };
    });
    mockedSearchFdc.mockResolvedValue({ status: "success", results: [] });
    const user = userEvent.setup();

    render(<FdcSearchPicker onApply={vi.fn()} />);
    const dialog = await openScanDialog(user);

    decode("000000000000");

    expect(await within(dialog).findByText(/No results/)).toBeInTheDocument();
    // Text search remains usable after a no-match scan.
    expect(
      within(dialog).getByLabelText("Search USDA FoodData Central"),
    ).toBeEnabled();
  });

  it("returns to usable text search when the browser doesn't support scanning", async () => {
    const { isBarcodeScanSupported } =
      await import("@/lib/nutrition/barcode-scanner");
    vi.mocked(isBarcodeScanSupported).mockReturnValue(false);
    const user = userEvent.setup();

    render(<FdcSearchPicker onApply={vi.fn()} />);
    const dialog = await openScanDialog(user);

    expect(
      await within(dialog).findByText(/isn't supported in this browser/),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /use text search instead/i }),
    );

    expect(
      within(dialog).getByLabelText("Search USDA FoodData Central"),
    ).toBeInTheDocument();
  });

  it("returns to usable text search when camera permission is denied", async () => {
    const { isBarcodeScanSupported, startBarcodeScan } =
      await import("@/lib/nutrition/barcode-scanner");
    vi.mocked(isBarcodeScanSupported).mockReturnValue(true);
    vi.mocked(startBarcodeScan).mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );
    const user = userEvent.setup();

    render(<FdcSearchPicker onApply={vi.fn()} />);
    const dialog = await openScanDialog(user);

    expect(
      await within(dialog).findByText(/Camera access was denied/),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /use text search instead/i }),
    );

    expect(
      within(dialog).getByLabelText("Search USDA FoodData Central"),
    ).toBeInTheDocument();
  });
});
