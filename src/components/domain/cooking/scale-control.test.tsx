import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScaleControl } from "@/components/domain/cooking/scale-control";

/**
 * PRODUCT_SPEC.md §24.1/§24.2 — natural target-output scaling. Covers the
 * two Slice 8 closeout paths: a usable "Makes" basis computes the
 * multiplier internally from a target output the user types (never asking
 * them to compute it), and the plain-multiplier fallback when no useful
 * authored output exists (§24.2's "must not require servings for a sauce").
 */
describe("ScaleControl", () => {
  it("computes the multiplier from a target output against a usable Makes basis", async () => {
    const user = userEvent.setup();
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={4}
        outputUnit="servings"
        onMultiplierChange={onMultiplierChange}
      />,
    );

    expect(screen.getByText(/makes 4 servings/i)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "8");

    expect(onMultiplierChange).toHaveBeenLastCalledWith(2);
  });

  it("supports any authored output label, not only servings", () => {
    render(
      <ScaleControl
        outputQuantity={12}
        outputUnit="cookies"
        onMultiplierChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/makes 12 cookies/i)).toBeInTheDocument();
  });

  it("falls back to a plain multiplier when no useful output basis exists", async () => {
    const user = userEvent.setup();
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={null}
        outputUnit={null}
        onMultiplierChange={onMultiplierChange}
      />,
    );

    expect(screen.queryByText(/makes/i)).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "3");

    expect(onMultiplierChange).toHaveBeenLastCalledWith(3);
  });

  it("reports null while the field is blank", () => {
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={null}
        outputUnit={null}
        onMultiplierChange={onMultiplierChange}
      />,
    );
    expect(onMultiplierChange).not.toHaveBeenCalled();
  });
});
