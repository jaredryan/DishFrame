import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartAttachPicker } from "@/components/domain/dish/part-attach-picker";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import {
  listAttachableParts,
  validatePartAttachment,
} from "@/lib/sections/actions";

function render(ui: ReactElement) {
  return rtlRender(
    <ToastProvider>
      {ui}
      <Toaster />
    </ToastProvider>,
  );
}

vi.mock("@/lib/sections/actions", () => ({
  listAttachableParts: vi.fn(),
  validatePartAttachment: vi.fn(),
}));

const { listDishVersionOptions } = vi.hoisted(() => ({
  listDishVersionOptions: vi.fn(async () => ({
    status: "success" as const,
    versions: [{ id: "part-a-v1", majorVersion: 1, minorVersion: 0 }],
    currentVersionId: "part-a-v1" as string | null,
  })),
}));

vi.mock("@/lib/dishes/actions", () => ({
  listDishVersionOptions,
}));

const mockedListAttachableParts = vi.mocked(listAttachableParts);
const mockedValidatePartAttachment = vi.mocked(validatePartAttachment);

const PART_A = {
  id: "part-a",
  stage: "ACTIVE" as const,
  cuisineNames: [],
  currentTitle: "Nuoc Cham",
  currentVersionId: "part-a-v1",
  versionLabel: "V1.0",
  imageAssetId: null,
  tags: ["Vietnamese", "Condiment"],
  rating: { kind: "none" as const },
};
const PART_B = {
  id: "part-b",
  stage: "ACTIVE" as const,
  cuisineNames: [],
  currentTitle: "Chili Oil",
  currentVersionId: "part-b-v1",
  versionLabel: "V1.0",
  imageAssetId: null,
  tags: [],
  rating: { kind: "none" as const },
};

/**
 * Slice 6A browser-review correction pass §5: the picker must never trust a
 * Part list captured once — it fetches fresh every time it opens, so a Part
 * created from `/parts/new` in a separate tab becomes attachable without
 * reloading or losing the parent's draft.
 */
describe("PartAttachPicker", () => {
  beforeEach(() => {
    mockedListAttachableParts.mockReset();
    listDishVersionOptions.mockClear();
    mockedValidatePartAttachment.mockReset();
  });

  it("fetches eligible Parts only once opened, and again — fresh — on every reopening", async () => {
    const user = userEvent.setup();
    mockedListAttachableParts
      .mockResolvedValueOnce({ status: "success", parts: [PART_A] })
      .mockResolvedValueOnce({ status: "success", parts: [PART_A, PART_B] });

    render(
      <PartAttachPicker
        containerDishId="dish-1"
        containerKind="RECIPE"
        onAttach={vi.fn()}
      />,
    );

    // Rendering the trigger alone must not eagerly fetch.
    expect(mockedListAttachableParts).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Attach a part" }));
    expect(await screen.findByText("Nuoc Cham")).toBeInTheDocument();
    expect(mockedListAttachableParts).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Chili Oil")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Attach a part" }));

    // The newly available Part (e.g. just created in another tab) appears
    // — this reopening ran its own request rather than reusing the first.
    expect(await screen.findByText("Chili Oil")).toBeInTheDocument();
    expect(mockedListAttachableParts).toHaveBeenCalledTimes(2);
  });

  it("shows a loading state while the fetch is pending", async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: {
      status: "success";
      parts: (typeof PART_A)[];
    }) => void = () => {};
    mockedListAttachableParts.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(
      <PartAttachPicker
        containerDishId="dish-1"
        containerKind="RECIPE"
        onAttach={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Attach a part" }));

    expect(screen.getByText("Loading Parts…")).toBeInTheDocument();

    resolveFetch({ status: "success", parts: [PART_A] });
    expect(await screen.findByText("Nuoc Cham")).toBeInTheDocument();
  });

  it("shows each Part's tags, via the same rich row every other Recipe/Part picker uses", async () => {
    const user = userEvent.setup();
    mockedListAttachableParts.mockResolvedValue({
      status: "success",
      parts: [PART_A],
    });

    render(
      <PartAttachPicker
        containerDishId="dish-1"
        containerKind="RECIPE"
        onAttach={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Attach a part" }));

    expect(await screen.findByText("Vietnamese")).toBeInTheDocument();
    expect(screen.getByText("Condiment")).toBeInTheDocument();
  });

  it("shows a retryable error state when loading fails, and Retry re-fetches", async () => {
    const user = userEvent.setup();
    mockedListAttachableParts
      .mockResolvedValueOnce({
        status: "error",
        message: "Could not load Parts.",
      })
      .mockResolvedValueOnce({ status: "success", parts: [PART_A] });

    render(
      <PartAttachPicker
        containerDishId="dish-1"
        containerKind="RECIPE"
        onAttach={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Attach a part" }));

    expect(
      await screen.findByText("Could not load Parts."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Nuoc Cham")).toBeInTheDocument();
    expect(mockedListAttachableParts).toHaveBeenCalledTimes(2);
  });

  it("still relies on server-side validation when attaching, not just the fetched list", async () => {
    const user = userEvent.setup();
    mockedListAttachableParts.mockResolvedValue({
      status: "success",
      parts: [PART_A],
    });
    mockedValidatePartAttachment.mockResolvedValue({
      status: "error",
      message: "That Part can't be attached here.",
    });
    const onAttach = vi.fn();

    render(
      <PartAttachPicker
        containerDishId="dish-1"
        containerKind="RECIPE"
        onAttach={onAttach}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Attach a part" }));
    await user.click(await screen.findByText("Nuoc Cham"));
    await user.click(screen.getByRole("button", { name: "Attach" }));

    expect(mockedValidatePartAttachment).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("That Part can't be attached here."),
    ).toBeInTheDocument();
    expect(onAttach).not.toHaveBeenCalled();
  });
});
