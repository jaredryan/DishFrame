import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartAttachPicker } from "@/components/domain/dish/part-attach-picker";
import {
  listAttachableParts,
  listAttachablePartVersions,
  validatePartAttachment,
} from "@/lib/sections/actions";

vi.mock("@/lib/sections/actions", () => ({
  listAttachableParts: vi.fn(),
  listAttachablePartVersions: vi.fn(),
  validatePartAttachment: vi.fn(),
}));

const mockedListAttachableParts = vi.mocked(listAttachableParts);
const mockedListAttachablePartVersions = vi.mocked(listAttachablePartVersions);
const mockedValidatePartAttachment = vi.mocked(validatePartAttachment);

const PART_A = {
  id: "part-a",
  currentTitle: "Nuoc Cham",
  currentVersionId: "part-a-v1",
  tags: ["Vietnamese", "Condiment"],
};
const PART_B = {
  id: "part-b",
  currentTitle: "Chili Oil",
  currentVersionId: "part-b-v1",
  tags: [],
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
    mockedListAttachablePartVersions.mockReset();
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

  it("shows each Part's tags, restrained to a small overflow-friendly set", async () => {
    const user = userEvent.setup();
    const heavilyTagged = {
      id: "part-c",
      currentTitle: "House Marinade",
      currentVersionId: "part-c-v1",
      tags: ["Savory", "Make-ahead", "Freezer-friendly", "Umami", "Spicy"],
    };
    mockedListAttachableParts.mockResolvedValue({
      status: "success",
      parts: [PART_A, heavilyTagged],
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

    // Five tags on House Marinade — only the first three render, plus a
    // compact "+2" overflow indicator rather than blowing out the row.
    expect(screen.getByText("Savory")).toBeInTheDocument();
    expect(screen.getByText("Make-ahead")).toBeInTheDocument();
    expect(screen.getByText("Freezer-friendly")).toBeInTheDocument();
    expect(screen.queryByText("Umami")).not.toBeInTheDocument();
    expect(screen.queryByText("Spicy")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
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
    mockedListAttachablePartVersions.mockResolvedValue({
      status: "success",
      versions: [{ id: "part-a-v1", majorVersion: 1, minorVersion: 0 }],
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
