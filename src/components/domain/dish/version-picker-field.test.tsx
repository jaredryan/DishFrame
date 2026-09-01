import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RichVersionPickerField,
  type VersionOption,
} from "@/components/domain/dish/version-picker-field";

/**
 * Nav/details QA batch item 6: the old prev/next-arrows-plus-dropdown
 * combination is replaced by one universal searchable Version picker — a
 * single combobox listing every saved Version, typed digits narrow it.
 */
const versions: VersionOption[] = [
  { id: "v1", majorVersion: 1, minorVersion: 0 },
  { id: "v2", majorVersion: 1, minorVersion: 1 },
  { id: "v3", majorVersion: 1, minorVersion: 2 },
  { id: "v4", majorVersion: 2, minorVersion: 0 },
];

describe("RichVersionPickerField", () => {
  it("shows the actually active Version's label on the trigger", () => {
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

  it("opens to every saved Version, newest first, marking the current one", async () => {
    const user = userEvent.setup();
    render(
      <RichVersionPickerField
        versions={versions}
        currentVersionId="v3"
        value="v2"
        onChangeAction={() => {}}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "V2.0",
      "V1.2 (current)",
      "V1.1",
      "V1.0",
    ]);
  });

  it("narrows the list by typed major/minor digits", async () => {
    const user = userEvent.setup();
    render(
      <RichVersionPickerField
        versions={versions}
        currentVersionId="v3"
        value="v2"
        onChangeAction={() => {}}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("textbox"), "1.2");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("V1.2");
  });

  it("selecting a Version calls onChangeAction with its id and closes the list", async () => {
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
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "V2.0" }));
    expect(onChangeAction).toHaveBeenCalledWith("v4");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
