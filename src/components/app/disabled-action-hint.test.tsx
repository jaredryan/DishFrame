import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";

/**
 * Final Gate 2 correction pass: regression coverage for the Settings-page
 * scroll jitter's root cause — Radix's `FocusScope` moving DOM focus into
 * a Popover panel on open and back to the trigger on close. This test
 * doesn't simulate scrolling (jsdom has no real scroll/hover physics to
 * test against) — the stable, testable contract is that opening/closing
 * the tap-triggered explanation never moves `document.activeElement` off
 * the trigger, which is exactly what `onOpenAutoFocus`/`onCloseAutoFocus`
 * being prevented guarantees.
 */
describe("DisabledActionHint", () => {
  it("opening and closing the explanation via click never moves focus off the trigger", async () => {
    const user = userEvent.setup();
    render(
      <DisabledActionHint explanation="This action isn't available.">
        <button type="button" disabled aria-label="Delete (unavailable)">
          Delete
        </button>
      </DisabledActionHint>,
    );

    const trigger = screen.getByText("Delete").closest("span")!;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    expect(
      await screen.findByText("This action isn't available."),
    ).toBeInTheDocument();
    // Opening must not have stolen focus into the popover panel.
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    // Closing must not have moved focus away either.
    expect(document.activeElement).toBe(trigger);
  });
});
