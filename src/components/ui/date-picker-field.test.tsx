import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePickerField } from "@/components/ui/date-picker-field";

// Schedule redesign (Meal Plan Schedule modal): `min`/`max` constrain the
// calendar to a Meal Plan's own date range — a day outside it must render
// disabled so it can't be clicked, not merely unstyled (PRODUCT_SPEC.md
// §77's "scheduled dates must fall within the Meal Plan range").
describe("DatePickerField min/max", () => {
  it("disables days before min and after max, leaving in-range days selectable", async () => {
    const user = userEvent.setup();
    render(
      <DatePickerField
        value="2026-08-15"
        onChange={() => {}}
        min="2026-08-10"
        max="2026-08-20"
        ariaLabel="Schedule date"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Schedule date — open calendar" }),
    );

    expect(screen.getByRole("button", { name: "5" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "25" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "10" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "20" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "15" })).not.toBeDisabled();
  });

  it("commits an in-range day and does not respond to a disabled out-of-range day", async () => {
    const user = userEvent.setup();
    let value = "2026-08-15";
    const onChange = (next: string) => {
      value = next;
    };
    const { rerender } = render(
      <DatePickerField
        value={value}
        onChange={onChange}
        min="2026-08-10"
        max="2026-08-20"
        ariaLabel="Schedule date"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Schedule date — open calendar" }),
    );
    await user.click(screen.getByRole("button", { name: "18" }));
    expect(value).toBe("2026-08-18");

    rerender(
      <DatePickerField
        value={value}
        onChange={onChange}
        min="2026-08-10"
        max="2026-08-20"
        ariaLabel="Schedule date"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Schedule date — open calendar" }),
    );
    await user.click(screen.getByRole("button", { name: "25" }));
    // Disabled — the click has no effect, value stays at the last valid pick.
    expect(value).toBe("2026-08-18");
  });
});
