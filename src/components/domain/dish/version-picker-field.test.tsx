import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RichVersionPickerField,
  type VersionOption,
} from "@/components/domain/dish/version-picker-field";

/**
 * Frontend interaction-architecture audit (2026-08-28): the Select used to
 * group every saved Version by major line and always display that line's
 * latest minor, so navigating via prev/next within one major line never
 * visibly changed the displayed Version, and a history with only minor
 * bumps exposed just one selectable row. These tests pin the fix — every
 * saved Version is individually selectable and the display tracks
 * whichever one is actually active.
 */
const versions: VersionOption[] = [
  { id: "v1", majorVersion: 1, minorVersion: 0 },
  { id: "v2", majorVersion: 1, minorVersion: 1 },
  { id: "v3", majorVersion: 1, minorVersion: 2 },
];

describe("RichVersionPickerField Version navigation", () => {
  it("shows the actually active Version's label, not the major line's latest", () => {
    render(
      <RichVersionPickerField
        versions={versions}
        currentVersionId="v3"
        value="v2"
        onChangeAction={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("V1.1");
  });

  it("steps to the previous/next Version by id when all Versions share one major line", async () => {
    const user = userEvent.setup();
    const onChangeAction = vi.fn();
    render(
      <RichVersionPickerField
        versions={versions}
        currentVersionId="v3"
        value="v2"
        onChangeAction={onChangeAction}
      />,
    );
    await user.click(screen.getByRole("button", { name: /previous version/i }));
    expect(onChangeAction).toHaveBeenCalledWith("v1");
    await user.click(screen.getByRole("button", { name: /next version/i }));
    expect(onChangeAction).toHaveBeenCalledWith("v3");
  });

  it("disables next at the latest saved Version and previous at the earliest", () => {
    const { rerender } = render(
      <RichVersionPickerField
        versions={versions}
        currentVersionId="v3"
        value="v3"
        onChangeAction={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /no next version/i }),
    ).toBeDisabled();

    rerender(
      <RichVersionPickerField
        versions={versions}
        currentVersionId="v3"
        value="v1"
        onChangeAction={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /no previous version/i }),
    ).toBeDisabled();
  });
});
